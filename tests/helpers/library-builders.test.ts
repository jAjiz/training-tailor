import { describe, it, expect } from "vitest";
import { MovementSchema } from "@/lib/domain/types";
import { Quality } from "@/lib/engine/types";
import { testMovement, testDomain } from "./library-builders";

describe("library builders", () => {
  it("builds a movement that parses with the schema", () => {
    expect(() => MovementSchema.parse(testMovement("Test Squat"))).not.toThrow();
  });

  it("builds a taxonomy with one entry per quality", () => {
    expect(testDomain().taxonomy.qualities.map((q) => q.key)).toEqual([...Quality.options]);
  });

  it("rejects an invalid movement", () => {
    expect(() => testMovement("Test Squat", { patterns: [] })).toThrow();
  });
});
