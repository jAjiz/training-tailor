import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import type { ActiveCondition } from "@/lib/domain/assess";
import { validateTailoring, type ValidateArgs } from "@/lib/engine/validate";
import type { TailoringResult } from "@/lib/engine/types";
import { fran, identityResult, split, sprint } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const condition = (key: string): ActiveCondition => ({
  contraindication: domain.contraindications.find((c) => c.key === key)!, side: null, severity: "moderate",
});

const identity = (original = fran()): TailoringResult => identityResult(original);

function run(overrides: Partial<ValidateArgs> = {}) {
  return validateTailoring({
    original: fran(), result: identity(), movements: domain.movements, active: [], equipment: null, timeCapMinutes: null,
    ...overrides,
  });
}

const swap = (r: TailoringResult, movement: string, canonical: string | null) => {
  r.blocks[0].components[0] = { ...r.blocks[0].components[0], movement, canonical };
  return r;
};

describe("validateTailoring", () => {
  it("accepts an identity result with no conditions", () => {
    expect(run()).toEqual([]);
  });

  it("flags a contraindicated movement as a violation", () => {
    const f = run({ active: [condition("shoulder_impingement")] });
    expect(f.filter((x) => x.kind === "contraindicated_movement").map((x) => x.movement)).toEqual(["Thruster", "Pull-up"]);
    expect(f.every((x) => x.severity === "violation")).toBe(true);
  });

  it("warns about a caution movement", () => {
    const r = swap(identity(), "Dead Hang", "Dead Hang");
    const f = run({ result: r, active: [condition("hand_tear")] });
    expect(f.find((x) => x.movement === "Dead Hang")).toMatchObject({ kind: "caution_movement", severity: "warning" });
  });

  it("flags missing equipment", () => {
    const f = run({ equipment: ["pullup_bar"] });
    expect(f).toContainEqual(expect.objectContaining({ kind: "equipment_unavailable", movement: "Thruster", severity: "violation" }));
  });

  it("rejects a newly introduced unknown movement but only warns about one kept from the original", () => {
    expect(run({ result: swap(identity(), "Zercher Carry", null) }))
      .toContainEqual(expect.objectContaining({ kind: "unrecognized_movement", severity: "violation" }));
    const original = fran();
    original.blocks[0].components[0] = { ...original.blocks[0].components[0], movement: "Zercher Carry", canonical: null };
    expect(run({ original, result: identity(original) }))
      .toContainEqual(expect.objectContaining({ kind: "unrecognized_movement", severity: "warning" }));
  });

  it("enforces the time cap with 10% tolerance", () => {
    expect(run({ timeCapMinutes: 6 })).toEqual([]);
    const r = identity();
    r.blocks[0].timeDomainMinutes = 7;
    expect(run({ result: r, timeCapMinutes: 6 })).toEqual([
      expect.objectContaining({ kind: "time_cap_exceeded", severity: "violation" }),
    ]);
  });

  it("rejects a changed block quality and warns about a changed energy system", () => {
    const r = identity();
    r.blocks[0].stimulus = { ...sprint, quality: "strength" };
    expect(run({ result: r })).toContainEqual(expect.objectContaining({ kind: "stimulus_drift", severity: "violation" }));
    const r2 = identity();
    r2.blocks[0].stimulus = { ...sprint, energySystem: "oxidative" };
    expect(run({ result: r2 })).toContainEqual(expect.objectContaining({ kind: "stimulus_drift", severity: "warning" }));
  });

  it("requires every original block to be mapped or dropped", () => {
    const original = split();
    const r = identity(original);
    r.blocks = [r.blocks[0]];
    expect(run({ original, result: r })).toContainEqual(expect.objectContaining({ kind: "unaccounted_block", blockIndex: 1 }));
    r.droppedBlocks = [{ index: 1, reason: "No time today." }];
    expect(run({ original, result: r }).filter((x) => x.kind === "unaccounted_block")).toEqual([]);
  });

  it("skips the stimulus check for merged blocks", () => {
    const original = split();
    const r = identity(original);
    r.blocks = [{ ...r.blocks[1], sourceBlocks: [0, 1] }];
    expect(run({ original, result: r }).filter((x) => x.kind === "stimulus_drift")).toEqual([]);
  });
});
