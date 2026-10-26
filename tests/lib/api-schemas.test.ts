import { describe, it, expect } from "vitest";
import { AnalyzeBodySchema, AnalyzeFeedbackBodySchema, RefineBodySchema, SaveBodySchema, TailorBodySchema } from "@/lib/api-schemas";
import { RestrictionDraftSchema, emptyRequest, type PipelineResult } from "@/lib/engine/types";
import { couplet, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: couplet(), conditions: [], restrictions: [], unavailableEquipment: [], tailored: identityResult(couplet()),
  findings: [], feedbackHistory: [], model: "fake",
};
const condition = { key: "test_condition", side: null, severity: "moderate", evidence: "embarazada" };
const hoist = {
  site: "shoulder", side: null, movements: ["Test Hoist"], mechanisms: [], positions: [], evidence: "no hoist",
  replacements: [{ blockIndex: 0, componentIndex: 0, replacement: "Test Clean" }],
};

describe("API bodies", () => {
  it("accepts a pasted workout to analyze", () => {
    expect(AnalyzeBodySchema.safeParse({ rawText: "Test Workout", request: emptyRequest() }).success).toBe(true);
  });

  it("rejects an empty or oversized paste", () => {
    expect(AnalyzeBodySchema.safeParse({ rawText: "", request: emptyRequest() }).success).toBe(false);
    expect(AnalyzeBodySchema.safeParse({ rawText: "x".repeat(20001), request: emptyRequest() }).success).toBe(false);
  });

  it("tailors an analyzed session with today's conditions and answered restrictions", () => {
    const body = (restrictions: unknown[]) => ({
      analysis: { original: couplet(), unavailableEquipment: [] }, confirmed: [condition], restrictions, request: emptyRequest(),
    });
    expect(TailorBodySchema.safeParse(body([hoist])).success).toBe(true);
    // An older client without replacements still validates.
    const bare = RestrictionDraftSchema.parse(hoist); // zod strips the replacements
    expect(TailorBodySchema.parse(body([bare])).restrictions[0].replacements).toEqual([]);
    expect(TailorBodySchema.safeParse(body([{ ...hoist, site: "toe" }])).success).toBe(false);
    expect(TailorBodySchema.safeParse(body(Array.from({ length: 21 }, () => hoist))).success).toBe(false);
  });

  it("requires feedback to analyze or refine", () => {
    const session = { original: couplet(), conditions: [], restrictions: [hoist], unavailableEquipment: [] };
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
