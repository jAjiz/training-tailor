import { getProvider } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { TailorBodySchema } from "@/lib/api-schemas";
import { getDomainData } from "@/lib/domain/repository";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { engineStreamResponse } from "@/lib/engine-stream";
import { jsonError } from "@/lib/http";
import { consumeQuota, dailyLimit } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const body = TailorBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("invalid_request", 400);

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return jsonError("engine_unavailable", 503);
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, "tailor", dailyLimit());
  if (!quota.allowed) return jsonError("quota_exceeded", 429);

  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return engineStreamResponse((onProgress) =>
    runTailorPipeline(provider, { input: body.data.input, profile, request: body.data.request, domain, onProgress }),
  );
}
