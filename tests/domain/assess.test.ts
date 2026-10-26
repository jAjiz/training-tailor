import { describe, it, expect } from "vitest";
import { ContraindicationSchema, MovementSchema } from "@/lib/domain/types";
import { assessMovement, effectiveVerdict, matchesContraindication, worstVerdict } from "@/lib/domain/assess";
import { active, testContraindication, testMovement } from "../helpers/library-builders";

const squat = testMovement("Test Squat", { stresses: [{ site: "knee", mechanisms: ["deep_flexion", "compression"], load: "high" }] });
const lightSquat = testMovement("Test Light Squat", { stresses: [{ site: "knee", mechanisms: ["deep_flexion"], load: "low" }] });
const press = testMovement("Test Press", {
  patterns: ["vertical_push"], stresses: [{ site: "shoulder", mechanisms: ["overhead"], load: "high" }], unilateral: "upper",
});
const combo = testMovement("Test Combo", {
  patterns: ["hinge"], unilateral: "upper",
  stresses: [{ site: "lumbar", mechanisms: ["ballistic"], load: "high" }, { site: "shoulder", mechanisms: ["overhead", "ballistic"], load: "high" }],
});
const hang = testMovement("Test Hang", { patterns: ["hold"], positions: ["hanging"] });

const kneeAvoid = testContraindication("test_knee", { rules: [{ site: "knee", mechanisms: ["deep_flexion"], tier: "avoid" }] });
const shoulderAvoid = testContraindication("test_shoulder", { rules: [{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }] });
const lumbarAvoid = testContraindication("test_lumbar", { rules: [{ site: "lumbar", mechanisms: ["ballistic"], tier: "avoid" }] });

describe("schema defaults", () => {
  it("defaults stress load to high and unilateral to null", () => {
    const m = MovementSchema.parse({
      name: "Test Default", patterns: ["squat"], positions: [], stresses: [{ site: "knee", mechanisms: ["compression"] }],
      equipment: [], skill: "beginner", substitutes: [],
    });
    expect(m.stresses[0].load).toBe("high");
    expect(m.unilateral).toBeNull();
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
    expect(assessMovement(lightSquat, [active(kneeAvoid, "mild")]).verdict).toBe("ok");
    expect(assessMovement(lightSquat, [active(kneeAvoid, "moderate")]).verdict).toBe("caution");
    expect(assessMovement(lightSquat, [active(kneeAvoid, "acute")]).verdict).toBe("avoid");
  });

  it("reports the matched site and shared mechanisms", () => {
    const a = assessMovement(squat, [active(kneeAvoid)]);
    expect(a.verdict).toBe("avoid");
    expect(a.reasons).toEqual([
      { conditionKey: "test_knee", verdict: "avoid", detail: "knee: deep_flexion", healthySideOnly: false },
    ]);
  });

  it("applies a position rule tier as written", () => {
    const noHang = testContraindication("test_no_hang", {
      kind: "limitation", positionRules: [{ position: "hanging", tier: "avoid" }],
    });
    expect(assessMovement(hang, [active(noHang, "mild")]).verdict).toBe("avoid");
  });

  it("blocks an explicitly listed movement", () => {
    const explicit = testContraindication("test_explicit", { avoidMovements: ["Test Hang"] });
    expect(assessMovement(hang, [active(explicit)]).verdict).toBe("avoid");
  });

  it("lets a one-sided limb injury train the healthy side of a unilateral movement", () => {
    const a = assessMovement(press, [active(shoulderAvoid, "moderate", "right")]);
    expect(a.verdict).toBe("caution");
    expect(a.reasons[0].healthySideOnly).toBe(true);
  });

  it("gives no laterality exemption without a side or for both sides", () => {
    expect(assessMovement(press, [active(shoulderAvoid)]).verdict).toBe("avoid");
    expect(assessMovement(press, [active(shoulderAvoid, "moderate", "both")]).verdict).toBe("avoid");
  });

  it("never exempts an axial site", () => {
    expect(assessMovement(combo, [active(lumbarAvoid, "moderate", "left")]).verdict).toBe("avoid");
  });

  it("takes the worst verdict across conditions", () => {
    const a = assessMovement(combo, [active(shoulderAvoid, "moderate", "left"), active(lumbarAvoid)]);
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
    expect(matchesContraindication(lightSquat, kneeAvoid)).toBe(false);
  });
});
