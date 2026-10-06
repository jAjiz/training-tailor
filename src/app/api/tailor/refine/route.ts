import { MAX_RESULT_BODY_CHARS, RefineBodySchema } from "@/lib/api-schemas";
import { runRefinePipeline } from "@/lib/engine/pipeline";
import { handleEngineRequest } from "@/lib/engine-route";

export const maxDuration = 120;

export function POST(req: Request) {
  return handleEngineRequest(req, {
    schema: RefineBodySchema,
    maxBodyChars: MAX_RESULT_BODY_CHARS,
    kind: "refine",
    run: (body, { provider, ...ctx }) => runRefinePipeline(provider, {
      previous: body.previous, feedback: body.feedback, confirmed: body.confirmed, dismissed: body.dismissed,
      unavailableEquipment: body.unavailableEquipment, request: body.request, ...ctx,
    }),
  });
}
