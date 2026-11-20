import { describe, it, expect } from "vitest";
import type { RecordsCatalog } from "@/lib/domain/types";
import {
  bestByLoad, bestByReps, bestByTarget, bestDistance, bestSetAbove, currentOneRm, epley, findRecordEntry, formatDuration,
  formatTarget, parseDuration, recordEntries, recordFits, type RecordFields,
} from "@/lib/training/records";

const d = (day: number) => new Date(Date.UTC(2026, 9, day));

const label = { en: "Test", es: "Test" };
const catalog: RecordsCatalog = {
  lift: [{ label, entries: [{ movement: "Test Squat" }] }],
  gymnastics: [{ label, entries: [
    { movement: "Test Pull", measure: "reps", weighted: true },
    { movement: "Test Sit", measure: "reps", weighted: false },
    { movement: "Test Walk", measure: "distance" },
  ] }],
  cardio: [{ label, entries: [{ movement: "Test Row", targets: [{ distanceM: 2000 }, { calories: 50 }] }] }],
};
const row = (over: Partial<RecordFields>): RecordFields =>
  ({ kind: "lift", kg: null, reps: null, distanceM: null, calories: null, seconds: null, ...over });

describe("catalog entries", () => {
  it("resolves one entry per tab, in catalog order, and nothing for a movement outside it", () => {
    expect(recordEntries(catalog).map((e) => [e.tab, e.kind, e.movement])).toEqual([
      ["lift", "lift", "Test Squat"],
      ["gymnastics", "reps", "Test Pull"], ["gymnastics", "reps", "Test Sit"], ["gymnastics", "distance", "Test Walk"],
      ["cardio", "time", "Test Row"],
    ]);
    expect(findRecordEntry(catalog, "Test Pull")).toEqual({ tab: "gymnastics", kind: "reps", movement: "Test Pull", weighted: true });
    expect(findRecordEntry(catalog, "Test Nope")).toBeNull();
  });

  it("fits a row to its entry's kind, load and targets", () => {
    const entry = (name: string) => findRecordEntry(catalog, name);
    expect(recordFits(entry("Test Pull"), row({ kind: "reps", reps: 5, kg: 10 }))).toBe(true);
    expect(recordFits(entry("Test Sit"), row({ kind: "reps", reps: 5, kg: 10 }))).toBe(false);
    expect(recordFits(entry("Test Sit"), row({ kind: "reps", reps: 5 }))).toBe(true);
    expect(recordFits(entry("Test Row"), row({ kind: "time", calories: 50, seconds: 160 }))).toBe(true);
    expect(recordFits(entry("Test Row"), row({ kind: "time", distanceM: 500, seconds: 90 }))).toBe(false);
    expect(recordFits(entry("Test Squat"), row({ kind: "reps", reps: 5 }))).toBe(false);
    expect(recordFits(entry("Test Walk"), row({ kind: "distance", distanceM: 25 }))).toBe(true);
    expect(recordFits(null, row({ kind: "lift", kg: 100, reps: 1 }))).toBe(false);
  });
});

describe("cardio and distance bests", () => {
  it("keeps the lowest time per target, in the entry's target order", () => {
    const rows = [
      { calories: 50, distanceM: null, seconds: 170, achievedOn: d(1) },
      { calories: null, distanceM: 2000, seconds: 430, achievedOn: d(2) },
      { calories: 50, distanceM: null, seconds: 160, achievedOn: d(3) },
      { calories: null, distanceM: 500, seconds: 95, achievedOn: d(4) }, // not a target any more
    ];
    expect(bestByTarget(rows, [{ distanceM: 2000 }, { calories: 50 }]).map((r) => r.seconds)).toEqual([430, 160]);
  });

  it("keeps the longest distance, the later on a tie", () => {
    expect(bestDistance([{ distanceM: 20, achievedOn: d(1) }, { distanceM: 25, achievedOn: d(2) }, { distanceM: 25, achievedOn: d(3) }]))
      .toEqual({ distanceM: 25, achievedOn: d(3) });
    expect(bestDistance([])).toBeNull();
  });

  it("formats targets", () => {
    expect([formatTarget({ distanceM: 500 }), formatTarget({ distanceM: 2000 }), formatTarget({ calories: 50 })])
      .toEqual(["500 m", "2 km", "50 cal"]);
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

describe("durations", () => {
  it("formats seconds as m:ss or h:mm:ss", () => {
    expect(formatDuration(425)).toBe("7:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("reads m:ss and h:mm:ss, and nothing else", () => {
    expect(parseDuration(" 7:05 ")).toBe(425);
    expect(parseDuration("1:02:05")).toBe(3725);
    expect(parseDuration("7:5")).toBeNull();
    expect(parseDuration("7:65")).toBeNull();
    expect(parseDuration("425")).toBeNull();
    expect(parseDuration("0:00")).toBeNull();
  });
});
