import { describe, it, expect } from "vitest";
import {
  AthleteProfileSchema, PasteAnalysisSchema, PipelineResultSchema,
  StructuredWorkoutSchema, TailorRequestSchema, TailoringDraftSchema, TailoringResultSchema, emptyProfile, emptyRequest,
} from "@/lib/engine/types";
import { couplet, coupletDraft, identityResult, split, toTailoringDraft } from "../fixtures/workouts";

describe("engine schemas", () => {
  it("parses single- and multi-block sessions", () => {
    expect(StructuredWorkoutSchema.parse(couplet()).blocks[0].components[0].canonical).toBe("Test Combo");
    expect(StructuredWorkoutSchema.parse(split()).blocks).toHaveLength(2);
  });

  it("parses a paste analysis with restrictions and non-pain conditions", () => {
    const a = PasteAnalysisSchema.parse({
      workout: coupletDraft(),
      restrictions: [{ site: "shoulder", side: "right", movements: ["Test Hoist"], mechanisms: [], positions: [], evidence: "me duele el hombro" }],
      conditions: [{ key: "test_condition", side: null, severity: "moderate", evidence: "embarazada" }],
      unavailableEquipment: ["rower"],
    });
    expect(a.restrictions[0].side).toBe("right");
    expect(a.conditions[0].key).toBe("test_condition");
  });

  it("parses a tailoring draft (model output) and a resolved tailoring result", () => {
    const draft = TailoringDraftSchema.parse(toTailoringDraft(couplet(), { droppedBlocks: [{ index: 1, reason: "No time." }] }));
    expect(draft.blocks[0].sourceBlocks).toEqual([0]);
    expect("canonical" in draft.blocks[0].components[0]).toBe(false);
    expect(TailoringResultSchema.parse(identityResult(couplet())).blocks[0].components[0].canonical).toBe("Test Combo");
  });

  it("empty profile and request are valid", () => {
    expect(AthleteProfileSchema.parse(emptyProfile()).equipment).toBeNull();
    expect(TailorRequestSchema.parse(emptyRequest()).situation).toBe("");
  });

  it("rejects an over-long situation", () => {
    expect(() => TailorRequestSchema.parse({ ...emptyRequest(), situation: "x".repeat(2001) })).toThrow();
  });

  it("parses a pipeline result", () => {
    const r = PipelineResultSchema.parse({
      original: couplet(), conditions: [], unavailableEquipment: [],
      tailored: identityResult(couplet()), findings: [], feedbackHistory: [], model: "fake",
    });
    expect(r.model).toBe("fake");
  });
});
