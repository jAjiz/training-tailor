import { describe, it, expect } from "vitest";
import { athleteTimeline, hasLeaderboard } from "@/lib/training/access";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("athleteTimeline", () => {
  it("anchors continuous programs on the program start", () => {
    const t = athleteTimeline({ kind: "continuous", startDate: d("2026-10-05"), weeks: null, publishedAt: null }, { startDate: null }, new Set([0]));
    expect(t).toEqual({ kind: "continuous", startDate: "2026-10-05", publishedWeeks: new Set([0]) });
  });

  it("anchors closed programs on the athlete's enrollment", () => {
    const t = athleteTimeline({ kind: "closed", startDate: null, weeks: 6, publishedAt: new Date() }, { startDate: d("2026-10-08") }, new Set());
    expect(t).toEqual({ kind: "closed", startDate: "2026-10-08", weeks: 6, published: true });
  });

  it("refuses inconsistent rows", () => {
    expect(() => athleteTimeline({ kind: "closed", startDate: null, weeks: 6, publishedAt: null }, { startDate: null }, new Set())).toThrow();
  });
});

describe("hasLeaderboard", () => {
  it("exists only for scored custom blocks of continuous programs", () => {
    expect(hasLeaderboard({ kind: "custom", scoring: "for_time" }, { kind: "continuous" })).toBe(true);
    expect(hasLeaderboard({ kind: "custom", scoring: "none" }, { kind: "continuous" })).toBe(false);
    expect(hasLeaderboard({ kind: "barbell", scoring: null }, { kind: "continuous" })).toBe(false);
    expect(hasLeaderboard({ kind: "custom", scoring: "amrap" }, { kind: "closed" })).toBe(false);
  });
});
