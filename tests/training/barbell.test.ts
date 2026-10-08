import { describe, it, expect } from "vitest";
import { getDomainData } from "@/lib/domain/repository";
import { describeSets, isLiftMovement, liftCatalog, percentToKg } from "@/lib/training/barbell";

describe("liftCatalog", () => {
  it("groups barbell movements by their first pattern, squats first", async () => {
    const { movements } = await getDomainData();
    const groups = liftCatalog(movements);
    expect(groups[0].pattern).toBe("squat");
    expect(groups[0].movements).toContain("Back Squat");
    const all = groups.flatMap((g) => g.movements);
    expect(all).not.toContain("Pull-up");
    expect(new Set(all).size).toBe(all.length);
  });

  it("recognizes lift movements by exact name", async () => {
    const { movements } = await getDomainData();
    expect(isLiftMovement("Back Squat", movements)).toBe(true);
    expect(isLiftMovement("back squat", movements)).toBe(false);
    expect(isLiftMovement("Air Squat", movements)).toBe(false);
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
