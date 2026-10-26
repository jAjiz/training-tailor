import { describe, it, expect, vi } from "vitest";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { PipelineResult, WorkoutComponent } from "@/lib/engine/types";
import { collectUnrecognized, newlyResolved, recordUnrecognized, type UnrecognizedStore } from "@/lib/unrecognized";
import { couplet, fixtureDomain, identityResult } from "../fixtures/workouts";

const unknown = (base: WorkoutComponent, movement: string): WorkoutComponent => ({ ...base, movement, canonical: null });

function result(extraOriginal: string[] = [], extraTailored: string[] = []): PipelineResult {
  const original = couplet();
  const tailored = identityResult(couplet());
  const base = original.blocks[0].components[0];
  original.blocks[0].components.push(...extraOriginal.map((m) => unknown(base, m)));
  tailored.blocks[0].components.push(...extraTailored.map((m) => unknown(base, m)));
  return { original, conditions: [], restrictions: [], unavailableEquipment: [], tailored, findings: [], feedbackHistory: [], model: "fake" };
}

function store(fail = false): UnrecognizedStore & { record: ReturnType<typeof vi.fn> } {
  return { record: vi.fn(async () => { if (fail) throw new Error("db down"); }) };
}

describe("collectUnrecognized", () => {
  it("returns nothing when every movement resolved", () => {
    expect(collectUnrecognized(result())).toEqual([]);
  });

  it("collects each unresolved name once, from the original and the tailored session", () => {
    expect(collectUnrecognized(result(["Test Unlisted Carry"], [" test unlisted carry ", "Test Unlisted Squat"]))).toEqual([
      { key: "testunlistedcarry", example: "Test Unlisted Carry" },
      { key: "testunlistedsquat", example: "Test Unlisted Squat" },
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
    await recordUnrecognized(s, result(["Test Unlisted Carry"]));
    expect(s.record).toHaveBeenCalledWith([{ key: "testunlistedcarry", example: "Test Unlisted Carry" }]);
  });

  it("does not touch the store when there is nothing to record", async () => {
    const s = store();
    await recordUnrecognized(s, result());
    expect(s.record).not.toHaveBeenCalled();
  });

  it("never fails the request when the store fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordUnrecognized(store(true), result(["Test Unlisted Carry"]))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("newlyResolved", () => {
  it("closes the entries the library now resolves", () => {
    const resolve = createMovementResolver(fixtureDomain().movements);
    expect(newlyResolved([
      { key: "thr", example: "THR" },
      { key: "testunlistedcarry", example: "Test Unlisted Carry" },
    ], resolve)).toEqual([{ key: "thr", resolvedTo: "Test Hang Raise" }]);
  });
});
