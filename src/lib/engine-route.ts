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

interface EngineRoute<T> {
  schema: z.ZodType<T>;
  maxBodyChars: number;
  kind: UsageKind;
  run: (body: T, ctx: EngineContext) => Promise<PipelineResult>;
}

/**
 * The shared shape of the engine endpoints: session, bounded body, provider, quota, then the NDJSON stream.
 * Unrecognized movements are queued after the result is sent.
 */
export async function handleEngineRequest<T>(req: Request, route: EngineRoute<T>): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const raw = await readJsonBody(req, route.maxBodyChars);
  if (!raw.ok) return jsonError(raw.code, raw.status);
  const body = route.schema.safeParse(raw.value);
  if (!body.success) return jsonError("invalid_request", 400);

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return jsonError("engine_unavailable", 503);
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, route.kind, dailyLimit());
  if (!quota.allowed) return jsonError("quota_exceeded", 429);

  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return engineStreamResponse(
    (onProgress) => route.run(body.data, { provider, profile, domain, onProgress }),
    (result) => recordUnrecognized(prismaUnrecognizedStore, result),
  );
}
