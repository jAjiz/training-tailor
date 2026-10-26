import { describe, it, expect } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { createMovementResolver } from "@/lib/domain/resolve";
import { planComponents, goalFamily } from "@/lib/engine/plan";
import { StructuredOutputError } from "@/lib/ai/provider";
import { allowedMovementNames, buildTailorPrompt, tailor, type TailorInput } from "@/lib/engine/tailor";
import { emptyProfile, emptyRequest } from "@/lib/engine/types";
import { component, couplet, fixtureDomain, identityResult, toTailoringDraft } from "../fixtures/workouts";

const domain = fixtureDomain();

function input(overrides: Partial<TailorInput> = {}): TailorInput {
  const shoulder = domain.contraindications.find((c) => c.key === "test_shoulder")!;
  const ctx = {
    movements: domain.movements, resolve: createMovementResolver(domain.movements),
    active: [{ contraindication: shoulder, side: "right" as const, severity: "moderate" as const }], equipment: null,
  };
  return {
    original: couplet(),
    profile: { ...emptyProfile(), sex: "female", scalingLevel: "rx" },
    request: { ...emptyRequest(), situation: "Me duele el hombro derecho", targetMovement: "Test Hang Raise" },
    conditions: [{ key: "test_shoulder", side: "right", severity: "moderate", source: "today", evidence: "Me duele el hombro derecho" }],
    contraindications: domain.contraindications,
    plan: planComponents(couplet(), ctx),
    goal: goalFamily("Test Hang Raise", ctx),
    equipment: null,
    movements: domain.movements,
    conversions: domain.conversions,
    previousAttempt: null,
    violations: [],
    restrictions: [],
    ...overrides,
  };
}

describe("buildTailorPrompt", () => {
  it("grounds the model in the plan, the conditions and the candidates", () => {
    const p = buildTailorPrompt(input());
    expect(p).toContain("[b0.c0] Test Combo → AVOID");
    expect(p).toContain("MUST CHANGE");
    expect(p).toContain("candidates: Test Goblet (ok)");
    expect(p).toContain("- test_shoulder (Test Shoulder) side=right severity=moderate source=today");
    expect(p).toContain("EQUIPMENT AVAILABLE: a full box");
    expect(p).toContain("- Test Goblet [squat; beginner; equip: kettlebell;");
    // The shoulder condition avoids kipping, so the kipping member of the family is out and traction is a caution
    expect(p).toContain("GOAL FAMILY: Test Knee Raise (ok), Test Strict Raise (caution)");
    expect(p).toContain("Test Run 300/300 meters = Test Erg 700/700 meters");
    expect(p).toContain('"sex":"female"');
    expect(p).not.toContain("PREVIOUS ATTEMPT");
    expect(p).not.toContain("REJECTED");
  });

  it("labels each plan reason with its own verdict, so a mild condition does not read as a ban", () => {
    const c = (key: string) => domain.contraindications.find((x) => x.key === key)!;
    const plan = planComponents(couplet(), {
      movements: domain.movements, resolve: createMovementResolver(domain.movements), equipment: ["dumbbell"],
      active: [
        { contraindication: c("test_shoulder"), side: "right", severity: "moderate" },
        { contraindication: c("test_knee"), side: "left", severity: "mild" },
      ],
    });
    const p = buildTailorPrompt(input({ plan, equipment: ["dumbbell"] }));
    expect(p).toContain("test_shoulder: shoulder: overhead = avoid");
    expect(p).toContain("test_knee: knee: deep_flexion = caution");
    expect(p).toContain("Test Dumbbell Squat (ok)");
  });

  it("marks related-pattern candidates so the model knows the pattern changes", () => {
    const hanging = domain.contraindications.find((x) => x.key === "test_no_hanging")!;
    const plan = planComponents(couplet(), {
      movements: domain.movements, resolve: createMovementResolver(domain.movements), equipment: ["dumbbell"],
      active: [{ contraindication: hanging, side: null, severity: "moderate" }],
    });
    expect(buildTailorPrompt(input({ plan, equipment: ["dumbbell"] }))).toContain("Test Dumbbell Row (ok, related pattern)");
  });

  it("tells the model to remove a movement that has no candidate", () => {
    const hanging = domain.contraindications.find((x) => x.key === "test_no_hanging")!;
    const plan = planComponents(couplet(), {
      movements: domain.movements, resolve: createMovementResolver(domain.movements), equipment: ["pullup_bar"],
      active: [{ contraindication: hanging, side: null, severity: "moderate" }],
    });
    const p = buildTailorPrompt(input({ plan, equipment: ["pullup_bar"] }));
    expect(p).toMatch(/\[b0\.c1] Test Pull → AVOID.*MUST CHANGE; no candidate: remove it/);
  });

  it("lists today's restrictions with their plan keys, or none", () => {
    expect(buildTailorPrompt(input())).toContain("TODAY'S RESTRICTIONS (the athlete's own scope: each bans exactly what it lists):\nnone");
    const r = { side: "right" as const, mechanisms: [], positions: [], replacements: [] };
    const p = buildTailorPrompt(input({ restrictions: [
      { ...r, site: "shoulder", movements: ["Test Hoist"], evidence: "no puedo hacer hoist" },
      { ...r, site: null, side: null, movements: [], mechanisms: ["overhead"], evidence: "nada por encima de la cabeza" },
      { ...r, site: "knee", movements: [], evidence: "la rodilla" },
    ] }));
    expect(p).toContain('- today_0: shoulder (right); cannot do: Test Hoist — "no puedo hacer hoist"');
    expect(p).toContain('- today_1: no site named; no overhead load — "nada por encima de la cabeza"');
    expect(p).toContain('- today_2: knee (right); context only (the athlete can do everything) — "la rodilla"');
  });

  it("lists the athlete's equipment when it is restricted", () => {
    expect(buildTailorPrompt(input({ equipment: ["dumbbell", "box"] }))).toContain("EQUIPMENT AVAILABLE: dumbbell, box");
  });

  it("adds the refine section with the rejected attempt and the feedback history", () => {
    const p = buildTailorPrompt(input({
      previousAttempt: { result: identityResult(couplet()), feedbackHistory: ["too easy", "still hurts"] },
    }));
    expect(p).toContain("PREVIOUS ATTEMPT");
    expect(p).toContain("- too easy\n- still hurts");
  });

  it("adds the rejected findings on a retry", () => {
    const p = buildTailorPrompt(input({
      violations: [{ kind: "contraindicated_movement", severity: "violation", blockIndex: 0, movement: "Test Combo", message: "Test Combo is contraindicated." }],
    }));
    expect(p).toContain("REJECTED BY THE SAFETY CHECK");
    expect(p).toContain("- [contraindicated_movement] Test Combo is contraindicated.");
  });
});

describe("tailor", () => {
  it("returns the modification with canonical names resolved by code", async () => {
    const draft = toTailoringDraft(couplet());
    draft.blocks[0].components = [component("Test Goblet", { reps: "21-15-9" }), component("Test Row", { reps: "21-15-9" })];
    const result = await tailor(new FakeProvider({ TailoringResult: draft }), input());
    expect(result.blocks[0].components.map((c) => c.canonical)).toEqual(["Test Goblet", "Test Row"]);
  });

  it("only lets the model name library movements or keep the original's unrecognized ones", async () => {
    const original = couplet();
    original.blocks[0].components.push({ ...original.blocks[0].components[0], movement: "Test Unlisted Carry", canonical: null });
    const names = allowedMovementNames(original, domain.movements);
    expect(names).toContain("Test Combo");
    expect(names).toContain("Test Unlisted Carry");
    expect(names).not.toContain("Test Invented");

    const provider = new FakeProvider({ TailoringResult: toTailoringDraft(original) });
    await tailor(provider, input({ original }));
    const schema = provider.calls[0].schema;
    const invented = toTailoringDraft(original);
    invented.blocks[0].components[0] = component("Test Invented", { reps: "21-15-9" });
    expect(schema.safeParse(invented).success).toBe(false);
    const alias = toTailoringDraft(original);
    alias.blocks[0].components[0] = component("TP", { reps: "21-15-9" });
    expect(schema.safeParse(alias).success).toBe(false);
  });

  it("restricts the change summary to allowed names or a removal", async () => {
    const provider = new FakeProvider({ TailoringResult: toTailoringDraft(couplet()) });
    await tailor(provider, input());
    const schema = provider.calls[0].schema;
    const withChange = (modified: string) => ({
      ...toTailoringDraft(couplet()), changes: [{ blockIndex: 0, original: "Test Combo", modified, reason: "x" }],
    });
    expect(schema.safeParse(withChange("Test Squat")).success).toBe(true);
    expect(schema.safeParse(withChange("(removed)")).success).toBe(true);
    expect(schema.safeParse(withChange("Test Invented")).success).toBe(false);
  });

  it("tells the model never to change a movement for pain the plan does not mark", async () => {
    const provider = new FakeProvider({ TailoringResult: toTailoringDraft(couplet()) });
    await tailor(provider, input());
    expect(provider.calls[0].systemPrompt).toMatch(/Never change, drop or scale down a movement for pain the plan does not mark/);
  });

  it("tells the model to keep the safe part of a combined movement", async () => {
    const provider = new FakeProvider({ TailoringResult: toTailoringDraft(couplet()) });
    await tailor(provider, input());
    expect(provider.calls[0].systemPrompt).toMatch(/combines patterns/);
    expect(provider.calls[0].systemPrompt).toMatch(/\(removed\)/);
  });

  it("rejects an invented movement instead of returning it", async () => {
    const draft = toTailoringDraft(couplet());
    draft.blocks[0].components = [component("Test Invented", { reps: "21-15-9" })];
    await expect(tailor(new FakeProvider({ TailoringResult: draft }), input())).rejects.toBeInstanceOf(StructuredOutputError);
  });
});
