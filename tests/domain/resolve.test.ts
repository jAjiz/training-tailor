import { describe, it, expect } from "vitest";
import movementsJson from "../../data/movements.json";
import { MovementSchema } from "@/lib/domain/types";
import { createMovementResolver, normalizeMovementName } from "@/lib/domain/resolve";

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
