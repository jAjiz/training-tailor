import { MAX_TAILOR_BODY_CHARS, TailorBodySchema } from "@/lib/api-schemas";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { handleEngineRequest } from "@/lib/engine-route";

export const maxDuration = 120;

export function POST(req: Request) {
  return handleEngineRequest(req, {
    schema: TailorBodySchema,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    kind: "tailor",
    run: (body, { provider, ...ctx }) =>
      runTailorPipeline(provider, { input: body.input, request: body.request, ...ctx }),
  });
}
