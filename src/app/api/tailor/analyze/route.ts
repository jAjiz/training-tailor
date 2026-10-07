import { AnalyzeBodySchema, MAX_TAILOR_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeWorkout } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;
const budgetMs = (maxDuration - 10) * 1000; // model time; leaves a margin to answer the athlete

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeBodySchema,
    budgetMs,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    run: (body, { provider, ...ctx }) => analyzeWorkout(provider, { rawText: body.rawText, request: body.request, ...ctx }),
  });
}
