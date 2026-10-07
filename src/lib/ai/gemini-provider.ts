import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseStructured, StructuredOutputError, type GenerateStructuredArgs, type LlmProvider } from "./provider";

// The only file that imports the Gemini SDK.
export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, readonly model: string) {
    // Without retryOptions the SDK never retries; transient 408/429/5xx (e.g. 503 "high demand")
    // get bounded backoff that fits inside the route's maxDuration.
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { retryOptions: { attempts: 4, initialDelay: 1, maxDelay: 8 } },
    });
  }

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        systemInstruction: args.systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(args.schema),
      },
    });
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
