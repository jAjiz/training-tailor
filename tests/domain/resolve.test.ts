import { describe, it, expect } from "vitest";
import { createMovementResolver, movementFamily, normalizeMovementName } from "@/lib/domain/resolve";
import { testMovement } from "../helpers/library-builders";

describe("normalizeMovementName", () => {
  it("ignores case, spacing and punctuation, and spells out ampersands", () => {
    expect(normalizeMovementName("Pull-up")).toBe(normalizeMovementName("pull up"));
    expect(normalizeMovementName("Pull-up")).toBe(normalizeMovementName("PULLUP"));
    expect(normalizeMovementName("Clean & Jerk")).toBe(normalizeMovementName("clean and jerk"));
  });
});

describe("createMovementResolver", () => {
  const goblet = testMovement("Test Kettlebell Goblet Squat", { aliases: ["TGS"] });
  const press = testMovement("Test Push Press");
  const dbPress = testMovement("Test Dumbbell Push Press");
  const row = testMovement("Test Barbell Row");
  const hold = testMovement("Test Handstand Hold");
  const hspu = testMovement("Test Strict Handstand Push-up");
  const muscleUp = testMovement("Test Ring Muscle-up");
  const bar = testMovement("Test Toes-to-Bar");
  const resolve = createMovementResolver([goblet, press, dbPress, row, hold, hspu, muscleUp, bar]);

  it("resolves a canonical name and an alias to its own movement", () => {
    expect(resolve("Test Kettlebell Goblet Squat")).toBe(goblet);
    expect(resolve("TGS")).toBe(goblet);
  });

  it("ignores word order", () => {
    for (const n of ["Test Goblet KB Squat", "Test Goblet Squat KB", "KB Test Goblet Squat", "squat test goblet kettlebell"]) {
      expect(resolve(n), n).toBe(goblet);
    }
    expect(resolve("Test Press Push")).toBe(press);
  });

  it("expands common abbreviations before comparing", () => {
    expect(resolve("Test Push Press DB")).toBe(dbPress);
    expect(resolve("Test BB Row")).toBe(row);
    expect(resolve("Test Hold HS")).toBe(hold);
    expect(resolve("Test Strict HS Push-ups")).toBe(hspu);
    expect(resolve("Test Ring MU")).toBe(muscleUp);
  });

  it("never matches on a subset of the words", () => {
    expect(resolve("Test Squat")).toBeNull();
    expect(resolve("KB")).toBeNull();
    expect(resolve("Test Goblet Squat Heavy")).toBeNull();
  });

  it("resolves spelling variants and plurals", () => {
    expect(resolve("test toes to bar")).toBe(bar);
    expect(resolve("  test toes to bars ")).toBe(bar);
    expect(resolve("Test Handstand Holds")).toBe(hold);
    expect(resolve("test toes-to-bars")).toBe(bar);
  });

  it("returns null for an unknown movement", () => {
    expect(resolve("Test Unknown Carry")).toBeNull();
  });
});

describe("movementFamily", () => {
  const library = [
    testMovement("Test Power Snatch"),
    testMovement("Test Hang Power Snatch"),
    testMovement("Test Dumbbell Snatch"),
    testMovement("Test Dumbbell Squat Snatch"),
    testMovement("Test Power Clean"),
  ];

  it("lists every library movement whose name contains all the words, for a general name", () => {
    const names = movementFamily("Test Snatch", library).map((m) => m.name);
    expect(names).toEqual([
      "Test Power Snatch", "Test Hang Power Snatch", "Test Dumbbell Snatch", "Test Dumbbell Squat Snatch",
    ]);
    expect(movementFamily("Test DB snatch", library).map((m) => m.name)).toEqual(["Test Dumbbell Snatch", "Test Dumbbell Squat Snatch"]);
    expect(movementFamily("", library)).toEqual([]);
  });
});
