import type { LlmProvider } from "./provider";
import { GeminiProvider } from "./gemini-provider";
import { withValidationRetry } from "./retry";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function getProvider(): LlmProvider {
  const which = process.env.AI_PROVIDER ?? "gemini";
  if (which !== "gemini") throw new Error(`Unknown AI_PROVIDER: ${which}`);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return withValidationRetry(new GeminiProvider(key, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL));
}
