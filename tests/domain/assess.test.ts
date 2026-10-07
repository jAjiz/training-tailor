import { describe, it, expect } from "vitest";
import { MovementSchema, ContraindicationSchema, type Contraindication } from "@/lib/domain/types";
import { assessMovement, effectiveVerdict, matchesContraindication, worstVerdict } from "@/lib/domain/assess";

const injury = (rules: Contraindication["rules"], extra: Partial<Contraindication> = {}) =>
  ContraindicationSchema.parse({
    key: "test_injury", label: "Test injury", kind: "injury", rules,
    positionRules: [], avoidMovements: [], notes: null, ...extra,
  });

const squat = MovementSchema.parse({
  name: "Back Squat", patterns: ["squat"], positions: [],
  stresses: [{ site: "knee", mechanisms: ["deep_flexion", "compression"] }],
  equipment: ["barbell"], skill: "beginner", substitutes: [],
});
const airSquat = MovementSchema.parse({
  name: "Air Squat", patterns: ["squat"], positions: [],
  stresses: [{ site: "knee", mechanisms: ["deep_flexion"], load: "low" }],
  equipment: [], skill: "beginner", substitutes: [],
});
const dbPress = MovementSchema.parse({
  name: "Dumbbell Shoulder Press", patterns: ["vertical_push"], positions: [],
  stresses: [{ site: "shoulder", mechanisms: ["overhead"] }],
  equipment: ["dumbbell"], skill: "beginner", substitutes: [], unilateral: "upper",
});
const dbSnatch = MovementSchema.parse({
  name: "Dumbbell Snatch", patterns: ["hinge"], positions: [],
  stresses: [{ site: "lumbar", mechanisms: ["ballistic"] }, { site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
  equipment: ["dumbbell"], skill: "intermediate", substitutes: [], unilateral: "upper",
});
const hang = MovementSchema.parse({
  name: "Dead Hang", patterns: ["hold"], positions: ["hanging"], stresses: [],
  equipment: ["pullup_bar"], skill: "beginner", substitutes: [],
});

const kneeAvoid = injury([{ site: "knee", mechanisms: ["deep_flexion"], tier: "avoid" }]);
const shoulderAvoid = injury([{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }]);
const lumbarAvoid = injury([{ site: "lumbar", mechanisms: ["ballistic"], tier: "avoid" }]);

describe("schema defaults", () => {
  it("defaults stress load to high and unilateral to null", () => {
    expect(squat.stresses[0].load).toBe("high");
    expect(squat.unilateral).toBeNull();
  });

  it("rejects a contraindication without a kind", () => {
    expect(() => ContraindicationSchema.parse({
      key: "x", label: "X", rules: [], positionRules: [], avoidMovements: [],
    })).toThrow();
  });
});

describe("effectiveVerdict", () => {
  it("follows the severity table for injuries", () => {
    expect(effectiveVerdict("avoid", "high", "mild", "injury")).toBe("caution");
    expect(effectiveVerdict("avoid", "high", "moderate", "injury")).toBe("avoid");
    expect(effectiveVerdict("avoid", "low", "mild", "injury")).toBe("ok");
    expect(effectiveVerdict("avoid", "low", "moderate", "injury")).toBe("caution");
    expect(effectiveVerdict("avoid", "low", "acute", "injury")).toBe("avoid");
    expect(effectiveVerdict("caution", "high", "moderate", "injury")).toBe("caution");
    expect(effectiveVerdict("caution", "high", "acute", "injury")).toBe("avoid");
    expect(effectiveVerdict("caution", "low", "moderate", "injury")).toBe("ok");
    expect(effectiveVerdict("caution", "low", "acute", "injury")).toBe("caution");
  });

  it("uses the moderate column for limitations and conditions", () => {
    expect(effectiveVerdict("avoid", "high", "mild", "limitation")).toBe("avoid");
    expect(effectiveVerdict("avoid", "low", "acute", "condition")).toBe("caution");
  });
});

describe("assessMovement", () => {
  it("is ok with no active conditions", () => {
    expect(assessMovement(squat, [])).toEqual({ verdict: "ok", reasons: [] });
  });

  it("scales a low-load stress with severity", () => {
    expect(assessMovement(airSquat, [{ contraindication: kneeAvoid, side: null, severity: "mild" }]).verdict).toBe("ok");
    expect(assessMovement(airSquat, [{ contraindication: kneeAvoid, side: null, severity: "moderate" }]).verdict).toBe("caution");
    expect(assessMovement(airSquat, [{ contraindication: kneeAvoid, side: null, severity: "acute" }]).verdict).toBe("avoid");
  });

  it("reports the matched site and shared mechanisms", () => {
    const a = assessMovement(squat, [{ contraindication: kneeAvoid, side: null, severity: "moderate" }]);
    expect(a.verdict).toBe("avoid");
    expect(a.reasons).toEqual([
      { conditionKey: "test_injury", verdict: "avoid", detail: "knee: deep_flexion", healthySideOnly: false },
    ]);
  });

  it("applies a position rule tier as written", () => {
    const noHang = ContraindicationSchema.parse({
      key: "no_hanging", label: "No hanging", kind: "limitation", rules: [],
      positionRules: [{ position: "hanging", tier: "avoid" }], avoidMovements: [], notes: null,
    });
    expect(assessMovement(hang, [{ contraindication: noHang, side: null, severity: "mild" }]).verdict).toBe("avoid");
  });

  it("blocks an explicitly listed movement", () => {
    const explicit = injury([], { avoidMovements: ["Dead Hang"] });
    expect(assessMovement(hang, [{ contraindication: explicit, side: null, severity: "moderate" }]).verdict).toBe("avoid");
  });

  it("lets a one-sided limb injury train the healthy side of a unilateral movement", () => {
    const a = assessMovement(dbPress, [{ contraindication: shoulderAvoid, side: "right", severity: "moderate" }]);
    expect(a.verdict).toBe("caution");
    expect(a.reasons[0].healthySideOnly).toBe(true);
  });

  it("gives no laterality exemption without a side or for both sides", () => {
    expect(assessMovement(dbPress, [{ contraindication: shoulderAvoid, side: null, severity: "moderate" }]).verdict).toBe("avoid");
    expect(assessMovement(dbPress, [{ contraindication: shoulderAvoid, side: "both", severity: "moderate" }]).verdict).toBe("avoid");
  });

  it("never exempts an axial site", () => {
    const a = assessMovement(dbSnatch, [{ contraindication: lumbarAvoid, side: "left", severity: "moderate" }]);
    expect(a.verdict).toBe("avoid");
  });

  it("takes the worst verdict across conditions", () => {
    const a = assessMovement(dbSnatch, [
      { contraindication: shoulderAvoid, side: "left", severity: "moderate" },
      { contraindication: lumbarAvoid, side: null, severity: "moderate" },
    ]);
    expect(a.verdict).toBe("avoid");
    expect(a.reasons.map((r) => r.verdict).sort()).toEqual(["avoid", "caution"]);
  });
});

describe("helpers", () => {
  it("worstVerdict ranks avoid over caution over ok", () => {
    expect(worstVerdict("ok", "caution")).toBe("caution");
    expect(worstVerdict("avoid", "caution")).toBe("avoid");
  });

  it("matchesContraindication means avoid at moderate severity with no side", () => {
    expect(matchesContraindication(squat, kneeAvoid)).toBe(true);
    expect(matchesContraindication(airSquat, kneeAvoid)).toBe(false);
  });
});
