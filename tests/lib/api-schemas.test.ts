import { describe, it, expect } from "vitest";
import { RefineBodySchema, SaveBodySchema, TailorBodySchema } from "@/lib/api-schemas";
import { emptyRequest, type PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};

describe("API bodies", () => {
  it("accepts a paste and a manual tailor request", () => {
    expect(TailorBodySchema.safeParse({ input: { kind: "paste", rawText: "Fran" }, request: emptyRequest() }).success).toBe(true);
    expect(TailorBodySchema.safeParse({
      input: { kind: "manual", workout: { name: null, blocks: [{ title: null, format: "amrap", scheme: null, timeDomainMinutes: 10, coachingNotes: null, components: [] }] } },
      request: emptyRequest(),
    }).success).toBe(true);
  });

  it("rejects an empty or oversized paste", () => {
    expect(TailorBodySchema.safeParse({ input: { kind: "paste", rawText: "" }, request: emptyRequest() }).success).toBe(false);
    expect(TailorBodySchema.safeParse({ input: { kind: "paste", rawText: "x".repeat(20001) }, request: emptyRequest() }).success).toBe(false);
  });

  it("requires feedback to refine", () => {
    expect(RefineBodySchema.safeParse({ previous: result, feedback: "", request: emptyRequest() }).success).toBe(false);
    expect(RefineBodySchema.safeParse({ previous: result, feedback: "too easy", request: emptyRequest() }).success).toBe(true);
  });

  it("saves a full pipeline result", () => {
    expect(SaveBodySchema.safeParse({ result, request: emptyRequest() }).success).toBe(true);
    expect(SaveBodySchema.safeParse({ result: { ...result, model: "" }, request: emptyRequest() }).success).toBe(false);
  });
});
