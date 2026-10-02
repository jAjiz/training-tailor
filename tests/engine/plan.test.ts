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
    expect(c).toEqual([{ name: "Kettlebell Goblet Squat", verdict: "ok", source: "substitute", score: 1000 }]);
  });

  it("filters substitutes by equipment", () => {
    const c = rankCandidates(movement("Row (Erg)"), ctx([], ["barbell", "pullup_bar"]));
    expect(c.map((x) => x.name)).toEqual(["Run"]);
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
