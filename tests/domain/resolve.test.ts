import { describe, it, expect } from "vitest";
import movementsJson from "../../data/movements.json";
import { MovementSchema } from "@/lib/domain/types";
import { createMovementResolver, movementFamily, movementWordKey, normalizeMovementName } from "@/lib/domain/resolve";

const movements = movementsJson.map((m) => MovementSchema.parse(m));
const resolve = createMovementResolver(movements);

describe("normalizeMovementName", () => {
  it("ignores case, spacing and punctuation, and spells out ampersands", () => {
    expect(normalizeMovementName("Pull-up")).toBe(normalizeMovementName("pull up"));
    expect(normalizeMovementName("Pull-up")).toBe(normalizeMovementName("PULLUP"));
    expect(normalizeMovementName("Clean & Jerk")).toBe(normalizeMovementName("clean and jerk"));
  });
});

describe("createMovementResolver", () => {
  it("resolves every canonical name and alias to its own movement", () => {
    for (const m of movements) {
      for (const n of [m.name, ...m.aliases]) expect(resolve(n)?.name, n).toBe(m.name);
    }
  });

  it("no normalized name or alias points to two different movements", () => {
    const owner = new Map<string, string>();
    for (const m of movements) {
      for (const n of [m.name, ...m.aliases]) {
        const key = normalizeMovementName(n);
        const previous = owner.get(key);
        expect(previous === undefined || previous === m.name, `${n} collides with ${previous}`).toBe(true);
        owner.set(key, m.name);
      }
    }
  });

  it("no two movements share the same set of words once abbreviations are expanded", () => {
    const owner = new Map<string, string>();
    for (const m of movements) {
      for (const n of [m.name, ...m.aliases]) {
        const key = movementWordKey(n);
        const previous = owner.get(key);
        expect(previous === undefined || previous === m.name, `${n} [${key}] collides with ${previous}`).toBe(true);
        owner.set(key, m.name);
      }
    }
  });

  it("ignores word order", () => {
    for (const n of ["Goblet KB Squat", "Goblet Squat KB", "KB Goblet Squat", "squat goblet kettlebell"]) {
      expect(resolve(n)?.name, n).toBe("Kettlebell Goblet Squat");
    }
    expect(resolve("Press Push")?.name).toBe("Push Press");
    expect(resolve("Ups Pull")?.name).toBe("Pull-up");
  });

  it("expands common abbreviations before comparing", () => {
    expect(resolve("Push Press DB")?.name).toBe("Dumbbell Push Press");
    expect(resolve("BB Row")?.name).toBe("Bent-over Row");
    expect(resolve("DB OHS")?.name).toBe("Dumbbell Overhead Squat");
    expect(resolve("Hold HS")?.name).toBe("Handstand Hold");
    expect(resolve("Strict HS Push-ups")?.name).toBe("Strict Handstand Push-up");
    expect(resolve("Ring MUs")?.name).toBe("Ring Muscle-up");
  });

  it("never matches on a subset of the words", () => {
    expect(resolve("Squat")).toBeNull();
    expect(resolve("KB")).toBeNull();
    expect(resolve("Goblet Squat Heavy")).toBeNull();
  });

  it("resolves workout shorthand, spelling variants and plurals", () => {
    expect(resolve("T2B")?.name).toBe("Toes-to-Bar");
    expect(resolve("toes to bar")?.name).toBe("Toes-to-Bar");
    expect(resolve("Pull ups")?.name).toBe("Pull-up");
    expect(resolve("Thrusters")?.name).toBe("Thruster");
    expect(resolve("box jumps")?.name).toBe("Box Jump");
    expect(resolve("wall walks")?.name).toBe("Wall Climb");
    expect(resolve("  Burpees ")?.name).toBe("Burpee");
  });

  it("returns null for an unknown movement", () => {
    expect(resolve("Zercher Carry")).toBeNull();
  });
});

describe("movementFamily", () => {
  it("lists every library movement whose name contains all the words, for a general name", () => {
    const names = movementFamily("Snatch", movements).map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Power Snatch", "Hang Power Snatch", "Squat Snatch", "Dumbbell Snatch"]));
    expect(names).not.toContain("Power Clean");
    expect(movementFamily("DB snatch", movements).map((m) => m.name)).toEqual(expect.arrayContaining(["Dumbbell Snatch", "Dumbbell Squat Snatch"]));
    expect(movementFamily("DB snatch", movements).map((m) => m.name)).not.toContain("Power Snatch");
    expect(movementFamily("", movements)).toEqual([]);
  });
});
