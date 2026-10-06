import { describe, it, expect } from "vitest";
import { AnalyzeBodySchema, AnalyzeFeedbackBodySchema, RefineBodySchema, SaveBodySchema, TailorBodySchema } from "@/lib/api-schemas";
import { emptyRequest, type PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};
const shoulder = { key: "shoulder_impingement", side: "right", severity: "mild", evidence: "sore" };

describe("API bodies", () => {
  it("accepts a paste and a manual workout to analyze", () => {
    expect(AnalyzeBodySchema.safeParse({ input: { kind: "paste", rawText: "Fran" }, request: emptyRequest() }).success).toBe(true);
    expect(AnalyzeBodySchema.safeParse({
      input: { kind: "manual", workout: { name: null, blocks: [{ title: null, format: "amrap", scheme: null, timeDomainMinutes: 10, coachingNotes: null, components: [] }] } },
      request: emptyRequest(),
    }).success).toBe(true);
  });

  it("rejects an empty or oversized paste", () => {
    expect(AnalyzeBodySchema.safeParse({ input: { kind: "paste", rawText: "" }, request: emptyRequest() }).success).toBe(false);
    expect(AnalyzeBodySchema.safeParse({ input: { kind: "paste", rawText: "x".repeat(20001) }, request: emptyRequest() }).success).toBe(false);
  });

  it("tailors an analyzed session with the confirmed conditions, including athlete-added ones", () => {
    const body = (confirmed: unknown[]) => ({ analysis: { original: fran(), unavailableEquipment: [] }, confirmed, request: emptyRequest() });
    expect(TailorBodySchema.safeParse(body([shoulder, { key: "no_hanging", side: null, severity: "moderate", evidence: null }])).success).toBe(true);
    expect(TailorBodySchema.safeParse(body([{ ...shoulder, severity: "unbearable" }])).success).toBe(false);
    expect(TailorBodySchema.safeParse(body(Array.from({ length: 21 }, () => shoulder))).success).toBe(false);
    // Suggestions the athlete removed; optional, so an older client still validates.
    expect(TailorBodySchema.parse(body([])).dismissed).toEqual([]);
    expect(TailorBodySchema.safeParse({ ...body([]), dismissed: [{ key: "shoulder_impingement", evidence: "sore" }] }).success).toBe(true);
    expect(TailorBodySchema.safeParse({ ...body([]), dismissed: ["shoulder_impingement"] }).success).toBe(false);
  });

  it("requires feedback to analyze or refine", () => {
    expect(AnalyzeFeedbackBodySchema.safeParse({ feedback: "  " }).success).toBe(false);
    expect(AnalyzeFeedbackBodySchema.safeParse({ feedback: "too easy" }).success).toBe(true);
    const refine = (feedback: string) => ({ previous: result, feedback, confirmed: [], unavailableEquipment: [], request: emptyRequest() });
    expect(RefineBodySchema.safeParse(refine("")).success).toBe(false);
    expect(RefineBodySchema.safeParse(refine("too easy")).success).toBe(true);
  });

  it("saves a full pipeline result", () => {
    expect(SaveBodySchema.safeParse({ result, request: emptyRequest() }).success).toBe(true);
    expect(SaveBodySchema.safeParse({ result: { ...result, model: "" }, request: emptyRequest() }).success).toBe(false);
  });
});
