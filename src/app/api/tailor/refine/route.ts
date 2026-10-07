import { MAX_RESULT_BODY_CHARS, RefineBodySchema } from "@/lib/api-schemas";
import { runRefinePipeline } from "@/lib/engine/pipeline";
import { handleEngineRequest } from "@/lib/engine-route";

export const maxDuration = 120;
const budgetMs = (maxDuration - 10) * 1000; // model time; leaves a margin to answer the athlete

export function POST(req: Request) {
  return handleEngineRequest(req, {
    schema: RefineBodySchema,
    budgetMs,
    maxBodyChars: MAX_RESULT_BODY_CHARS,
    kind: "refine",
    run: (body, { provider, ...ctx }) => runRefinePipeline(provider, {
      previous: body.previous, feedback: body.feedback, confirmed: body.confirmed, restrictions: body.restrictions,
      unavailableEquipment: body.unavailableEquipment, request: body.request, ...ctx,
    }),
  });
}
