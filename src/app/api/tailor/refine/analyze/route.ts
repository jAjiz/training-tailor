import { AnalyzeFeedbackBodySchema, MAX_RESULT_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeFeedback } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;
const budgetMs = (maxDuration - 10) * 1000; // model time; leaves a margin to answer the athlete

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeFeedbackBodySchema,
    budgetMs,
    maxBodyChars: MAX_RESULT_BODY_CHARS,
    run: (body, { provider, ...ctx }) => analyzeFeedback(provider, { ...body, ...ctx }),
  });
}
