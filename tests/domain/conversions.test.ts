import { describe, it, expect } from "vitest";
import conversionsJson from "../../data/conversions.json";
import movementsJson from "../../data/movements.json";
import { ConversionsSchema } from "@/lib/domain/types";
import { convertEffort } from "@/lib/domain/conversions";

const conversions = ConversionsSchema.parse(conversionsJson);
const names = new Set(movementsJson.map((m) => m.name));

describe("conversions data", () => {
  it("every equivalent names a real movement, once per unit", () => {
    for (const group of conversions.effort) {
      const seen = new Set<string>();
      for (const e of group.equivalents) {
        expect(names.has(e.movement), e.movement).toBe(true);
        const id = `${e.movement}/${e.unit}`;
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
  });

  it("implement load fractions are ordered ranges below 1", () => {
    for (const r of conversions.implementLoad) {
      expect(r.perHandFraction.low).toBeLessThanOrEqual(r.perHandFraction.high);
      expect(r.perHandFraction.high).toBeLessThan(1);
    }
  });
});

describe("convertEffort", () => {
  it("converts a run distance to rowing meters", () => {
    expect(convertEffort(conversions, { movement: "Run", unit: "meters", amount: 400 }, { movement: "Row (Erg)", unit: "meters" }, "male")).toBe(500);
  });

  it("uses the sex-specific amount and rounds calories to integers", () => {
    const from = { movement: "Run", unit: "meters" as const, amount: 800 };
    const to = { movement: "Air Bike", unit: "calories" as const };
    expect(convertEffort(conversions, from, to, "male")).toBe(40);
    expect(convertEffort(conversions, from, to, "female")).toBe(30);
    expect(convertEffort(conversions, from, to, null)).toBe(35);
  });

  it("rounds meters to the nearest 10", () => {
    expect(convertEffort(conversions, { movement: "Run", unit: "meters", amount: 300 }, { movement: "Row (Erg)", unit: "meters" }, "male")).toBe(380);
  });

  it("converts double-unders to single-unders", () => {
    expect(convertEffort(conversions, { movement: "Double-under", unit: "reps", amount: 50 }, { movement: "Single-under", unit: "reps" }, null)).toBe(150);
  });

  it("returns null when no group holds both efforts", () => {
    expect(convertEffort(conversions, { movement: "Run", unit: "meters", amount: 400 }, { movement: "Single-under", unit: "reps" }, null)).toBeNull();
  });
});
