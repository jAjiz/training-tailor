import { z } from "zod";

/** A file sent to the model alongside the prompt (e.g. a PDF). */
export interface FileAttachment {
  mimeType: string;
  data: Uint8Array;
}

export interface GenerateStructuredArgs<T> {
  systemPrompt?: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string; // names the response for providers that need it; keys FakeProvider scripts
  attachments?: FileAttachment[];
  /** Little reasoning for copy-like tasks, where thinking only adds latency. Providers without the knob ignore it. */
  lowThinking?: boolean;
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
