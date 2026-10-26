import { describe, it, expect } from "vitest";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { ActiveCondition } from "@/lib/domain/assess";
import type { Equipment, Movement, SiteStress } from "@/lib/domain/types";
import type { StructuredWorkout } from "@/lib/engine/types";
import { availableEquipment, goalFamily, planComponents, rankCandidates, type PlanContext } from "@/lib/engine/plan";
import { component, couplet } from "../fixtures/workouts";
import { active, testContraindication, testMovement } from "../helpers/library-builders";

function ctxOf(movements: Movement[], conditions: ActiveCondition[] = [], equipment: Equipment[] | null = null): PlanContext {
  return { movements, resolve: createMovementResolver(movements), active: conditions, equipment };
}

function workoutOf(...canonicals: (string | null)[]): StructuredWorkout {
  const base = couplet();
  return {
    ...base,
    blocks: [{ ...base.blocks[0], components: canonicals.map((c) => ({ ...component(c ?? "Test Unlisted"), canonical: c })) }],
  };
}

const overheadHigh: SiteStress = { site: "shoulder", mechanisms: ["overhead"], load: "high" };
const kneeHigh: SiteStress = { site: "knee", mechanisms: ["deep_flexion"], load: "high" };

const shoulder = testContraindication("test_shoulder", { rules: [{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }] });
const knee = testContraindication("test_knee", { rules: [{ site: "knee", mechanisms: ["deep_flexion"], tier: "avoid" }] });
const wrist = testContraindication("test_wrist", { rules: [{ site: "wrist", mechanisms: ["extension"], tier: "avoid" }] });
const noHanging = testContraindication("test_no_hanging", { positionRules: [{ position: "hanging", tier: "avoid" }] });
const noInversion = testContraindication("test_no_inversion", { positionRules: [{ position: "inverted", tier: "avoid" }] });

describe("availableEquipment", () => {
  it("is null (a full box) when nothing is specified or missing", () => {
    expect(availableEquipment(null, null, [])).toBeNull();
  });
  it("removes today's missing items from a full box", () => {
    const e = availableEquipment(null, null, ["rower"])!;
    expect(e).not.toContain("rower");
    expect(e).toContain("barbell");
  });
  it("prefers today's equipment over the profile", () => {
    expect(availableEquipment(["barbell"], ["dumbbell", "rower"], ["rower"])).toEqual(["dumbbell"]);
  });
});

describe("rankCandidates", () => {
  it("keeps listed substitutes that survive, in order", () => {
    const combo = testMovement("Test Combo", {
      patterns: ["squat", "vertical_push"], stresses: [overheadHigh],
      substitutes: ["Test Press", "Test Squat", "Test Squat Two"],
    });
    const press = testMovement("Test Press", { patterns: ["vertical_push"], stresses: [overheadHigh] });
    const squat = testMovement("Test Squat", { patterns: ["squat"] });
    const squatTwo = testMovement("Test Squat Two", { patterns: ["squat"] });
    const c = rankCandidates(combo, ctxOf([combo, press, squat, squatTwo], [active(shoulder)]));
    expect(c).toEqual([
      { name: "Test Squat", verdict: "ok", source: "substitute", score: 999 },
      { name: "Test Squat Two", verdict: "ok", source: "substitute", score: 998 },
    ]);
  });

  it("filters substitutes by equipment", () => {
    const erg = testMovement("Test Erg", { patterns: ["monostructural"], equipment: ["rower"], substitutes: ["Test Ski", "Test Run"] });
    const ski = testMovement("Test Ski", { patterns: ["monostructural"], equipment: ["ski_erg"] });
    const run = testMovement("Test Run", { patterns: ["monostructural"] });
    const c = rankCandidates(erg, ctxOf([erg, ski, run], [], ["barbell", "pullup_bar"]));
    expect(c.map((x) => x.name)).toEqual(["Test Run"]);
  });

  it("adds pattern candidates for each pattern no surviving substitute covers", () => {
    // The shoulder blocks the press half of the combo and the barbell is missing: the squat half is still offered.
    const combo = testMovement("Test Combo", {
      patterns: ["squat", "vertical_push"], stresses: [overheadHigh], substitutes: ["Test Press"],
    });
    const press = testMovement("Test Press", { patterns: ["vertical_push"], stresses: [overheadHigh] });
    const squat = testMovement("Test Squat", { patterns: ["squat"] });
    const barbellSquat = testMovement("Test Barbell Squat", { patterns: ["squat"], equipment: ["barbell"] });
    const row = testMovement("Test Row", { patterns: ["horizontal_pull"] });
    const c = rankCandidates(combo, ctxOf([combo, press, squat, barbellSquat, row], [active(shoulder)], ["dumbbell", "jump_rope"]));
    // 10 for the shared squat pattern + 1 for the same skill level.
    expect(c).toEqual([{ name: "Test Squat", verdict: "ok", source: "pattern", score: 11 }]);
  });

  it("keeps a surviving substitute and still covers the pattern it misses", () => {
    const combo = testMovement("Test Combo", {
      patterns: ["squat", "vertical_push"], stresses: [overheadHigh], unilateral: "upper", substitutes: ["Test Press"],
    });
    const press = testMovement("Test Press", { patterns: ["vertical_push"], stresses: [overheadHigh], unilateral: "upper" });
    const squat = testMovement("Test Squat", { patterns: ["squat"] });
    const c = rankCandidates(combo, ctxOf([combo, press, squat], [active(shoulder, "moderate", "right")]));
    // The right shoulder makes the upper-body press a caution (healthy side only), not an avoid.
    expect(c.find((x) => x.name === "Test Press")).toMatchObject({ source: "substitute", verdict: "caution" });
    expect(c.find((x) => x.name === "Test Squat")).toMatchObject({ source: "pattern", verdict: "ok" });
    // ok before caution across sources: the model is told to prefer candidates in order.
    expect(c[0]).toMatchObject({ verdict: "ok" });
    expect(c.findIndex((x) => x.verdict === "caution")).toBeGreaterThan(c.findLastIndex((x) => x.verdict === "ok"));
  });

  it("moves to a related pattern only when nothing of the movement survives", () => {
    // No bar, no rings: no vertical pull is possible, so the pull becomes a row instead of disappearing.
    const pull = testMovement("Test Pull", { patterns: ["vertical_pull"], positions: ["hanging"], equipment: ["pullup_bar"] });
    const ringPull = testMovement("Test Ring Pull", { patterns: ["vertical_pull"], equipment: ["rings"] });
    const row = testMovement("Test Row", { patterns: ["horizontal_pull"], equipment: ["dumbbell"] });
    const barbellRow = testMovement("Test Barbell Row", { patterns: ["horizontal_pull"], equipment: ["barbell"] });
    const c = rankCandidates(pull, ctxOf([pull, ringPull, row, barbellRow], [active(noHanging)], ["dumbbell"]));
    expect(c.map((x) => x.name)).toEqual(["Test Row"]);
    expect(c[0].source).toBe("related");
  });

  it("does not use a related pattern while any candidate survives", () => {
    const pull = testMovement("Test Pull", {
      patterns: ["vertical_pull"], positions: ["hanging"], equipment: ["pullup_bar"], substitutes: ["Test Alt Pull"],
    });
    const altPull = testMovement("Test Alt Pull", { patterns: ["vertical_pull"] });
    const row = testMovement("Test Row", { patterns: ["horizontal_pull"] });
    const combo = testMovement("Test Combo", { patterns: ["squat", "vertical_push"], stresses: [overheadHigh] });
    const squat = testMovement("Test Squat", { patterns: ["squat"] });
    const pushUp = testMovement("Test Push-up", { patterns: ["horizontal_push"] });
    const movements = [pull, altPull, row, combo, squat, pushUp];
    expect(rankCandidates(pull, ctxOf(movements, [], ["pullup_bar"])).some((x) => x.source === "related")).toBe(false);
    expect(rankCandidates(pull, ctxOf(movements, [active(noHanging)])).some((x) => x.source === "related")).toBe(false);
    // The combo keeps its squat; its blocked press is not swapped for a horizontal push.
    expect(rankCandidates(combo, ctxOf(movements, [active(shoulder)])).some((x) => x.source === "related")).toBe(false);
  });

  it("puts the variant that keeps the whole movement first when it is no riskier than the original", () => {
    // Mild knee: the combo is already a caution, so a dumbbell combo (also a caution) adds no risk and keeps squat + press.
    const combo = testMovement("Test Combo", {
      patterns: ["squat", "vertical_push"], stresses: [kneeHigh], equipment: ["barbell"], substitutes: ["Test Press"],
    });
    const press = testMovement("Test Press", { patterns: ["vertical_push"] });
    const dumbbellCombo = testMovement("Test Dumbbell Combo", {
      patterns: ["squat", "vertical_push"], stresses: [kneeHigh], equipment: ["dumbbell"],
    });
    const c = rankCandidates(combo, ctxOf([combo, press, dumbbellCombo], [active(knee, "mild")], ["dumbbell"]));
    expect(c.map((x) => [x.name, x.verdict])).toEqual([["Test Dumbbell Combo", "caution"], ["Test Press", "ok"]]);
  });

  it("keeps ok candidates first when the original had to change for safety", () => {
    const combo = testMovement("Test Combo", { patterns: ["squat", "vertical_push"], stresses: [kneeHigh], substitutes: ["Test Press"] });
    const press = testMovement("Test Press", { patterns: ["vertical_push"] });
    const heavyCombo = testMovement("Test Heavy Combo", { patterns: ["squat", "vertical_push"], stresses: [kneeHigh] });
    const lightCombo = testMovement("Test Light Combo", {
      patterns: ["squat", "vertical_push"], stresses: [{ site: "knee", mechanisms: ["deep_flexion"], load: "low" }],
    });
    const c = rankCandidates(combo, ctxOf([combo, press, heavyCombo, lightCombo], [active(knee, "moderate")]));
    // The heavy variant is as contraindicated as the original; the light one is a caution the original did not carry,
    // so it follows the ok press even though it covers more of the movement.
    expect(c.map((x) => [x.name, x.verdict])).toEqual([["Test Press", "ok"], ["Test Light Combo", "caution"]]);
  });

  it("compares risk condition by condition: a caution the original already had does not demote a full variant", () => {
    // The wrist rules out the combo; the dumbbell combo spares the wrist and is a caution only for the mild knee,
    // exactly like the original, so it still leads over a half-movement press.
    const combo = testMovement("Test Combo", {
      patterns: ["squat", "vertical_push"], equipment: ["barbell"], substitutes: ["Test Press"],
      stresses: [{ site: "wrist", mechanisms: ["extension"], load: "high" }, kneeHigh],
    });
    const press = testMovement("Test Press", { patterns: ["vertical_push"] });
    const dumbbellCombo = testMovement("Test Dumbbell Combo", {
      patterns: ["squat", "vertical_push"], stresses: [kneeHigh], equipment: ["dumbbell"],
    });
    const c = rankCandidates(combo, ctxOf([combo, press, dumbbellCombo], [active(wrist), active(knee, "mild")], ["dumbbell"]));
    expect(c[0]).toMatchObject({ name: "Test Dumbbell Combo", verdict: "caution" });
  });

  it("prefers a full-coverage variant when the original changes only for equipment", () => {
    const combo = testMovement("Test Combo", { patterns: ["squat", "vertical_push"], equipment: ["barbell"], substitutes: ["Test Press"] });
    const press = testMovement("Test Press", { patterns: ["vertical_push"] });
    const dumbbellCombo = testMovement("Test Dumbbell Combo", { patterns: ["squat", "vertical_push"], equipment: ["dumbbell"] });
    const c = rankCandidates(combo, ctxOf([combo, press, dumbbellCombo], [], ["dumbbell"]));
    expect(c[0]).toMatchObject({ name: "Test Dumbbell Combo", verdict: "ok" });
  });

  it("adds no pattern candidates when the substitutes cover every pattern", () => {
    const pull = testMovement("Test Pull", { patterns: ["vertical_pull"], substitutes: ["Test Ring Pull"] });
    const ringPull = testMovement("Test Ring Pull", { patterns: ["vertical_pull"] });
    const otherPull = testMovement("Test Other Pull", { patterns: ["vertical_pull"] });
    const c = rankCandidates(pull, ctxOf([pull, ringPull, otherPull]));
    expect(c.map((x) => x.name)).toEqual(["Test Ring Pull"]);
    expect(c.every((x) => x.source === "substitute")).toBe(true);
  });

  it("falls back to the primary pattern only when every substitute is blocked", () => {
    const walk = testMovement("Test Hand Walk", { patterns: ["carry"], positions: ["inverted"], substitutes: ["Test Wall Walk"] });
    const wallWalk = testMovement("Test Wall Walk", { patterns: ["carry"], positions: ["inverted"] });
    const invertedCarry = testMovement("Test Inverted Carry", { patterns: ["carry"], positions: ["inverted"] });
    const farmer = testMovement("Test Farmer Carry", { patterns: ["carry"] });
    const squat = testMovement("Test Squat", { patterns: ["squat"] });
    const c = rankCandidates(walk, ctxOf([walk, wallWalk, invertedCarry, farmer, squat], [active(noInversion)]));
    expect(c.map((x) => [x.name, x.source])).toEqual([["Test Farmer Carry", "pattern"]]);
  });
});

describe("planComponents", () => {
  it("marks contraindicated components for change and lists candidates", () => {
    const both = testContraindication("test_both", {
      rules: [{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }],
      positionRules: [{ position: "hanging", tier: "avoid" }],
    });
    const press = testMovement("Test Press", { patterns: ["vertical_push"], stresses: [overheadHigh], substitutes: ["Test Push-up"] });
    const pull = testMovement("Test Pull", { patterns: ["vertical_pull"], positions: ["hanging"], substitutes: ["Test Row"] });
    const pushUp = testMovement("Test Push-up", { patterns: ["horizontal_push"] });
    const row = testMovement("Test Row", { patterns: ["horizontal_pull"] });
    const plan = planComponents(workoutOf("Test Press", "Test Pull"), ctxOf([press, pull, pushUp, row], [active(both)]));
    expect(plan.map((p) => [p.canonical, p.verdict, p.needsChange])).toEqual([
      ["Test Press", "avoid", true],
      ["Test Pull", "avoid", true],
    ]);
    expect(plan[0].candidates.map((x) => x.name)).toEqual(["Test Push-up"]);
    expect(plan[1].candidates[0]).toMatchObject({ name: "Test Row", verdict: "ok" });
  });

  it("flags missing equipment as a required change", () => {
    const lift = testMovement("Test Lift", { equipment: ["barbell"] });
    const plan = planComponents(workoutOf("Test Lift"), ctxOf([lift], [], ["dumbbell"]));
    expect(plan[0].missingEquipment).toEqual(["barbell"]);
    expect(plan[0].needsChange).toBe(true);
  });

  it("offers alternatives for a caution without forcing a change", () => {
    const cautionHang = testContraindication("test_caution_hang", { positionRules: [{ position: "hanging", tier: "caution" }] });
    const hang = testMovement("Test Hang", { patterns: ["hold"], positions: ["hanging"], substitutes: ["Test Plank"] });
    const plank = testMovement("Test Plank", { patterns: ["hold"] });
    const [p] = planComponents(workoutOf("Test Hang"), ctxOf([hang, plank], [active(cautionHang)]));
    expect(p.verdict).toBe("caution");
    expect(p.needsChange).toBe(false);
    expect(p.candidates.map((x) => x.name)).toEqual(["Test Plank"]);
  });

  it("reports an unrecognized movement as unknown", () => {
    const [p] = planComponents(workoutOf(null), ctxOf([]));
    expect(p).toMatchObject({ verdict: "unknown", canonical: null, needsChange: false, candidates: [], missingEquipment: [] });
  });
});

describe("goalFamily", () => {
  it("returns the target and its usable substitutes", () => {
    const target = testMovement("Test Target", { aliases: ["TT"], substitutes: ["Test Alt A", "Test Missing", "Test Alt B"] });
    const altA = testMovement("Test Alt A");
    const altB = testMovement("Test Alt B");
    const c = goalFamily("TT", ctxOf([target, altA, altB]));
    expect(c).toEqual([
      { name: "Test Target", verdict: "ok", source: "goal", score: 0 },
      { name: "Test Alt A", verdict: "ok", source: "goal", score: 0 },
      { name: "Test Alt B", verdict: "ok", source: "goal", score: 0 },
    ]);
  });
  it("drops family members the athlete cannot do", () => {
    const target = testMovement("Test Target", { positions: ["hanging"], substitutes: ["Test Alt A", "Test Alt B", "Test Alt C"] });
    const altA = testMovement("Test Alt A", { positions: ["hanging"] });
    const altB = testMovement("Test Alt B");
    const altC = testMovement("Test Alt C", { equipment: ["barbell"] });
    const c = goalFamily("Test Target", ctxOf([target, altA, altB, altC], [active(noHanging)], ["dumbbell"]));
    expect(c.map((x) => x.name)).toEqual(["Test Alt B"]);
  });
  it("is empty without a target", () => {
    expect(goalFamily(null, ctxOf([testMovement("Test Target")]))).toEqual([]);
  });
});
