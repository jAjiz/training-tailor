import { getProvider } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { MAX_RESULT_BODY_CHARS, RefineBodySchema } from "@/lib/api-schemas";
import { getDomainData } from "@/lib/domain/repository";
import { runRefinePipeline } from "@/lib/engine/pipeline";
import { engineStreamResponse } from "@/lib/engine-stream";
import { jsonError, readJsonBody } from "@/lib/http";
import { consumeQuota, dailyLimit } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";
import { recordUnrecognized } from "@/lib/unrecognized";
import { prismaUnrecognizedStore } from "@/lib/unrecognized-store";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const raw = await readJsonBody(req, MAX_RESULT_BODY_CHARS);
  if (!raw.ok) return jsonError(raw.code, raw.status);
  const body = RefineBodySchema.safeParse(raw.value);
  if (!body.success) return jsonError("invalid_request", 400);

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return jsonError("engine_unavailable", 503);
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, "refine", dailyLimit());
  if (!quota.allowed) return jsonError("quota_exceeded", 429);

  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return engineStreamResponse(
    (onProgress) => runRefinePipeline(provider, {
      previous: body.data.previous, feedback: body.data.feedback, profile, request: body.data.request, domain, onProgress,
    }),
    (result) => recordUnrecognized(prismaUnrecognizedStore, result),
  );
}
