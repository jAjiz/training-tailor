import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { ActiveCondition } from "@/lib/domain/assess";
import type { Equipment } from "@/lib/domain/types";
import { availableEquipment, goalFamily, planComponents, rankCandidates, type PlanContext } from "@/lib/engine/plan";
import { component, fran } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

function ctx(conditions: [string, "mild" | "moderate" | "acute"][] = [], equipment: Equipment[] | null = null): PlanContext {
  const active: ActiveCondition[] = conditions.map(([key, severity]) => ({
    contraindication: domain.contraindications.find((c) => c.key === key)!, side: null, severity,
  }));
  return { movements: domain.movements, resolve: createMovementResolver(domain.movements), active, equipment };
}
const movement = (name: string) => domain.movements.find((m) => m.name === name)!;

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
    const c = rankCandidates(movement("Thruster"), ctx([["shoulder_impingement", "moderate"]]));
    expect(c).toEqual([{ name: "Kettlebell Goblet Squat", verdict: "ok", source: "substitute", score: 999 }]);
  });

  it("filters substitutes by equipment", () => {
    const c = rankCandidates(movement("Row (Erg)"), ctx([], ["barbell", "pullup_bar"]));
    expect(c.map((x) => x.name)).toEqual(["Run"]);
  });

  it("adds pattern candidates for each pattern no surviving substitute covers", () => {
    // Shoulder blocks the press half of a Thruster and there is no kettlebell: the squat half must still be offered.
    const c = rankCandidates(movement("Thruster"), ctx([["shoulder_impingement", "moderate"], ["knee_pain", "mild"]], ["dumbbell", "jump_rope"]));
    expect(c.map((x) => x.name)).toContain("Air Squat");
    for (const x of c.filter((y) => y.source === "pattern")) {
      expect(movement(x.name).patterns).toContain("squat");
      expect(movement(x.name).equipment.every((e) => ["dumbbell", "jump_rope"].includes(e)), x.name).toBe(true);
    }
  });

  it("keeps a surviving substitute and still covers the pattern it misses", () => {
    const active: ActiveCondition[] = [
      { contraindication: domain.contraindications.find((c) => c.key === "shoulder_impingement")!, side: "right", severity: "moderate" },
    ];
    const c = rankCandidates(movement("Thruster"), { ...ctx([], ["dumbbell"]), active });
    expect(c.find((x) => x.name === "Dumbbell Shoulder Press")).toMatchObject({ source: "substitute", verdict: "caution" });
    // ok before caution across sources: the model is told to prefer candidates in order.
    expect(c[0]).toMatchObject({ verdict: "ok" });
    expect(c.findIndex((x) => x.verdict === "caution")).toBeGreaterThan(c.findLastIndex((x) => x.verdict === "ok"));
    expect(c.some((x) => x.source === "pattern" && movement(x.name).patterns.includes("squat"))).toBe(true);
  });

  it("moves to a related pattern only when nothing of the movement survives", () => {
    // No bar, no rings: no vertical pull is possible, so the pull becomes a row instead of disappearing.
    const c = rankCandidates(movement("Pull-up"), ctx([["no_hanging", "moderate"]], ["dumbbell", "jump_rope"]));
    expect(c.map((x) => x.name)).toEqual(["Dumbbell Row"]);
    expect(c[0].source).toBe("related");
  });

  it("does not use a related pattern while any candidate survives", () => {
    expect(rankCandidates(movement("Pull-up"), ctx([], ["pullup_bar"])).some((x) => x.source === "related")).toBe(false);
    expect(rankCandidates(movement("Pull-up"), ctx([["no_hanging", "moderate"]])).some((x) => x.source === "related")).toBe(false);
    // The Thruster keeps its squat; its blocked press is not swapped for a horizontal push.
    expect(rankCandidates(movement("Thruster"), ctx([["shoulder_impingement", "moderate"]])).some((x) => x.source === "related")).toBe(false);
  });

  it("puts the variant that keeps the whole movement first when it is no riskier than the original", () => {
    // Mild knee: the Thruster is already "caution", so a Dumbbell Thruster (also caution) adds no risk and keeps squat + press.
    const c = rankCandidates(movement("Thruster"), ctx([["knee_pain", "mild"]], ["dumbbell", "jump_rope"]));
    expect(c.map((x) => [x.name, x.verdict])).toEqual([["Dumbbell Thruster", "caution"], ["Dumbbell Shoulder Press", "ok"]]);
  });

  it("keeps ok candidates first when the original had to change for safety", () => {
    const c = rankCandidates(movement("Thruster"), ctx([["knee_pain", "moderate"]], ["dumbbell", "jump_rope"]));
    expect(c.map((x) => x.name)).not.toContain("Dumbbell Thruster");
    expect(c[0].verdict).toBe("ok");
  });

  it("compares risk condition by condition: a caution the original already had does not demote a full variant", () => {
    // The wrist rules out the barbell Thruster; the Dumbbell Thruster spares the wrist and is "caution" only for
    // the mild knee, exactly like the original, so it still leads over a half-movement press.
    const c = rankCandidates(movement("Thruster"), ctx([["wrist_pain", "moderate"], ["knee_pain", "mild"]], ["dumbbell", "jump_rope"]));
    expect(c[0]).toMatchObject({ name: "Dumbbell Thruster", verdict: "caution" });
  });

  it("prefers a full-coverage variant when the original changes only for equipment", () => {
    const c = rankCandidates(movement("Thruster"), ctx([], ["dumbbell"]));
    expect(c[0]).toMatchObject({ name: "Dumbbell Thruster", verdict: "ok" });
  });

  it("adds no pattern candidates when the substitutes cover every pattern", () => {
    const c = rankCandidates(movement("Pull-up"), ctx([], null));
    expect(c.every((x) => x.source === "substitute")).toBe(true);
  });

  it("falls back to the primary pattern only when every substitute is blocked", () => {
    const c = rankCandidates(movement("Handstand Walk"), ctx([["no_inversion", "moderate"]]));
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) {
      expect(x.source).toBe("pattern");
      expect(movement(x.name).patterns).toContain("carry");
      expect(movement(x.name).positions).not.toContain("inverted");
    }
  });
});

describe("planComponents", () => {
  it("marks contraindicated components for change and lists candidates", () => {
    const plan = planComponents(fran(), ctx([["shoulder_impingement", "moderate"]]));
    expect(plan.map((p) => [p.canonical, p.verdict, p.needsChange])).toEqual([
      ["Thruster", "avoid", true],
      ["Pull-up", "avoid", true],
    ]);
    expect(plan[1].candidates[0]).toMatchObject({ name: "Ring Row", verdict: "ok" });
  });

  it("flags missing equipment as a required change", () => {
    const plan = planComponents(fran(), ctx([], ["dumbbell"]));
    expect(plan[0].missingEquipment).toEqual(["barbell"]);
    expect(plan[0].needsChange).toBe(true);
  });

  it("offers alternatives for a caution without forcing a change", () => {
    const w = fran();
    w.blocks[0].components = [{ ...component("Dead Hang"), canonical: "Dead Hang" }];
    const [p] = planComponents(w, ctx([["hand_tear", "moderate"]]));
    expect(p.verdict).toBe("caution");
    expect(p.needsChange).toBe(false);
    expect(p.candidates.length).toBeGreaterThan(0);
  });

  it("reports an unrecognized movement as unknown", () => {
    const w = fran();
    w.blocks[0].components = [{ ...component("Zercher Carry"), canonical: null }];
    expect(planComponents(w, ctx())[0]).toMatchObject({ verdict: "unknown", needsChange: false, candidates: [] });
  });
});

describe("goalFamily", () => {
  it("returns the target and its usable substitutes", () => {
    expect(goalFamily("T2B", ctx()).map((c) => c.name)).toEqual([
      "Toes-to-Bar", "Knees-to-Elbows", "Hanging Knee Raise", "Sit-up", "Strict Toes-to-Bar",
    ]);
  });
  it("drops family members the athlete cannot do", () => {
    expect(goalFamily("Toes-to-Bar", ctx([["no_hanging", "moderate"]])).map((c) => c.name)).toEqual(["Sit-up"]);
  });
  it("is empty without a target", () => {
    expect(goalFamily(null, ctx())).toEqual([]);
  });
});
