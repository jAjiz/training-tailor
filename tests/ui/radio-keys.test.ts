import { describe, it, expect } from "vitest";
import { arrowDelta, stepEnabled } from "@/components/ui/radio-keys";

describe("stepEnabled", () => {
  it("skips disabled entries and wraps around", () => {
    const disabled = [false, true, false, false];
    expect(stepEnabled(disabled, 0, 1)).toBe(2);
    expect(stepEnabled(disabled, 0, -1)).toBe(3);
    expect(stepEnabled(disabled, 3, 1)).toBe(0);
  });

  it("stays put when nothing else is enabled", () => {
    expect(stepEnabled([false, true], 0, 1)).toBe(0);
  });
});

describe("arrowDelta", () => {
  it("maps arrows to steps", () => {
    expect(arrowDelta("ArrowRight")).toBe(1);
    expect(arrowDelta("ArrowDown")).toBe(1);
    expect(arrowDelta("ArrowLeft")).toBe(-1);
    expect(arrowDelta("ArrowUp")).toBe(-1);
    expect(arrowDelta("Enter")).toBeNull();
  });
});
