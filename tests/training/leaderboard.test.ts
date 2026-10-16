import { describe, it, expect } from "vitest";
import { rank } from "@/lib/training/leaderboard";

const at = (n: number) => new Date(2026, 9, 7, 10, n);
const e = (id: string, division: string, sortKey: number, capped = false, minute = 0) => ({ id, division, sortKey, capped, createdAt: at(minute) });

describe("rank", () => {
  it("puts rx first, finished before capped, then higher keys", () => {
    const ranked = rank([
      e("scaled-fast", "scaled", -400),
      e("rx-capped", "rx", 80, true),
      e("rx-slow", "rx", -700),
      e("rx-fast", "rx", -500),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["rx-fast", "rx-slow", "rx-capped", "scaled-fast"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("shares ranks between equal scores and lists ties by entry time", () => {
    const ranked = rank([e("b", "rx", -500, false, 2), e("a", "rx", -500, false, 1), e("c", "rx", -600)]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
  });

  it("handles an empty board", () => {
    expect(rank([])).toEqual([]);
  });
});
