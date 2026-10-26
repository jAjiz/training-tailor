import { describe, it, expect } from "vitest";
import { convertEffort } from "@/lib/domain/conversions";

const conversions = {
  effort: [
    {
      key: "test_cardio", note: "Test cardio",
      equivalents: [
        { movement: "Test Run", unit: "meters" as const, male: 400, female: 400 },
        { movement: "Test Row", unit: "meters" as const, male: 500, female: 500 },
        { movement: "Test Bike", unit: "calories" as const, male: 30, female: 10 },
      ],
    },
    {
      key: "test_rope", note: "Test rope",
      equivalents: [
        { movement: "Test Double", unit: "reps" as const, male: 1, female: 1 },
        { movement: "Test Single", unit: "reps" as const, male: 3, female: 3 },
      ],
    },
  ],
  implementLoad: [],
};

describe("convertEffort", () => {
  it("scales an amount by the ratio of the two equivalents", () => {
    expect(convertEffort(conversions, { movement: "Test Run", unit: "meters", amount: 800 }, { movement: "Test Row", unit: "meters" }, "male")).toBe(1000);
  });

  it("uses the sex-specific amount and rounds calories to integers", () => {
    const from = { movement: "Test Run", unit: "meters" as const, amount: 100 };
    const to = { movement: "Test Bike", unit: "calories" as const };
    expect(convertEffort(conversions, from, to, "male")).toBe(8);
    expect(convertEffort(conversions, from, to, "female")).toBe(3);
    expect(convertEffort(conversions, from, to, null)).toBe(5);
  });

  it("rounds meters to the nearest 10", () => {
    expect(convertEffort(conversions, { movement: "Test Run", unit: "meters", amount: 303 }, { movement: "Test Row", unit: "meters" }, "male")).toBe(380);
  });

  it("converts between rep movements", () => {
    expect(convertEffort(conversions, { movement: "Test Double", unit: "reps", amount: 50 }, { movement: "Test Single", unit: "reps" }, null)).toBe(150);
  });

  it("returns null when no group holds both efforts", () => {
    expect(convertEffort(conversions, { movement: "Test Run", unit: "meters", amount: 400 }, { movement: "Test Single", unit: "reps" }, null)).toBeNull();
  });
});
