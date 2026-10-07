import { z } from "zod";

export interface GenerateStructuredArgs<T> {
  systemPrompt?: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string; // names the response for providers that need it; keys FakeProvider scripts
}

export interface LlmProvider {
  readonly model: string;
  /** Send the prompt and return a value validated against `schema`. */
  generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T>;
}

/** The model answered, but not with schema-valid JSON. `details` is fed back on retry. */
export class StructuredOutputError extends Error {
  constructor(message: string, readonly details: string) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export function parseStructured<T>(schema: z.ZodType<T>, value: unknown, source: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StructuredOutputError(`${source}: response failed schema validation`, z.prettifyError(result.error));
  }
  return result.data;
}
