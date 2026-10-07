import { describe, it, expect } from "vitest";
import { AnalyzeBodySchema, AnalyzeFeedbackBodySchema, RefineBodySchema, SaveBodySchema, TailorBodySchema } from "@/lib/api-schemas";
import { RestrictionDraftSchema, emptyRequest, type PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], restrictions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};
const pregnancy = { key: "pregnancy", side: null, severity: "moderate", evidence: "embarazada" };
const snatch = {
  site: "shoulder", side: null, movements: ["Power Snatch"], mechanisms: [], positions: [], evidence: "no snatch",
  replacements: [{ blockIndex: 0, componentIndex: 0, replacement: "Power Clean" }],
};

describe("API bodies", () => {
  it("accepts a pasted workout to analyze", () => {
    expect(AnalyzeBodySchema.safeParse({ rawText: "Fran", request: emptyRequest() }).success).toBe(true);
  });

  it("rejects an empty or oversized paste", () => {
    expect(AnalyzeBodySchema.safeParse({ rawText: "", request: emptyRequest() }).success).toBe(false);
    expect(AnalyzeBodySchema.safeParse({ rawText: "x".repeat(20001), request: emptyRequest() }).success).toBe(false);
  });

  it("tailors an analyzed session with today's conditions and answered restrictions", () => {
    const body = (restrictions: unknown[]) => ({
      analysis: { original: fran(), unavailableEquipment: [] }, confirmed: [pregnancy], restrictions, request: emptyRequest(),
    });
    expect(TailorBodySchema.safeParse(body([snatch])).success).toBe(true);
    // An older client without replacements still validates.
    const bare = RestrictionDraftSchema.parse(snatch); // zod strips the replacements
    expect(TailorBodySchema.parse(body([bare])).restrictions[0].replacements).toEqual([]);
    expect(TailorBodySchema.safeParse(body([{ ...snatch, site: "toe" }])).success).toBe(false);
    expect(TailorBodySchema.safeParse(body(Array.from({ length: 21 }, () => snatch))).success).toBe(false);
  });

  it("requires feedback to analyze or refine", () => {
    const session = { original: fran(), conditions: [], restrictions: [snatch], unavailableEquipment: [] };
    const analyze = (feedback: string) => ({ feedback, session, request: emptyRequest() });
    expect(AnalyzeFeedbackBodySchema.safeParse(analyze("  ")).success).toBe(false);
    expect(AnalyzeFeedbackBodySchema.safeParse(analyze("too easy")).success).toBe(true);
    expect(AnalyzeFeedbackBodySchema.safeParse({ feedback: "too easy" }).success).toBe(false);
    const refine = (feedback: string) => ({ previous: result, feedback, confirmed: [], restrictions: [], unavailableEquipment: [], request: emptyRequest() });
    expect(RefineBodySchema.safeParse(refine("")).success).toBe(false);
    expect(RefineBodySchema.safeParse(refine("too easy")).success).toBe(true);
  });

  it("saves a full pipeline result", () => {
    expect(SaveBodySchema.safeParse({ result, request: emptyRequest() }).success).toBe(true);
    expect(SaveBodySchema.safeParse({ result: { ...result, model: "" }, request: emptyRequest() }).success).toBe(false);
  });
});
