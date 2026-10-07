import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  EngineTimeoutError, parseStructured, StructuredOutputError, type GenerateStructuredArgs, type LlmProvider,
} from "./provider";

export interface GeminiOptions {
  attemptTimeoutMs?: number; // one HTTP attempt; a timed-out attempt is retried like a 503
  deadline?: number; // epoch ms: the athlete's request must be answered by then (inside the route's maxDuration)
  fetch?: typeof globalThis.fetch; // tests
  retryDelaySeconds?: number; // first backoff; tests shorten it
}

export const ATTEMPT_TIMEOUT_MS = 30_000;

const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

// The only file that imports the Gemini SDK.
export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenAI;
  private readonly deadline: number | undefined;
  // The call in flight (a request's calls are sequential), named in each attempt's log line.
  private call = { name: "", attempts: 0 };

  constructor(apiKey: string, readonly model: string, options: GeminiOptions = {}) {
    this.deadline = options.deadline;
    const realFetch = options.fetch ?? globalThis.fetch;
    // Every attempt is logged, so a slow day shows whether one attempt hung or several were refused (503).
    const loggingFetch: typeof globalThis.fetch = async (input, init) => {
      const n = ++this.call.attempts;
      const started = Date.now();
      try {
        const res = await realFetch(input, init);
        console.info(`gemini attempt ${n} ${this.call.name} status=${res.status} ${Date.now() - started}ms`);
        return res;
      } catch (e) {
        console.info(`gemini attempt ${n} ${this.call.name} ${isAbort(e) ? "timed out" : "failed"} ${Date.now() - started}ms`);
        throw e;
      }
    };
    this.client = new GoogleGenAI({
      apiKey,
      // Without retryOptions the SDK never retries; transient 408/429/5xx (e.g. 503 "high demand") and timed-out
      // attempts get bounded backoff. `timeout` bounds each attempt, not the whole sequence.
      httpOptions: {
        retryOptions: { attempts: 4, initialDelay: options.retryDelaySeconds ?? 1, maxDelay: 8 },
        timeout: options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS,
        fetch: loggingFetch,
      },
    });
  }

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    const remaining = this.deadline === undefined ? undefined : this.deadline - Date.now();
    if (remaining !== undefined && remaining <= 0) throw new EngineTimeoutError();
    this.call = { name: args.schemaName, attempts: 0 };
    const started = Date.now();
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: args.prompt }] }],
        config: {
          systemInstruction: args.systemPrompt,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(args.schema),
          // The request's budget: it cuts the attempt in flight and stops further retries.
          ...(remaining !== undefined ? { abortSignal: AbortSignal.timeout(remaining) } : {}),
        },
      });
    } catch (e) {
      if (!isAbort(e)) throw e;
      console.warn(`gemini call ${args.schemaName} ${this.model} timed out after ${Date.now() - started}ms attempts=${this.call.attempts}`);
      throw new EngineTimeoutError();
    }
    const u = response.usageMetadata;
    console.info(
      `gemini call ${args.schemaName} ${this.model} ${Date.now() - started}ms attempts=${this.call.attempts} ` +
      `tokens=${u?.promptTokenCount ?? "?"}/${u?.candidatesTokenCount ?? "?"}`,
    );
    const text = response.text;
    if (!text) throw new StructuredOutputError("GeminiProvider: empty response", "The response was empty.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StructuredOutputError("GeminiProvider: invalid JSON", `The response was not valid JSON: ${text.slice(0, 200)}`);
    }
    return parseStructured(args.schema, parsed, "GeminiProvider");
  }
}
