import { MAX_RESULT_BODY_CHARS, TailorBodySchema } from "@/lib/api-schemas";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { handleEngineRequest } from "@/lib/engine-route";

export const maxDuration = 120;
const budgetMs = (maxDuration - 10) * 1000; // model time; leaves a margin to answer the athlete

export function POST(req: Request) {
  return handleEngineRequest(req, {
    schema: TailorBodySchema,
    budgetMs,
    maxBodyChars: MAX_RESULT_BODY_CHARS,
    kind: "tailor",
    run: (body, { provider, ...ctx }) => runTailorPipeline(provider, {
      original: body.analysis.original, unavailableEquipment: body.analysis.unavailableEquipment,
      confirmed: body.confirmed, restrictions: body.restrictions, request: body.request, ...ctx,
    }),
  });
}
