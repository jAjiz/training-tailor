import { describe, it, expect } from "vitest";
import taxonomy from "../../data/stimulus-taxonomy.json";
import {
  AthleteProfileSchema, EnergySystem, LoadIntensity, PasteAnalysisSchema, PipelineResultSchema, Quality,
  StructuredWorkoutSchema, TailorRequestSchema, TailoringDraftSchema, TailoringResultSchema, emptyProfile, emptyRequest,
} from "@/lib/engine/types";
import { fran, franDraft, identityResult, split, toTailoringDraft } from "../fixtures/workouts";

describe("engine schemas", () => {
  it("stimulus enums stay in sync with data/stimulus-taxonomy.json", () => {
    // The z.enums give literal types; the JSON is the authoritative vocabulary. Add a key in BOTH.
    expect([...Quality.options].sort()).toEqual(taxonomy.qualities.map((d) => d.key).sort());
    expect([...EnergySystem.options].sort()).toEqual(taxonomy.energySystems.map((d) => d.key).sort());
    expect([...LoadIntensity.options].sort()).toEqual(taxonomy.loadIntensities.map((d) => d.key).sort());
  });

  it("parses single- and multi-block sessions", () => {
    expect(StructuredWorkoutSchema.parse(fran()).blocks[0].components[0].canonical).toBe("Thruster");
    expect(StructuredWorkoutSchema.parse(split()).blocks).toHaveLength(2);
  });

  it("parses a paste analysis with detected conditions", () => {
    const a = PasteAnalysisSchema.parse({
      workout: franDraft(),
      conditions: [{ key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro" }],
      unavailableEquipment: ["rower"],
    });
    expect(a.conditions[0].side).toBe("right");
  });

  it("parses a tailoring draft (model output) and a resolved tailoring result", () => {
    const draft = TailoringDraftSchema.parse(toTailoringDraft(fran(), { droppedBlocks: [{ index: 1, reason: "No time." }] }));
    expect(draft.blocks[0].sourceBlocks).toEqual([0]);
    expect("canonical" in draft.blocks[0].components[0]).toBe(false);
    expect(TailoringResultSchema.parse(identityResult(fran())).blocks[0].components[0].canonical).toBe("Thruster");
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
      original: fran(), conditions: [], unavailableEquipment: [],
      tailored: identityResult(fran()), findings: [], feedbackHistory: [], model: "fake",
    });
    expect(r.model).toBe("fake");
  });
});
