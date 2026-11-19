import { describe, it, expect } from "vitest";
import {
  bestByDistance, bestByLoad, bestByReps, bestSetAbove, currentOneRm, epley, recordKind, recordKindOf,
} from "@/lib/training/records";
import { testMovement } from "../helpers/library-builders";

const d = (day: number) => new Date(Date.UTC(2026, 9, day));

describe("recordKind", () => {
  it("puts barbell first, then monostructural, then bodyweight", () => {
    expect(recordKind({ equipment: ["barbell"], patterns: ["monostructural"] })).toBe("lift");
    expect(recordKind({ equipment: ["rower"], patterns: ["monostructural"] })).toBe("time");
    expect(recordKind({ equipment: [], patterns: ["squat", "monostructural"] })).toBe("time");
    expect(recordKind({ equipment: ["pullup_bar"], patterns: ["vertical_pull"] })).toBe("reps");
    expect(recordKind({ equipment: [], patterns: ["core"] })).toBe("reps");
  });

  it("gives no kind to a movement with load equipment other than a barbell", () => {
    expect(recordKind({ equipment: ["dumbbell"], patterns: ["hinge"] })).toBeNull();
    expect(recordKind({ equipment: ["kettlebell", "box"], patterns: ["squat"] })).toBeNull();
  });

  it("looks a movement up by name", () => {
    const movements = [testMovement("Test Pull", { equipment: ["pullup_bar"], patterns: ["vertical_pull"] })];
    expect(recordKindOf("Test Pull", movements)).toBe("reps");
    expect(recordKindOf("Test Unknown", movements)).toBeNull();
  });
});

describe("epley", () => {
  it("keeps a single and rounds an estimate down to 0.5 kg", () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 3)).toBe(110);
    expect(epley(95, 3)).toBe(104.5);
    expect(epley(102.5, 5)).toBe(119.5); // 119.58
  });
});

describe("currentOneRm", () => {
  it("is null without rows", () => {
    expect(currentOneRm([])).toBeNull();
  });

  it("takes an estimate above every real single, marked as estimated", () => {
    expect(currentOneRm([{ kg: 100, reps: 1, achievedOn: d(1) }, { kg: 95, reps: 3, achievedOn: d(5) }]))
      .toEqual({ kg: 104.5, estimated: true, achievedOn: d(5) });
  });

  it("prefers the real single on a tie with an estimate", () => {
    expect(currentOneRm([{ kg: 100, reps: 3, achievedOn: d(9) }, { kg: 110, reps: 1, achievedOn: d(1) }]))
      .toEqual({ kg: 110, estimated: false, achievedOn: d(1) });
  });

  it("takes the later of two equal singles", () => {
    expect(currentOneRm([{ kg: 100, reps: 1, achievedOn: d(1) }, { kg: 100, reps: 1, achievedOn: d(3) }])?.achievedOn).toEqual(d(3));
  });
});

describe("bestByReps", () => {
  it("keeps the heaviest row per rep count, the later on a tie", () => {
    const best = bestByReps([
      { kg: 90, reps: 3, achievedOn: d(1) }, { kg: 95, reps: 3, achievedOn: d(2) },
      { kg: 95, reps: 3, achievedOn: d(4) }, { kg: 100, reps: 1, achievedOn: d(3) },
    ]);
    expect(best.get(3)).toEqual({ kg: 95, reps: 3, achievedOn: d(4) });
    expect(best.get(1)?.kg).toBe(100);
  });
});

describe("bestSetAbove", () => {
  const rows = [{ kg: 95, reps: 3, achievedOn: d(1) }];

  it("offers the set with the highest estimate among those that beat their rep count", () => {
    // 90x5 is a first record at 5 reps (estimate 105) but 100x3 estimates 110.
    expect(bestSetAbove([{ kg: 100, reps: 3 }, { kg: 90, reps: 5 }], rows)).toEqual({ reps: 3, from: 95, to: 100 });
  });

  it("offers a first record at a rep count", () => {
    expect(bestSetAbove([{ kg: 80, reps: 5 }], rows)).toEqual({ reps: 5, from: null, to: 80 });
  });

  it("ignores rep counts off the list, sets that do not beat the best, and empty bars", () => {
    expect(bestSetAbove([{ kg: 200, reps: 4 }], rows)).toBeNull();
    expect(bestSetAbove([{ kg: 95, reps: 3 }], rows)).toBeNull();
    expect(bestSetAbove([{ kg: 0, reps: 1 }], [])).toBeNull();
  });

  it("takes fewer reps on equal estimates", () => {
    // 110x1 and 100x3 both estimate 110.
    expect(bestSetAbove([{ kg: 100, reps: 3 }, { kg: 110, reps: 1 }], [])).toEqual({ reps: 1, from: null, to: 110 });
  });
});

describe("bestByLoad", () => {
  it("keeps the most reps per added load, bodyweight first", () => {
    const best = bestByLoad([
      { reps: 8, kg: 20, achievedOn: d(1) }, { reps: 18, kg: null, achievedOn: d(1) }, { reps: 20, kg: null, achievedOn: d(2) },
    ]);
    expect(best.map((r) => [r.reps, r.kg])).toEqual([[20, null], [8, 20]]);
  });
});

describe("bestByDistance", () => {
  it("keeps the lowest time per distance, shortest distance first", () => {
    const best = bestByDistance([
      { distanceM: 2000, seconds: 430, achievedOn: d(1) }, { distanceM: 500, seconds: 95, achievedOn: d(1) },
      { distanceM: 2000, seconds: 425, achievedOn: d(2) },
    ]);
    expect(best.map((r) => [r.distanceM, r.seconds])).toEqual([[500, 95], [2000, 425]]);
  });
});
