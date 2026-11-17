import { describe, it, expect } from "vitest";
import { evaluateScore, formatDuration, formatScore, scoreTarget, type ScoreTarget } from "@/lib/training/scoring";

const custom = (scoring: string, timeCapSeconds: number | null = null): ScoreTarget =>
  scoreTarget({ kind: "custom", scoring, timeCapSeconds });

describe("evaluateScore", () => {
  it("ranks finished for-time results by time, faster higher", () => {
    expect(evaluateScore(custom("for_time"), { seconds: 572 })).toEqual({ score: { seconds: 572 }, sortKey: -572, capped: false });
  });

  it("accepts capped results only on blocks with a time cap, ranked by reps", () => {
    expect(evaluateScore(custom("for_time", 900), { capped: true, reps: 87 })).toEqual({ score: { capped: true, reps: 87 }, sortKey: 87, capped: true });
    expect(evaluateScore(custom("for_time"), { capped: true, reps: 87 })).toBeNull();
  });

  it("rejects a finish time beyond the cap and a zero time", () => {
    expect(evaluateScore(custom("for_time", 900), { seconds: 901 })).toBeNull();
    expect(evaluateScore(custom("for_time"), { seconds: 0 })).toBeNull();
  });

  it("orders AMRAPs by rounds then reps", () => {
    const a = evaluateScore(custom("amrap"), { rounds: 5, reps: 12 })!;
    const b = evaluateScore(custom("amrap"), { rounds: 6, reps: 0 })!;
    expect(b.sortKey! > a.sortKey!).toBe(true);
  });

  it("takes single values for the other scorings", () => {
    expect(evaluateScore(custom("reps"), { reps: 150 })?.sortKey).toBe(150);
    expect(evaluateScore(custom("load"), { kg: 102.5 })?.sortKey).toBe(102.5);
    expect(evaluateScore(custom("calories"), { calories: 45 })?.sortKey).toBe(45);
    expect(evaluateScore(custom("distance"), { meters: 1200 })?.sortKey).toBe(1200);
    expect(evaluateScore(custom("max_time"), { seconds: 95 })?.sortKey).toBe(95);
  });

  it("rejects wrong shapes, extra keys, negatives, fractions of reps and 'none'", () => {
    expect(evaluateScore(custom("reps"), { kg: 10 })).toBeNull();
    expect(evaluateScore(custom("reps"), { reps: 10, extra: 1 })).toBeNull();
    expect(evaluateScore(custom("reps"), { reps: -1 })).toBeNull();
    expect(evaluateScore(custom("reps"), { reps: 1.5 })).toBeNull();
    expect(evaluateScore(custom("none"), {})).toBeNull();
  });

  it("stores barbell sets without a rank", () => {
    expect(evaluateScore({ kind: "barbell" }, { sets: [{ kg: 100, reps: 5 }] })).toEqual({ score: { sets: [{ kg: 100, reps: 5 }] }, sortKey: null, capped: false });
    expect(evaluateScore({ kind: "barbell" }, { sets: [] })).toBeNull();
  });
});

describe("formatScore", () => {
  it("formats durations", () => {
    expect(formatDuration(572)).toBe("9:32");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("formats every scoring", () => {
    expect(formatScore(custom("for_time"), { seconds: 572 }, "en")).toBe("9:32");
    expect(formatScore(custom("for_time", 900), { capped: true, reps: 87 }, "en")).toBe("CAP · 87");
    expect(formatScore(custom("amrap"), { rounds: 5, reps: 12 }, "en")).toBe("5 + 12");
    expect(formatScore(custom("reps"), { reps: 150 }, "en")).toBe("150");
    expect(formatScore(custom("load"), { kg: 102.5 }, "en")).toBe("102.5 kg");
    expect(formatScore(custom("calories"), { calories: 45 }, "en")).toBe("45 cal");
    expect(formatScore(custom("distance"), { meters: 1200 }, "en")).toBe("1200 m");
    expect(formatScore(custom("max_time"), { seconds: 95 }, "en")).toBe("1:35");
    expect(formatScore({ kind: "barbell" }, { sets: [{ kg: 100, reps: 5 }, { kg: 102.5, reps: 3 }] }, "en")).toBe("5×100 kg · 3×102.5 kg");
  });

  it("writes decimals in the viewer's language, without thousands separators", () => {
    expect(formatScore(custom("load"), { kg: 102.5 }, "es")).toBe("102,5 kg");
    expect(formatScore(custom("distance"), { meters: 1200 }, "es")).toBe("1200 m");
    expect(formatScore({ kind: "barbell" }, { sets: [{ kg: 102.5, reps: 3 }] }, "es")).toBe("3×102,5 kg");
  });
});
