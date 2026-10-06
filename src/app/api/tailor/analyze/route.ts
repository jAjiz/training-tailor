import { AnalyzeBodySchema, MAX_TAILOR_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeWorkout } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeBodySchema,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    run: (body, { provider, domain }) =>
      analyzeWorkout(provider, { input: body.input, situation: body.request.situation, domain }),
  });
}
