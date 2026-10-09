import { describe, it, expect } from "vitest";
import { closedTarget, continuousTarget, defaultTargetDate } from "@/lib/training/copy-target";

describe("closedTarget", () => {
  it("turns 1-based week and day into a 0-based day index", () => {
    expect(closedTarget("day", 1, 1)).toBe(0);
    expect(closedTarget("day", 3, 2)).toBe(15);
  });

  it("turns a 1-based week into a 0-based week index", () => {
    expect(closedTarget("week", 4, null)).toBe(3);
  });
});

describe("continuousTarget", () => {
  const start = "2026-10-12"; // a Monday

  it("gives the day index of a date", () => {
    expect(continuousTarget("day", start, "2026-10-12")).toBe(0);
    expect(continuousTarget("day", start, "2026-10-21")).toBe(9);
  });

  it("gives the week of any day in it", () => {
    expect(continuousTarget("week", start, "2026-10-18")).toBe(0);
    expect(continuousTarget("week", start, "2026-10-19")).toBe(1);
    expect(continuousTarget("week", start, "2026-10-25")).toBe(1);
  });

  it("rejects dates before the start and malformed input", () => {
    expect(continuousTarget("day", start, "2026-10-11")).toBeNull();
    expect(continuousTarget("week", start, "")).toBeNull();
  });
});

describe("defaultTargetDate", () => {
  it("is the date of a day index, or the Monday of a week index", () => {
    expect(defaultTargetDate("day", "2026-10-12", 9)).toBe("2026-10-21");
    expect(defaultTargetDate("week", "2026-10-12", 2)).toBe("2026-10-26");
  });
});
