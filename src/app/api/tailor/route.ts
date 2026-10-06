import { MAX_RESULT_BODY_CHARS, TailorBodySchema } from "@/lib/api-schemas";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { handleEngineRequest } from "@/lib/engine-route";

export const maxDuration = 120;

export function POST(req: Request) {
  return handleEngineRequest(req, {
    schema: TailorBodySchema,
    maxBodyChars: MAX_RESULT_BODY_CHARS,
    kind: "tailor",
    run: (body, { provider, ...ctx }) => runTailorPipeline(provider, {
      original: body.analysis.original, unavailableEquipment: body.analysis.unavailableEquipment,
      confirmed: body.confirmed, dismissed: body.dismissed, request: body.request, ...ctx,
    }),
  });
}
