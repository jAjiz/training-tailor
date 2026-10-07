import { describe, it, expect } from "vitest";
import { toJson } from "@/lib/json";

describe("toJson", () => {
  it("returns a plain JSON copy, dropping undefined", () => {
    const value = { a: 1, b: null, c: undefined, d: [{ e: "x" }] };
    expect(toJson(value)).toEqual({ a: 1, b: null, d: [{ e: "x" }] });
    expect(toJson(value)).not.toBe(value);
  });
});
