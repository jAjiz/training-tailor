import { describe, it, expect } from "vitest";
import { applyMove, dayDropId, isDayDropId, locate, moveOver, type Board } from "@/lib/training/board";

const board: Board = { 0: ["a", "b", "c"], 1: ["x"], 2: [] };

describe("planner board", () => {
  it("locates blocks", () => {
    expect(locate(board, "c")).toEqual({ day: 0, index: 2 });
    expect(locate(board, "zzz")).toBeNull();
  });

  it("moves a block to a slot, clamped, without mutating the input", () => {
    expect(applyMove(board, "a", { day: 0, index: 2 })[0]).toEqual(["b", "c", "a"]);
    expect(applyMove(board, "a", { day: 1, index: 9 })[1]).toEqual(["x", "a"]);
    expect(board[0]).toEqual(["a", "b", "c"]);
  });

  it("tells day columns from blocks", () => {
    expect(isDayDropId(dayDropId(3))).toBe(true);
    expect(isDayDropId("cmuzg6wng0004")).toBe(false);
  });
});

describe("moveOver (while dragging)", () => {
  it("reorders within a day: before the block under the pointer, or after it when below", () => {
    expect(moveOver(board, "a", "c", false)?.[0]).toEqual(["b", "a", "c"]);
    expect(moveOver(board, "a", "c", true)?.[0]).toEqual(["b", "c", "a"]);
    expect(moveOver(board, "c", "a", false)?.[0]).toEqual(["c", "a", "b"]);
  });

  it("moves into another day the same way", () => {
    expect(moveOver(board, "b", "x", false)).toEqual({ 0: ["a", "c"], 1: ["b", "x"], 2: [] });
    expect(moveOver(board, "b", "x", true)).toEqual({ 0: ["a", "c"], 1: ["x", "b"], 2: [] });
  });

  it("goes to the end of a day when over its column, including an empty one", () => {
    expect(moveOver(board, "a", dayDropId(2), false)?.[2]).toEqual(["a"]);
    expect(moveOver(board, "a", dayDropId(0), false)?.[0]).toEqual(["b", "c", "a"]);
  });

  it("changes nothing when the block is already there", () => {
    expect(moveOver(board, "a", "a", true)).toBeNull();
    expect(moveOver(board, "a", "b", false)).toBeNull();
    expect(moveOver(board, "b", "a", true)).toBeNull();
    expect(moveOver(board, "c", dayDropId(0), false)).toBeNull();
  });

  it("ignores unknown ids", () => {
    expect(moveOver(board, "zzz", "x", false)).toBeNull();
    expect(moveOver(board, "a", "zzz", false)).toBeNull();
  });
});
