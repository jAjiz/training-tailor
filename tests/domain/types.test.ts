import { describe, it, expect } from "vitest";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/matching";

describe("domain schemas", () => {
  it("validates a movement with patterns and site stresses (joints and muscles)", () => {
    const m = MovementSchema.parse({
      name: "Pull-up",
      patterns: ["vertical_pull"],
      stresses: [
        { site: "shoulder", mechanisms: ["traction", "kipping"] },
        { site: "elbow", mechanisms: ["traction", "kipping"] },
        { site: "biceps", mechanisms: ["eccentric"] },
      ],
      loadType: "bodyweight",
      skill: "intermediate",
      substitutes: ["Ring Row", "Banded Pull-up"],
    });
    expect(m.patterns[0]).toBe("vertical_pull");
    expect(m.stresses).toHaveLength(3);
  });

  it("requires at least one pattern", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", patterns: [], stresses: [], loadType: "barbell",
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("rejects values outside the pattern, site, and mechanism vocabularies", () => {
    const base = { name: "X", loadType: "barbell", skill: "beginner", substitutes: [] };
    expect(() => MovementSchema.parse({ ...base, patterns: ["yoga"], stresses: [] })).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"],
        stresses: [{ site: "pinky", mechanisms: ["compression"] }],
      })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"],
        stresses: [{ site: "knee", mechanisms: ["vibes"] }],
      })
    ).toThrow();
  });

  it("rejects an invalid loadType", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", patterns: ["squat"], stresses: [], loadType: "rocket",
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("validates an injury contraindication and stimulus def", () => {
    expect(
      InjuryContraindicationSchema.parse({
        injuryKey: "shoulder_impingement", label: "Shoulder impingement",
        avoidStresses: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
        avoidMovements: [], notes: null,
      }).injuryKey
    ).toBe("shoulder_impingement");
    expect(
      StimulusDefSchema.parse({ key: "aerobic_capacity", label: "Aerobic capacity", description: "Sustained..." }).key
    ).toBe("aerobic_capacity");
  });
});

describe("matchesContraindication", () => {
  const overheadInjury = InjuryContraindicationSchema.parse({
    injuryKey: "shoulder_impingement", label: "Shoulder impingement",
    avoidStresses: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
    avoidMovements: ["Bench Press"], notes: null,
  });
  const press = MovementSchema.parse({
    name: "Shoulder Press", patterns: ["vertical_push"],
    stresses: [{ site: "shoulder", mechanisms: ["overhead"] }],
    loadType: "barbell", skill: "beginner", substitutes: [],
  });
  const row = MovementSchema.parse({
    name: "Ring Row", patterns: ["horizontal_pull"],
    stresses: [{ site: "shoulder", mechanisms: ["traction"] }],
    loadType: "bodyweight", skill: "beginner", substitutes: [],
  });
  const bench = MovementSchema.parse({
    name: "Bench Press", patterns: ["horizontal_push"], stresses: [],
    loadType: "barbell", skill: "beginner", substitutes: [],
  });

  it("blocks a movement whose stress overlaps an avoided site+mechanism", () => {
    expect(matchesContraindication(press, overheadInjury)).toBe(true);
  });

  it("allows a movement stressing the same site via a different mechanism", () => {
    expect(matchesContraindication(row, overheadInjury)).toBe(false);
  });

  it("blocks a movement listed explicitly in avoidMovements even without stress overlap", () => {
    expect(matchesContraindication(bench, overheadInjury)).toBe(true);
  });
});
