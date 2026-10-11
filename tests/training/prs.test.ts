import { describe, it, expect } from "vitest";
import { currentOneRm, singleAbove } from "@/lib/training/prs";

describe("PR rules", () => {
  it("takes the heaviest entry as the current 1RM", () => {
    expect(currentOneRm([{ kg: 140 }, { kg: 150 }, { kg: 145 }])).toBe(150);
    expect(currentOneRm([])).toBeNull();
  });

  it("detects a logged single above the current 1RM", () => {
    expect(singleAbove([{ kg: 140, reps: 3 }, { kg: 152.5, reps: 1 }, { kg: 155, reps: 1 }], 150)).toBe(155);
    expect(singleAbove([{ kg: 150, reps: 1 }], 150)).toBeNull(); // equal is not a PR
    expect(singleAbove([{ kg: 160, reps: 2 }], 150)).toBeNull(); // only singles count
  });

  it("offers the first single as a 1RM when there is none", () => {
    expect(singleAbove([{ kg: 100, reps: 1 }], null)).toBe(100);
    expect(singleAbove([{ kg: 0, reps: 1 }], null)).toBeNull();
  });
});
