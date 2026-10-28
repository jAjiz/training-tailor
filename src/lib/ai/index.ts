import type { LlmProvider } from "./provider";
import { GeminiProvider } from "./gemini-provider";
import { withValidationRetry } from "./retry";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** PDF import reads multi-page column layouts, which the lite models get wrong; GEMINI_IMPORT_MODEL overrides it. */
export const IMPORT_GEMINI_MODEL = "gemini-3.8-flash";

export function getProvider(model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL): LlmProvider {
  const which = process.env.AI_PROVIDER ?? "gemini";
  if (which !== "gemini") throw new Error(`Unknown AI_PROVIDER: ${which}`);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return withValidationRetry(new GeminiProvider(key, model));
}
