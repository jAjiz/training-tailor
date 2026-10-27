import { describe, expect, it } from "vitest";
import { EvalCaseSchema } from "@/lib/eval/grade";
import type { DomainLibrary, LibraryExpectation } from "@/lib/domain/library";
import { hasErrors, validateLibrary, type LibraryFinding } from "@/lib/domain/validate-library";
import { testContraindication, testDomain, testMovement } from "../helpers/library-builders";

const shoulder = [{ site: "shoulder" as const, mechanisms: ["overhead" as const], load: "high" as const }];

function base(): DomainLibrary {
  return {
    ...testDomain({
      movements: [
        testMovement("Test Squat", { substitutes: ["Test Lunge"] }),
        testMovement("Test Lunge", { patterns: ["lunge"], substitutes: ["Test Squat"] }),
        testMovement("Test Row", { patterns: ["horizontal_pull"], substitutes: ["Test Squat"] }),
        testMovement("Test Hinge", { patterns: ["hinge"], substitutes: ["Test Squat"] }),
        testMovement("Test Carry", { patterns: ["carry"], substitutes: ["Test Squat"] }),
        testMovement("Test Press", { patterns: ["vertical_push"], stresses: shoulder, substitutes: ["Test Squat"] }),
        testMovement("Test Combo", {
          patterns: ["squat", "vertical_push"], stresses: shoulder, substitutes: ["Test Press", "Test Squat"],
        }),
      ],
      contraindications: [
        testContraindication("test_shoulder", { rules: [{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }] }),
      ],
    }),
    expectations: [],
    evalCases: [],
  };
}

const codes = (lib: DomainLibrary) => validateLibrary(lib).map((f) => f.code);
const has = (lib: DomainLibrary, code: string, level: "error" | "warning" = "error") =>
  expect(validateLibrary(lib)).toContainEqual(expect.objectContaining({ code, level }));
const withExpectation = (e: LibraryExpectation): DomainLibrary => ({ ...base(), expectations: [e] });

describe("validateLibrary", () => {
  it("accepts a valid library", () => {
    expect(validateLibrary(base())).toEqual([]);
  });

  it("flags two movements with the same name", () => {
    const lib = base();
    lib.movements.push(testMovement("test  press", { substitutes: ["Test Squat"] }));
    has(lib, "duplicate_name");
  });

  it("an alias that collides with another name is a duplicate, case-insensitively", () => {
    const lib = base();
    lib.movements[1] = testMovement("Test Lunge", { patterns: ["lunge"], substitutes: ["Test Squat"], aliases: ["test squat"] });
    has(lib, "duplicate_name");
  });

  it("an alias that normalizes to its own movement's name is not a duplicate", () => {
    const lib = base();
    lib.movements[0] = testMovement("Test Squat", { substitutes: ["Test Lunge"], aliases: ["test-squat"] });
    expect(validateLibrary(lib)).toEqual([]);
  });

  it("flags an alias shared by two movements", () => {
    const lib = base();
    lib.movements[1] = testMovement("Test Lunge", { patterns: ["lunge"], substitutes: ["Test Squat"], aliases: ["Tl"] });
    lib.movements[2] = testMovement("Test Row", { patterns: ["horizontal_pull"], substitutes: ["Test Squat"], aliases: ["TL"] });
    has(lib, "duplicate_name");
  });

  it("flags an unknown substitute", () => {
    const lib = base();
    lib.movements[0] = testMovement("Test Squat", { substitutes: ["Test Nothing"] });
    has(lib, "unknown_substitute");
  });

  it("flags an unknown avoided movement", () => {
    const lib = base();
    lib.contraindications[0] = { ...lib.contraindications[0], avoidMovements: ["Test Nothing"] };
    has(lib, "unknown_avoid_movement");
  });

  it("flags an unknown conversion movement", () => {
    const lib = base();
    lib.conversions = {
      effort: [{
        key: "test_swap", note: "n",
        equivalents: [
          { movement: "Test Squat", unit: "reps", male: 10, female: 10 },
          { movement: "Test Nothing", unit: "reps", male: 10, female: 10 },
        ],
      }],
      implementLoad: [],
    };
    has(lib, "unknown_conversion_movement");
  });

  it("flags a conversion movement that is not an exact name", () => {
    const lib = base();
    lib.conversions = {
      effort: [{
        key: "test_swap", note: "n",
        equivalents: [
          { movement: "Test Squat", unit: "reps", male: 10, female: 10 },
          { movement: "Test Squats", unit: "reps", male: 10, female: 10 },
        ],
      }],
      implementLoad: [],
    };
    has(lib, "unknown_conversion_movement");
  });

  it("flags a duplicate contraindication key", () => {
    const lib = base();
    lib.contraindications.push(lib.contraindications[0]);
    has(lib, "duplicate_contraindication");
  });

  it("flags a taxonomy missing a key, with an extra key, or empty", () => {
    const missing = base();
    missing.taxonomy.qualities = missing.taxonomy.qualities.slice(1);
    has(missing, "taxonomy_mismatch");
    const extra = base();
    extra.taxonomy.energySystems.push({ key: "test_extra", label: "l", description: "d" });
    has(extra, "taxonomy_mismatch");
    const empty = base();
    empty.taxonomy.loadIntensities = [];
    has(empty, "taxonomy_mismatch");
  });

  it("flags a stressed site without an avoid rule", () => {
    const lib = base();
    lib.contraindications[0] = testContraindication("test_shoulder", {
      rules: [{ site: "shoulder", mechanisms: ["overhead"], tier: "caution" }],
    });
    has(lib, "unblocked_site");
  });

  it("flags flexion together with deep_flexion, and extension with deep_extension", () => {
    for (const pair of [["flexion", "deep_flexion"], ["extension", "deep_extension"]] as const) {
      const lib = base();
      lib.movements[0] = testMovement("Test Squat", {
        substitutes: ["Test Lunge"],
        stresses: [{ site: "shoulder", mechanisms: [...pair], load: "high" }],
      });
      has(lib, "graded_mechanism_overlap");
    }
  });

  describe("expectations", () => {
    it("flags an unknown movement or contraindication", () => {
      has(withExpectation({ kind: "stress", movement: "Test Nothing", site: "shoulder", present: true }), "expectation_unknown_movement");
      has(
        withExpectation({ kind: "verdict", contraindication: "nope", severity: "moderate", side: null, movements: ["Test Squat"], is: "ok" }),
        "expectation_unknown_contraindication",
      );
    });

    it("checks verdicts", () => {
      const verdict = (is: "ok" | "avoid", movement: string): LibraryExpectation =>
        ({ kind: "verdict", contraindication: "test_shoulder", severity: "moderate", side: null, movements: [movement], is });
      expect(codes(withExpectation(verdict("avoid", "Test Press")))).toEqual([]);
      has(withExpectation(verdict("ok", "Test Press")), "expectation_failed");
      has(withExpectation(verdict("avoid", "Test Squat")), "expectation_failed");
    });

    it("not_avoid accepts a caution verdict", () => {
      const lib = base();
      lib.contraindications[0] = testContraindication("test_shoulder", {
        rules: [
          { site: "shoulder", mechanisms: ["overhead"], tier: "caution" },
          { site: "knee", mechanisms: ["impact"], tier: "avoid" },
        ],
      });
      lib.expectations = [{
        kind: "verdict", contraindication: "test_shoulder", severity: "moderate", side: null,
        movements: ["Test Press"], is: "not_avoid",
      }];
      expect(codes(lib)).not.toContain("expectation_failed");
    });

    it("not_avoid rejects an avoid verdict", () => {
      has(
        withExpectation({
          kind: "verdict", contraindication: "test_shoulder", severity: "moderate", side: null,
          movements: ["Test Press"], is: "not_avoid",
        }),
        "expectation_failed",
      );
    });

    it("checks substitutes", () => {
      const subs = (over: object): LibraryExpectation =>
        ({ kind: "substitutes", movement: "Test Combo", ...over }) as LibraryExpectation;
      expect(codes(withExpectation(subs({ startsWith: ["Test Press"], includes: ["Test Squat"] })))).toEqual([]);
      has(withExpectation(subs({ startsWith: ["Test Squat"] })), "expectation_failed");
      has(withExpectation(subs({ includes: ["Test Row"] })), "expectation_failed");
    });

    it("flags substitute names that are not movements", () => {
      const subs = (over: object): LibraryExpectation =>
        ({ kind: "substitutes", movement: "Test Combo", ...over }) as LibraryExpectation;
      has(withExpectation(subs({ startsWith: ["Test Typo"] })), "expectation_unknown_movement");
      has(withExpectation(subs({ includes: ["Test Typo"] })), "expectation_unknown_movement");
    });

    it("checks stresses", () => {
      expect(codes(withExpectation({ kind: "stress", movement: "Test Press", site: "shoulder", mechanism: "overhead", present: true }))).toEqual([]);
      expect(codes(withExpectation({ kind: "stress", movement: "Test Squat", site: "shoulder", present: false }))).toEqual([]);
      has(withExpectation({ kind: "stress", movement: "Test Press", site: "shoulder", mechanism: "impact", present: true }), "expectation_failed");
      has(withExpectation({ kind: "stress", movement: "Test Press", site: "shoulder", present: false }), "expectation_failed");
    });

    it("checks fields", () => {
      const field = (over: object): LibraryExpectation =>
        ({ kind: "field", movement: "Test Combo", field: "patterns", ...over }) as LibraryExpectation;
      expect(codes(withExpectation(field({ equals: ["squat", "vertical_push"], includes: ["squat"] })))).toEqual([]);
      has(withExpectation(field({ equals: ["vertical_push", "squat"] })), "expectation_failed");
      has(withExpectation(field({ includes: ["hinge"] })), "expectation_failed");
    });

    it("checks that text resolves", () => {
      expect(codes(withExpectation({ kind: "resolves", text: "test  squat", movement: "Test Squat" }))).toEqual([]);
      has(withExpectation({ kind: "resolves", text: "test row", movement: "Test Squat" }), "expectation_failed");
      has(withExpectation({ kind: "resolves", text: "nothing like it", movement: "Test Squat" }), "expectation_failed");
    });

    it("flags candidate names that are not movements", () => {
      const base = { kind: "candidates", movement: "Test Combo", conditions: [], equipment: null } satisfies LibraryExpectation;
      has(withExpectation({ ...base, excludes: ["Test Typo"] }), "expectation_unknown_movement");
      has(withExpectation({ ...base, first: "Test Typo" }), "expectation_unknown_movement");
    });

    it("includes candidate expectations", () => {
      has(
        withExpectation({
          kind: "candidates", movement: "Test Combo", conditions: [{ key: "test_shoulder", severity: "moderate", side: null }],
          equipment: null, first: "Test Press",
        }),
        "expectation_failed",
      );
    });
  });

  it("flags two eval cases with the same id", () => {
    const lib = base();
    const c = EvalCaseSchema.parse({ id: "test-1", description: "d", rawText: "r" });
    lib.evalCases = [c, c];
    has(lib, "duplicate_eval_case");
  });

  it("warns about a movement without substitutes", () => {
    const lib = base();
    lib.movements[0] = testMovement("Test Squat");
    has(lib, "no_substitutes", "warning");
  });

  it("warns when few movements stay available", () => {
    const lib = base();
    lib.movements = lib.movements.slice(0, 4);
    lib.movements.forEach((m) => { m.substitutes = ["Test Squat"]; });
    has(lib, "few_available", "warning");
  });

  it("warns about a hanging movement without a grip stress", () => {
    const lib = base();
    lib.movements[0] = testMovement("Test Squat", { substitutes: ["Test Lunge"], positions: ["hanging"] });
    has(lib, "hanging_without_grip", "warning");
  });
});

describe("hasErrors", () => {
  const finding = (level: LibraryFinding["level"]): LibraryFinding =>
    ({ level, code: "x", entity: "movement", ref: null, message: "m" });

  it("warnings alone do not count as errors", () => {
    expect(hasErrors([finding("warning")])).toBe(false);
    expect(hasErrors([finding("warning"), finding("error")])).toBe(true);
    expect(hasErrors([])).toBe(false);
  });
});
