import { describe, it, expect } from "vitest";
import type { ActiveCondition } from "@/lib/domain/assess";
import { validateTailoring, type ValidateArgs } from "@/lib/engine/validate";
import { testMovement } from "../helpers/library-builders";
import type { TailoringResult } from "@/lib/engine/types";
import { couplet, fixtureDomain, identityResult, split, sprint } from "../fixtures/workouts";

const domain = fixtureDomain();

const condition = (key: string): ActiveCondition => ({
  contraindication: domain.contraindications.find((c) => c.key === key)!, side: null, severity: "moderate",
});

const identity = (original = couplet()): TailoringResult => identityResult(original);

function run(overrides: Partial<ValidateArgs> = {}) {
  return validateTailoring({
    original: couplet(), result: identity(), movements: domain.movements, active: [], equipment: null, timeCapMinutes: null,
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
    const f = run({ active: [condition("test_shoulder"), condition("test_no_hanging")] });
    expect(f.filter((x) => x.kind === "contraindicated_movement").map((x) => x.movement)).toEqual(["Test Combo", "Test Pull"]);
    expect(f.every((x) => x.severity === "violation")).toBe(true);
  });

  it("warns about a caution movement", () => {
    const hang = testMovement("Test Hang", { patterns: ["hold"], positions: ["hanging"], stresses: [{ site: "grip", mechanisms: ["traction"], load: "high" }] });
    const r = swap(identity(), "Test Hang", "Test Hang");
    const f = run({ result: r, movements: [...domain.movements, hang], active: [condition("test_hand")] });
    expect(f.find((x) => x.movement === "Test Hang")).toMatchObject({ kind: "caution_movement", severity: "warning" });
  });

  it("rejects a change summary that names a movement the block does not prescribe", () => {
    const r = swap(identity(), "Test Squat", "Test Squat");
    r.changes = [{ blockIndex: 0, original: "Test Combo", modified: "Test Press", reason: "x" }];
    expect(run({ result: r })).toContainEqual(expect.objectContaining({
      kind: "change_mismatch", severity: "violation", blockIndex: 0, movement: "Test Press",
    }));
  });

  it("accepts change summaries that match the prescription or record a removal", () => {
    const r = swap(identity(), "Test Squat", "Test Squat");
    r.changes = [
      { blockIndex: 0, original: "Test Combo", modified: "Test Squat", reason: "x" },
      { blockIndex: null, original: "Test Combo", modified: "test squats", reason: "x" },
      { blockIndex: 0, original: "Test Pull", modified: "(removed)", reason: "x" },
    ];
    expect(run({ result: r }).filter((f) => f.kind === "change_mismatch")).toEqual([]);
  });

  it("flags missing equipment", () => {
    const f = run({ equipment: ["pullup_bar"] });
    expect(f).toContainEqual(expect.objectContaining({ kind: "equipment_unavailable", movement: "Test Combo", severity: "violation" }));
  });

  it("rejects a newly introduced unknown movement but only warns about one kept from the original", () => {
    expect(run({ result: swap(identity(), "Test Unlisted Carry", null) }))
      .toContainEqual(expect.objectContaining({ kind: "unrecognized_movement", severity: "violation" }));
    const original = couplet();
    original.blocks[0].components[0] = { ...original.blocks[0].components[0], movement: "Test Unlisted Carry", canonical: null };
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
