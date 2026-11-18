import { z } from "zod";
import { prisma } from "@/lib/db";
import { chargeQuota, loadAdaptContext, prepareEngine, refusalResponse } from "@/lib/engine-route";
import { engineStreamResponse } from "@/lib/engine-stream";
import { jsonError } from "@/lib/http";
import { adaptTailor, adaptTailorKind } from "@/lib/training/services/adaptations";
import { recordUnrecognized } from "@/lib/unrecognized";
import { prismaUnrecognizedStore } from "@/lib/unrecognized-store";

export const maxDuration = 120;

const MAX_BODY_CHARS = 1_000;

/**
 * Tailors the block for the conversation's current turn as an NDJSON stream: "tailor" for the first proposal,
 * "refine" after it. Unrecognized movements are queued after the result is sent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const p = await prepareEngine(req, { schema: z.object({}), maxBodyChars: MAX_BODY_CHARS });
  if (!p.ok) return p.response;
  const loaded = await loadAdaptContext(p.userId);
  if (!loaded.ok) return loaded.response;
  const { athlete, ctx } = loaded;
  const { id } = await params;
  let kind: "tailor" | "refine";
  try {
    kind = await adaptTailorKind(prisma, athlete, id);
  } catch (e) {
    const refusal = refusalResponse(e);
    if (refusal) return refusal;
    console.error("adaptation check failed", e);
    return jsonError("internal", 500);
  }
  const refused = await chargeQuota(p.userId, kind);
  if (refused) return refused;
  return engineStreamResponse(
    (onProgress) => adaptTailor(prisma, p.provider, athlete, id, { ...ctx, onProgress }),
    (result) => recordUnrecognized(prismaUnrecognizedStore, result),
  );
}
