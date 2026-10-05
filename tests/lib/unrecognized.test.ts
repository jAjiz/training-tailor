import { describe, it, expect, vi } from "vitest";
import movementsJson from "../../data/movements.json";
import { MovementSchema } from "@/lib/domain/types";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { PipelineResult, WorkoutComponent } from "@/lib/engine/types";
import { collectUnrecognized, newlyResolved, recordUnrecognized, type UnrecognizedStore } from "@/lib/unrecognized";
import { fran, identityResult } from "../fixtures/workouts";

const unknown = (base: WorkoutComponent, movement: string): WorkoutComponent => ({ ...base, movement, canonical: null });

function result(extraOriginal: string[] = [], extraTailored: string[] = []): PipelineResult {
  const original = fran();
  const tailored = identityResult(fran());
  const base = original.blocks[0].components[0];
  original.blocks[0].components.push(...extraOriginal.map((m) => unknown(base, m)));
  tailored.blocks[0].components.push(...extraTailored.map((m) => unknown(base, m)));
  return { original, conditions: [], unavailableEquipment: [], tailored, findings: [], feedbackHistory: [], model: "fake" };
}

function store(fail = false): UnrecognizedStore & { record: ReturnType<typeof vi.fn> } {
  return { record: vi.fn(async () => { if (fail) throw new Error("db down"); }) };
}

describe("collectUnrecognized", () => {
  it("returns nothing when every movement resolved", () => {
    expect(collectUnrecognized(result())).toEqual([]);
  });

  it("collects each unresolved name once, from the original and the tailored session", () => {
    expect(collectUnrecognized(result(["Zercher Carry"], [" zercher carry ", "Sandbag Bear Hug Squat"]))).toEqual([
      { key: "zerchercarry", example: "Zercher Carry" },
      { key: "sandbagbearhugsquat", example: "Sandbag Bear Hug Squat" },
    ]);
  });

  it("stores a bounded example, never a whole block of text", () => {
    const [entry] = collectUnrecognized(result(["x".repeat(500)]));
    expect(entry.example).toHaveLength(80);
  });
});

describe("recordUnrecognized", () => {
  it("records the entries", async () => {
    const s = store();
    await recordUnrecognized(s, result(["Zercher Carry"]));
    expect(s.record).toHaveBeenCalledWith([{ key: "zerchercarry", example: "Zercher Carry" }]);
  });

  it("does not touch the store when there is nothing to record", async () => {
    const s = store();
    await recordUnrecognized(s, result());
    expect(s.record).not.toHaveBeenCalled();
  });

  it("never fails the request when the store fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordUnrecognized(store(true), result(["Zercher Carry"]))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("newlyResolved", () => {
  it("closes the entries the library now resolves", () => {
    const resolve = createMovementResolver(movementsJson.map((m) => MovementSchema.parse(m)));
    expect(newlyResolved([
      { key: "t2b", example: "T2B" },
      { key: "zerchercarry", example: "Zercher Carry" },
    ], resolve)).toEqual([{ key: "t2b", resolvedTo: "Toes-to-Bar" }]);
  });
});
