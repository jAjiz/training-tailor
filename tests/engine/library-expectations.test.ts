import { describe, expect, it } from "vitest";
import { emptyLibrary, type DomainLibrary, type LibraryExpectation } from "@/lib/domain/library";
import { checkCandidateExpectations } from "@/lib/engine/library-expectations";
import { testContraindication, testMovement } from "../helpers/library-builders";

const SHOULDER_PRESS_BLOCKED = testContraindication("test_shoulder", {
  rules: [{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }],
});

function library(expectation: LibraryExpectation): DomainLibrary {
  return {
    ...emptyLibrary(),
    movements: [
      testMovement("Test Squat"),
      testMovement("Test Press", {
        patterns: ["vertical_push"],
        stresses: [{ site: "shoulder", mechanisms: ["overhead"], load: "high" }],
      }),
      testMovement("Test Combo", { patterns: ["squat", "vertical_push"], substitutes: ["Test Press", "Test Squat"] }),
    ],
    contraindications: [SHOULDER_PRESS_BLOCKED],
    expectations: [expectation],
  };
}

const candidates = (over: Partial<Extract<LibraryExpectation, { kind: "candidates" }>>): LibraryExpectation => ({
  kind: "candidates",
  movement: "Test Combo",
  conditions: [{ key: "test_shoulder", severity: "moderate", side: null }],
  equipment: null,
  ...over,
});

describe("checkCandidateExpectations", () => {
  it("passes when the first candidate matches", () => {
    expect(checkCandidateExpectations(library(candidates({ first: "Test Squat" })))).toEqual([]);
  });

  it("fails when the first candidate differs", () => {
    const findings = checkCandidateExpectations(library(candidates({ first: "Test Press" })));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: "error", code: "expectation_failed", ref: "candidates:Test Combo" });
  });

  it("passes when an excluded name is absent", () => {
    expect(checkCandidateExpectations(library(candidates({ excludes: ["Test Press"] })))).toEqual([]);
  });

  it("fails when an excluded name is present or an included one is missing", () => {
    const findings = checkCandidateExpectations(
      library(candidates({ conditions: [], excludes: ["Test Press"], includes: ["Test Combo"] })),
    );
    expect(findings.map((f) => f.code)).toEqual(["expectation_failed", "expectation_failed"]);
  });

  it("reports an unknown movement or contraindication", () => {
    expect(checkCandidateExpectations(library(candidates({ movement: "Test Nope", first: "x" }))))
      .toContainEqual(expect.objectContaining({ code: "expectation_unknown_movement" }));
    expect(checkCandidateExpectations(library(candidates({ conditions: [{ key: "nope", severity: "moderate", side: null }], first: "x" }))))
      .toContainEqual(expect.objectContaining({ code: "expectation_unknown_contraindication" }));
  });

  it("reports a first, includes or excludes name that is not a movement", () => {
    for (const over of [{ first: "Test Typo" }, { includes: ["Test Typo"] }, { excludes: ["Test Typo"] }]) {
      expect(checkCandidateExpectations(library(candidates(over))))
        .toContainEqual(expect.objectContaining({
          level: "error", code: "expectation_unknown_movement", ref: "candidates:Test Combo",
          message: expect.stringContaining("Test Typo"),
        }));
    }
  });

  it("honors the equipment restriction", () => {
    const lib = library(candidates({ equipment: [], first: "Test Squat" }));
    lib.movements[0] = testMovement("Test Squat", { equipment: ["barbell"] });
    expect(checkCandidateExpectations(lib)).toContainEqual(expect.objectContaining({ code: "expectation_failed" }));
  });
});
