import { describe, it, expect } from "vitest";
import { MovementSchema, ContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/assess";
import { testContraindication, testMovement } from "../helpers/library-builders";

describe("domain schemas", () => {
  it("validates a movement with patterns, positions, site stresses, and equipment", () => {
    const m = MovementSchema.parse({
      name: "Test Pull",
      patterns: ["vertical_pull"],
      positions: ["hanging"],
      stresses: [
        { site: "shoulder", mechanisms: ["traction", "kipping"], load: "high" },
        { site: "elbow", mechanisms: ["traction", "kipping"], load: "high" },
        { site: "biceps", mechanisms: ["eccentric"], load: "high" },
      ],
      equipment: ["pullup_bar"],
      skill: "intermediate",
      substitutes: ["Test Row", "Test Band Pull"],
    });
    expect(m.patterns[0]).toBe("vertical_pull");
    expect(m.positions).toEqual(["hanging"]);
    expect(m.stresses).toHaveLength(3);
    expect(m.equipment).toEqual(["pullup_bar"]);
  });

  it("accepts hold as a movement pattern", () => {
    expect(testMovement("Test Hold", { patterns: ["hold"], positions: ["inverted"] }).patterns).toEqual(["hold"]);
  });

  it("accepts partial_inversion as a position", () => {
    expect(testMovement("Test Climb", { positions: ["partial_inversion"] }).positions).toEqual(["partial_inversion"]);
  });

  it("accepts lats as a stress site", () => {
    const m = testMovement("Test Pull", { stresses: [{ site: "lats", mechanisms: ["kipping", "eccentric"], load: "high" }] });
    expect(m.stresses[0].site).toBe("lats");
  });

  it("accepts triceps as a stress site", () => {
    const m = testMovement("Test Dip", { stresses: [{ site: "triceps", mechanisms: ["eccentric"], load: "high" }] });
    expect(m.stresses[0].site).toBe("triceps");
  });

  it("accepts sandbag and d_ball as equipment", () => {
    for (const e of ["sandbag", "d_ball"] as const) {
      expect(testMovement("Test Carry", { patterns: ["carry"], equipment: [e] }).equipment).toEqual([e]);
    }
  });

  it("accepts rope as equipment", () => {
    expect(testMovement("Test Rope Climb", { equipment: ["rope"] }).equipment).toEqual(["rope"]);
  });

  it("accepts ski_erg as equipment", () => {
    expect(testMovement("Test Erg", { equipment: ["ski_erg"] }).equipment).toEqual(["ski_erg"]);
  });

  it("accepts air_bike as equipment", () => {
    expect(testMovement("Test Bike", { equipment: ["air_bike"] }).equipment).toEqual(["air_bike"]);
  });

  it("defaults aliases to an empty array when omitted", () => {
    const m = MovementSchema.parse({
      name: "Test X", patterns: ["squat"], positions: [], stresses: [],
      equipment: [], skill: "beginner", substitutes: [],
    });
    expect(m.aliases).toEqual([]);
  });

  it("accepts aliases", () => {
    expect(testMovement("Test Raise", { aliases: ["TR", "TRX"] }).aliases).toEqual(["TR", "TRX"]);
  });

  it("accepts deep_extension as a stress mechanism", () => {
    const m = testMovement("Test Dip", { stresses: [{ site: "shoulder", mechanisms: ["deep_extension"], load: "high" }] });
    expect(m.stresses[0].mechanisms).toEqual(["deep_extension"]);
  });

  it("requires at least one pattern", () => {
    expect(() =>
      MovementSchema.parse({
        name: "Test X", patterns: [], positions: [], stresses: [], equipment: [],
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("rejects values outside the pattern, position, site, and mechanism vocabularies", () => {
    const base = { name: "Test X", equipment: [], skill: "beginner", substitutes: [] };
    expect(() =>
      MovementSchema.parse({ ...base, patterns: ["yoga"], positions: [], stresses: [] })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({ ...base, patterns: ["squat"], positions: ["floating"], stresses: [] })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"], positions: [],
        stresses: [{ site: "pinky", mechanisms: ["compression"], load: "high" }],
      })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"], positions: [],
        stresses: [{ site: "knee", mechanisms: ["vibes"], load: "high" }],
      })
    ).toThrow();
  });

  it("rejects an equipment value outside the vocabulary", () => {
    expect(() =>
      MovementSchema.parse({
        name: "Test X", patterns: ["squat"], positions: [], stresses: [], equipment: ["rocket"],
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("validates a contraindication and stimulus def", () => {
    expect(
      ContraindicationSchema.parse({
        key: "test_shoulder", label: "Test shoulder", kind: "injury",
        rules: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"], tier: "avoid" }],
        positionRules: [], avoidMovements: [], notes: null,
      }).key
    ).toBe("test_shoulder");
    expect(
      StimulusDefSchema.parse({ key: "test_quality", label: "Test quality", description: "Test description" }).key
    ).toBe("test_quality");
  });
});

describe("matchesContraindication", () => {
  const overheadInjury = testContraindication("test_overhead", {
    rules: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"], tier: "avoid" }],
    avoidMovements: ["Test Listed"],
  });
  const noInversion = testContraindication("test_no_inversion", {
    kind: "limitation", positionRules: [{ position: "inverted", tier: "avoid" }],
  });
  const press = testMovement("Test Press", { stresses: [{ site: "shoulder", mechanisms: ["overhead"], load: "high" }] });
  const row = testMovement("Test Row", { stresses: [{ site: "shoulder", mechanisms: ["traction"], load: "high" }] });
  const listed = testMovement("Test Listed");
  const inverted = testMovement("Test Inverted", { positions: ["inverted"] });

  it("blocks a movement whose stress overlaps an avoided site+mechanism", () => {
    expect(matchesContraindication(press, overheadInjury)).toBe(true);
  });

  it("allows a movement stressing the same site via a different mechanism", () => {
    expect(matchesContraindication(row, overheadInjury)).toBe(false);
  });

  it("blocks a movement listed explicitly in avoidMovements even without stress overlap", () => {
    expect(matchesContraindication(listed, overheadInjury)).toBe(true);
  });

  it("blocks a movement requiring an avoided position even without stress overlap", () => {
    expect(matchesContraindication(inverted, noInversion)).toBe(true);
  });

  it("allows a movement that does not require the avoided position", () => {
    expect(matchesContraindication(press, noInversion)).toBe(false);
  });
});
