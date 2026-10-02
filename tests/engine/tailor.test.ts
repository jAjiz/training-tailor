import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { planComponents, goalFamily } from "@/lib/engine/plan";
import { buildTailorPrompt, tailor, type TailorInput } from "@/lib/engine/tailor";
import { emptyProfile, emptyRequest } from "@/lib/engine/types";
import { component, fran, identityResult, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

function input(overrides: Partial<TailorInput> = {}): TailorInput {
  const shoulder = domain.contraindications.find((c) => c.key === "shoulder_impingement")!;
  const ctx = {
    movements: domain.movements, resolve: createMovementResolver(domain.movements),
    active: [{ contraindication: shoulder, side: "right" as const, severity: "moderate" as const }], equipment: null,
  };
  return {
    original: fran(),
    profile: { ...emptyProfile(), sex: "female", scalingLevel: "rx" },
    request: { ...emptyRequest(), situation: "Me duele el hombro derecho", targetMovement: "Toes-to-Bar" },
    conditions: [{ key: "shoulder_impingement", side: "right", severity: "moderate", source: "today", evidence: "Me duele el hombro derecho" }],
    contraindications: domain.contraindications,
    plan: planComponents(fran(), ctx),
    goal: goalFamily("Toes-to-Bar", ctx),
    equipment: null,
    movements: domain.movements,
    conversions: domain.conversions,
    previousAttempt: null,
    violations: [],
    ...overrides,
  };
}

describe("buildTailorPrompt", () => {
  it("grounds the model in the plan, the conditions and the candidates", () => {
    const p = buildTailorPrompt(input());
    expect(p).toContain("[b0.c0] Thruster → AVOID");
    expect(p).toContain("MUST CHANGE");
    expect(p).toContain("candidates: Kettlebell Goblet Squat (ok)");
    expect(p).toContain("- shoulder_impingement (Shoulder impingement) side=right severity=moderate source=today");
    expect(p).toContain("EQUIPMENT AVAILABLE: a full box");
    expect(p).toContain("- Kettlebell Goblet Squat [squat; beginner; equip: kettlebell;");
    // shoulder_impingement blocks kipping, so only the strict/supported members of the family survive
    expect(p).toContain("GOAL FAMILY: Hanging Knee Raise (caution), Sit-up (ok), Strict Toes-to-Bar (caution)");
    expect(p).toContain("Run 400/400 meters = Row (Erg) 500/500 meters");
    expect(p).toContain('"sex":"female"');
    expect(p).not.toContain("PREVIOUS ATTEMPT");
    expect(p).not.toContain("REJECTED");
  });

  it("lists the athlete's equipment when it is restricted", () => {
    expect(buildTailorPrompt(input({ equipment: ["dumbbell", "box"] }))).toContain("EQUIPMENT AVAILABLE: dumbbell, box");
  });

  it("adds the refine section with the rejected attempt and the feedback history", () => {
    const p = buildTailorPrompt(input({
      previousAttempt: { result: identityResult(fran()), feedbackHistory: ["too easy", "still hurts"] },
    }));
    expect(p).toContain("PREVIOUS ATTEMPT");
    expect(p).toContain("- too easy\n- still hurts");
  });

  it("adds the rejected findings on a retry", () => {
    const p = buildTailorPrompt(input({
      violations: [{ kind: "contraindicated_movement", severity: "violation", blockIndex: 0, movement: "Thruster", message: "Thruster is contraindicated." }],
    }));
    expect(p).toContain("REJECTED BY THE SAFETY CHECK");
    expect(p).toContain("- [contraindicated_movement] Thruster is contraindicated.");
  });
});

describe("tailor", () => {
  it("returns the modification with canonical names resolved by code", async () => {
    const draft = toTailoringDraft(fran());
    draft.blocks[0].components = [component("KB Goblet Squat", { reps: "21-15-9" }), component("Ring Rows", { reps: "21-15-9" })];
    const result = await tailor(new FakeProvider({ TailoringResult: draft }), input());
    expect(result.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
  });
});
