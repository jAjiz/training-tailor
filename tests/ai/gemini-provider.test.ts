import { describe, it, expect } from "vitest";
import { z } from "zod";
import { GeminiProvider, geminiContents } from "@/lib/ai/gemini-provider";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai";
import { StimulusProfileSchema } from "@/lib/engine/types";

const key = process.env.GEMINI_API_KEY;
const maybe = key ? describe : describe.skip;

maybe("GeminiProvider (integration)", () => {
  it("returns schema-valid structured output with enums and nulls", async () => {
    const provider = new GeminiProvider(key!, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    const result = await provider.generateStructured({
      prompt: "Classify the stimulus of: 5 rounds for time of 400 m run and 15 air squats. Use quality conditioning or strength.",
      schema: StimulusProfileSchema,
      schemaName: "StimulusProfile",
    });
    expect(result.quality).toBe("conditioning");
  }, 60000);
});

describe("geminiContents", () => {
  it("puts attachments as base64 inline data before the text", () => {
    const c = geminiContents({
      prompt: "p",
      schema: z.object({}),
      schemaName: "X",
      attachments: [{ mimeType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }],
    });
    expect(c).toEqual([{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: "JVBERg==" } }, { text: "p" }] }]);
  });

  it("sends only the text without attachments", () => {
    expect(geminiContents({ prompt: "p", schema: z.object({}), schemaName: "X" }))
      .toEqual([{ role: "user", parts: [{ text: "p" }] }]);
  });
});
