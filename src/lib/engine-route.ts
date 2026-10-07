import { NextResponse } from "next/server";
import type { z } from "zod";
import { getProvider } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import type { ProgressStage } from "@/lib/engine/pipeline";
import type { AthleteProfile, PipelineResult } from "@/lib/engine/types";
import { engineStreamResponse } from "@/lib/engine-stream";
import { jsonError, readJsonBody } from "@/lib/http";
import { consumeQuota, dailyLimit, type UsageKind } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";
import { recordUnrecognized } from "@/lib/unrecognized";
import { prismaUnrecognizedStore } from "@/lib/unrecognized-store";

export interface EngineContext {
  provider: LlmProvider;
  profile: AthleteProfile;
  domain: DomainData;
  onProgress: (stage: ProgressStage) => void;
}

interface RouteCheck<T> {
  schema: z.ZodType<T>;
  maxBodyChars: number;
  kind: UsageKind;
}

type Prepared<T> = { ok: true; userId: string; body: T; provider: LlmProvider } | { ok: false; response: Response };

/** Session, bounded body, validation, provider and quota: shared by every engine endpoint. */
async function prepare<T>(req: Request, check: RouteCheck<T>): Promise<Prepared<T>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, response: jsonError("unauthorized", 401) };
  const raw = await readJsonBody(req, check.maxBodyChars);
  if (!raw.ok) return { ok: false, response: jsonError(raw.code, raw.status) };
  const body = check.schema.safeParse(raw.value);
  if (!body.success) return { ok: false, response: jsonError("invalid_request", 400) };

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return { ok: false, response: jsonError("engine_unavailable", 503) };
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, check.kind, dailyLimit());
  if (!quota.allowed) return { ok: false, response: jsonError("quota_exceeded", 429) };
  return { ok: true, userId, body: body.data, provider };
}

interface EngineRoute<T> extends RouteCheck<T> {
  run: (body: T, ctx: EngineContext) => Promise<PipelineResult>;
}

/** Phase 2 (tailor, refine): the NDJSON stream; unrecognized movements are queued after the result is sent. */
export async function handleEngineRequest<T>(req: Request, route: EngineRoute<T>): Promise<Response> {
  const p = await prepare(req, route);
  if (!p.ok) return p.response;
  const [profile, domain] = await Promise.all([loadProfile(p.userId), getDomainData()]);
  return engineStreamResponse(
    (onProgress) => route.run(p.body, { provider: p.provider, profile, domain, onProgress }),
    (result) => recordUnrecognized(prismaUnrecognizedStore, result),
  );
}

interface AnalyzeRoute<T, R> {
  schema: z.ZodType<T>;
  maxBodyChars: number;
  run: (body: T, ctx: { provider: LlmProvider; profile: AthleteProfile; domain: DomainData }) => Promise<R>;
}

/** Phase 1 (analyze): one model call, plain JSON; counted as "analyze". Never leaks exception text. The profile
 * (injuries, equipment) shapes the clarifying questions. */
export async function handleAnalyzeRequest<T, R>(req: Request, route: AnalyzeRoute<T, R>): Promise<Response> {
  const p = await prepare(req, { schema: route.schema, maxBodyChars: route.maxBodyChars, kind: "analyze" });
  if (!p.ok) return p.response;
  try {
    const [profile, domain] = await Promise.all([loadProfile(p.userId), getDomainData()]);
    return NextResponse.json(await route.run(p.body, { provider: p.provider, profile, domain }));
  } catch (e) {
    console.error("analysis failed", e);
    return jsonError("engine_failed", 502);
  }
}
