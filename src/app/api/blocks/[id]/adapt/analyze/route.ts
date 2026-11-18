import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chargeQuota, loadAdaptContext, prepareEngine, refusalResponse } from "@/lib/engine-route";
import { jsonError } from "@/lib/http";
import { AdaptMessageInput } from "@/lib/training/adaptation-types";
import { adaptAnalyze } from "@/lib/training/services/adaptations";
import { getAdaptableBlock } from "@/lib/training/services/tailoring";

export const maxDuration = 60;

const MAX_BODY_CHARS = 16_000;

/**
 * One athlete message on a block: a text (counted as "analyze", plus one more when the block had to be analyzed
 * again) or button answers (free). Returns the questions still open. Never leaks exception text.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const p = await prepareEngine(req, { schema: AdaptMessageInput, maxBodyChars: MAX_BODY_CHARS });
  if (!p.ok) return p.response;
  const loaded = await loadAdaptContext(p.userId);
  if (!loaded.ok) return loaded.response;
  const { athlete, ctx } = loaded;
  const { id } = await params;
  try {
    if ("text" in p.body) {
      await getAdaptableBlock(prisma, athlete, id); // refuse before spending quota
      const refused = await chargeQuota(p.userId, "analyze");
      if (refused) return refused;
    }
    const { questions, reanalyzed } = await adaptAnalyze(prisma, p.provider, athlete, id, p.body, ctx);
    if (reanalyzed) await chargeQuota(p.userId, "analyze");
    return NextResponse.json({ questions });
  } catch (e) {
    const refusal = refusalResponse(e);
    if (refusal) return refusal;
    console.error("adaptation analysis failed", e);
    return jsonError("engine_failed", 502);
  }
}
