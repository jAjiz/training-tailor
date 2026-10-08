import { describe, it, expect } from "vitest";
import { applyMove, dayDropId, isDayDropId, locate, resolveDrop, type Board } from "@/lib/training/board";

const board: Board = { 0: ["a", "b", "c"], 1: ["x"], 2: [] };

describe("planner board", () => {
  it("locates blocks", () => {
    expect(locate(board, "c")).toEqual({ day: 0, index: 2 });
    expect(locate(board, "zzz")).toBeNull();
  });

  it("reorders within a day like arrayMove", () => {
    const down = resolveDrop(board, "a", "c")!;
    expect(down).toEqual({ day: 0, index: 2 });
    expect(applyMove(board, "a", down)[0]).toEqual(["b", "c", "a"]);
    const up = resolveDrop(board, "c", "a")!;
    expect(applyMove(board, "c", up)[0]).toEqual(["c", "a", "b"]);
  });

  it("moves to another day before the block it is dropped on", () => {
    const to = resolveDrop(board, "b", "x")!;
    expect(to).toEqual({ day: 1, index: 0 });
    const next = applyMove(board, "b", to);
    expect(next[0]).toEqual(["a", "c"]);
    expect(next[1]).toEqual(["b", "x"]);
  });

  it("appends when dropped on a day column, including an empty one", () => {
    expect(applyMove(board, "b", resolveDrop(board, "b", dayDropId(2))!)[2]).toEqual(["b"]);
    expect(resolveDrop(board, "a", dayDropId(0))).toEqual({ day: 0, index: 2 });
  });

  it("tells day columns from blocks", () => {
    expect(isDayDropId(dayDropId(3))).toBe(true);
    expect(isDayDropId("cmuzg6wng0004")).toBe(false);
  });

  it("ignores unknown items and never mutates the input", () => {
    expect(resolveDrop(board, "zzz", "a")).toBeNull();
    applyMove(board, "a", { day: 1, index: 0 });
    expect(board[0]).toEqual(["a", "b", "c"]);
  });
});
