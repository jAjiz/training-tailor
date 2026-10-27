import { describe, it, expect } from "vitest";
import { emptyLibrary, type LibraryExport } from "@/lib/domain/library";
import { EvalCaseSchema } from "@/lib/eval/grade";
import { contentViolations } from "../../scripts/lib/content-guard";
import { testContraindication, testMovement } from "../helpers/library-builders";

function sample(movements = 1): LibraryExport {
  return {
    format: 1, number: null, exportedAt: "2026-10-27T00:00:00.000Z",
    library: { ...emptyLibrary(), movements: Array.from({ length: movements }, (_, i) => testMovement(`Test Move ${i}`)) },
  };
}

const CLEAN = ["README.md", "src/lib/domain/library.ts", "data/sample/library.json", "tests/domain/library.test.ts"];

describe("contentViolations", () => {
  it("accepts a tree with only the sample library", () => {
    expect(contentViolations(CLEAN, sample())).toEqual([]);
  });

  it("refuses any data file other than the sample", () => {
    expect(contentViolations([...CLEAN, "data/movements.json"], sample())).toHaveLength(1);
  });

  it("refuses a sample over its size caps", () => {
    expect(contentViolations(CLEAN, sample(16))).toHaveLength(1);
    const big = sample();
    big.library.contraindications = Array.from({ length: 4 }, (_, i) => testContraindication(`test_${i}`));
    big.library.evalCases = Array.from({ length: 3 }, (_, i) =>
      EvalCaseSchema.parse({ id: `test-${i}`, description: "Test case", rawText: "Test Move 0" }));
    expect(contentViolations(CLEAN, big)).toHaveLength(2);
  });
});
