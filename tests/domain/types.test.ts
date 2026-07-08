import { describe, it, expect } from "vitest";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";

describe("domain schemas", () => {
  it("validates a movement", () => {
    const m = MovementSchema.parse({
      name: "Pull-up",
      plane: "frontal",
      jointStress: ["shoulder", "elbow"],
      loadType: "bodyweight",
      skill: "intermediate",
      substitutes: ["Ring Row", "Banded Pull-up"],
    });
    expect(m.name).toBe("Pull-up");
  });

  it("rejects an invalid loadType", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", plane: "sagittal", jointStress: [], loadType: "rocket",
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("validates an injury contraindication and stimulus def", () => {
    expect(
      InjuryContraindicationSchema.parse({
        injuryKey: "shoulder_impingement", label: "Shoulder impingement",
        avoidPatterns: ["overhead_press"], avoidMovements: ["Push Press"], notes: null,
      }).injuryKey
    ).toBe("shoulder_impingement");
    expect(
      StimulusDefSchema.parse({ key: "aerobic_capacity", label: "Aerobic capacity", description: "Sustained..." }).key
    ).toBe("aerobic_capacity");
  });
});
