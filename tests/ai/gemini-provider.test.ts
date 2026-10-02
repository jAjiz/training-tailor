import { describe, it, expect } from "vitest";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
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
