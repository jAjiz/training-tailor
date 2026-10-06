import { AnalyzeFeedbackBodySchema, MAX_TAILOR_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeFeedback } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeFeedbackBodySchema,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    run: (body, { provider, domain }) => analyzeFeedback(provider, body.feedback, domain),
  });
}
