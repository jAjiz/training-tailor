import { describe, it, expect } from "vitest";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/matching";

describe("domain schemas", () => {
  it("validates a movement with patterns, positions, site stresses, and equipment", () => {
    const m = MovementSchema.parse({
      name: "Pull-up",
      patterns: ["vertical_pull"],
      positions: ["hanging"],
      stresses: [
        { site: "shoulder", mechanisms: ["traction", "kipping"] },
        { site: "elbow", mechanisms: ["traction", "kipping"] },
        { site: "biceps", mechanisms: ["eccentric"] },
      ],
      equipment: ["pullup_bar"],
      skill: "intermediate",
      substitutes: ["Ring Row", "Banded Pull-up"],
    });
    expect(m.patterns[0]).toBe("vertical_pull");
    expect(m.positions).toEqual(["hanging"]);
    expect(m.stresses).toHaveLength(3);
    expect(m.equipment).toEqual(["pullup_bar"]);
  });

  it("accepts hold as a movement pattern", () => {
    const m = MovementSchema.parse({
      name: "Handstand Hold", patterns: ["hold"], positions: ["inverted"], stresses: [],
      equipment: [], skill: "advanced", substitutes: [],
    });
    expect(m.patterns).toEqual(["hold"]);
  });

  it("accepts partial_inversion as a position", () => {
    const m = MovementSchema.parse({
      name: "Wall Climb", patterns: ["vertical_push"], positions: ["partial_inversion"], stresses: [],
      equipment: [], skill: "intermediate", substitutes: [],
    });
    expect(m.positions).toEqual(["partial_inversion"]);
  });

  it("accepts lats as a stress site", () => {
    const m = MovementSchema.parse({
      name: "Pull-up", patterns: ["vertical_pull"], positions: ["hanging"],
      stresses: [{ site: "lats", mechanisms: ["kipping", "eccentric"] }],
      equipment: ["pullup_bar"], skill: "intermediate", substitutes: [],
    });
    expect(m.stresses[0].site).toBe("lats");
  });

  it("accepts triceps as a stress site", () => {
    const m = MovementSchema.parse({
      name: "Ring Dip", patterns: ["vertical_push"], positions: [],
      stresses: [{ site: "triceps", mechanisms: ["eccentric"] }],
      equipment: ["rings"], skill: "advanced", substitutes: [],
    });
    expect(m.stresses[0].site).toBe("triceps");
  });

  it("defaults aliases to an empty array when omitted", () => {
    const m = MovementSchema.parse({
      name: "X", patterns: ["squat"], positions: [], stresses: [],
      equipment: [], skill: "beginner", substitutes: [],
    });
    expect(m.aliases).toEqual([]);
  });

  it("accepts aliases", () => {
    const m = MovementSchema.parse({
      name: "Toes-to-Bar", patterns: ["core"], positions: ["hanging"], stresses: [],
      equipment: ["pullup_bar"], skill: "intermediate", substitutes: [], aliases: ["T2B", "TTB"],
    });
    expect(m.aliases).toEqual(["T2B", "TTB"]);
  });

  it("accepts deep_extension as a stress mechanism", () => {
    const m = MovementSchema.parse({
      name: "Ring Dip", patterns: ["vertical_push"], positions: [],
      stresses: [{ site: "shoulder", mechanisms: ["deep_extension"] }],
      equipment: ["rings"], skill: "intermediate", substitutes: [],
    });
    expect(m.stresses[0].mechanisms).toEqual(["deep_extension"]);
  });

  it("requires at least one pattern", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", patterns: [], positions: [], stresses: [], equipment: [],
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("rejects values outside the pattern, position, site, and mechanism vocabularies", () => {
    const base = { name: "X", equipment: [], skill: "beginner", substitutes: [] };
    expect(() =>
      MovementSchema.parse({ ...base, patterns: ["yoga"], positions: [], stresses: [] })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({ ...base, patterns: ["squat"], positions: ["floating"], stresses: [] })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"], positions: [],
        stresses: [{ site: "pinky", mechanisms: ["compression"] }],
      })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"], positions: [],
        stresses: [{ site: "knee", mechanisms: ["vibes"] }],
      })
    ).toThrow();
  });

  it("rejects an equipment value outside the vocabulary", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", patterns: ["squat"], positions: [], stresses: [], equipment: ["rocket"],
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("validates an injury contraindication and stimulus def", () => {
    expect(
      InjuryContraindicationSchema.parse({
        injuryKey: "shoulder_impingement", label: "Shoulder impingement",
        avoidStresses: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
        avoidPositions: [], avoidMovements: [], notes: null,
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
    avoidPositions: [], avoidMovements: ["Bench Press"], notes: null,
  });
  const noInversion = InjuryContraindicationSchema.parse({
    injuryKey: "no_inversion", label: "Unable to go inverted",
    avoidStresses: [], avoidPositions: ["inverted"], avoidMovements: [], notes: null,
  });
  const press = MovementSchema.parse({
    name: "Shoulder Press", patterns: ["vertical_push"], positions: [],
    stresses: [{ site: "shoulder", mechanisms: ["overhead"] }],
    equipment: ["barbell"], skill: "beginner", substitutes: [],
  });
  const row = MovementSchema.parse({
    name: "Ring Row", patterns: ["horizontal_pull"], positions: [],
    stresses: [{ site: "shoulder", mechanisms: ["traction"] }],
    equipment: ["rings"], skill: "beginner", substitutes: [],
  });
  const bench = MovementSchema.parse({
    name: "Bench Press", patterns: ["horizontal_push"], positions: [], stresses: [],
    equipment: ["barbell", "bench"], skill: "beginner", substitutes: [],
  });
  const handstandPushUp = MovementSchema.parse({
    name: "Handstand Push-up", patterns: ["vertical_push"], positions: ["inverted"], stresses: [],
    equipment: [], skill: "advanced", substitutes: [],
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

  it("blocks a movement requiring an avoided position even without stress overlap", () => {
    expect(matchesContraindication(handstandPushUp, noInversion)).toBe(true);
  });

  it("allows a movement that does not require the avoided position", () => {
    expect(matchesContraindication(press, noInversion)).toBe(false);
  });
});
