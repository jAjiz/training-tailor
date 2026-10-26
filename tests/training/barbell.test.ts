import { describe, it, expect } from "vitest";
import { testMovement } from "../helpers/library-builders";
import { describeSets, isLiftMovement, liftCatalog, percentToKg } from "@/lib/training/barbell";

describe("liftCatalog", () => {
  const library = [
    testMovement("Test Rower", { patterns: ["horizontal_pull"], equipment: ["barbell"] }),
    testMovement("Test Hoist", { patterns: ["olympic"], equipment: ["barbell"] }),
    testMovement("Test Squat B", { patterns: ["squat", "vertical_push"], equipment: ["barbell"] }),
    testMovement("Test Squat A", { patterns: ["squat"], equipment: ["barbell", "box"] }),
    testMovement("Test Odd", { patterns: ["core"], equipment: ["barbell"] }),
    testMovement("Test Pull", { patterns: ["vertical_pull"], equipment: ["pullup_bar"] }),
  ];

  it("groups barbell movements by their first pattern, squats first and unlisted patterns last", () => {
    const groups = liftCatalog(library);
    expect(groups).toEqual([
      { pattern: "squat", movements: ["Test Squat A", "Test Squat B"] },
      { pattern: "olympic", movements: ["Test Hoist"] },
      { pattern: "horizontal_pull", movements: ["Test Rower"] },
      { pattern: "core", movements: ["Test Odd"] },
    ]);
  });

  it("recognizes lift movements by exact name", () => {
    expect(isLiftMovement("Test Squat A", library)).toBe(true);
    expect(isLiftMovement("test squat a", library)).toBe(false);
    expect(isLiftMovement("Test Pull", library)).toBe(false);
  });
});

describe("percentToKg", () => {
  it("rounds to the nearest 0.5 kg", () => {
    expect(percentToKg(80, 125)).toBe(100);
    expect(percentToKg(73, 101)).toBe(73.5); // 73.73
    expect(percentToKg(70, 101)).toBe(70.5); // 70.7
  });
});

describe("describeSets", () => {
  it("collapses identical consecutive sets", () => {
    expect(describeSets([{ reps: 5, percent: 80, kg: null }, { reps: 5, percent: 80, kg: null }, { reps: 5, percent: 80, kg: null }], null))
      .toEqual(["3 × 5 @ 80 %"]);
  });

  it("shows kg next to percentages when a 1RM is known", () => {
    expect(describeSets([{ reps: 3, percent: 85, kg: null }], 120)).toEqual(["3 @ 85 % (102 kg)"]);
  });

  it("keeps different sets on their own lines and prints fixed loads", () => {
    expect(describeSets([{ reps: 5, percent: null, kg: 60 }, { reps: 3, percent: null, kg: 70 }], null))
      .toEqual(["5 @ 60 kg", "3 @ 70 kg"]);
  });
});
