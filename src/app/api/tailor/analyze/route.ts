import { AnalyzeBodySchema, MAX_TAILOR_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeWorkout } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeBodySchema,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    run: (body, { provider, ...ctx }) => analyzeWorkout(provider, { rawText: body.rawText, request: body.request, ...ctx }),
  });
}
