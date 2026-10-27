import { describe, expect, it } from "vitest";
import {
  DomainLibrarySchema, LibraryExpectationSchema, LibraryExportSchema, emptyLibrary, toDomainData,
} from "@/lib/domain/library";
import { testContraindication, testMovement } from "../helpers/library-builders";

describe("library documents", () => {
  it("parses a minimal library and maps it to DomainData", () => {
    const lib = DomainLibrarySchema.parse({
      ...emptyLibrary(),
      movements: [testMovement("Test Squat")],
      contraindications: [testContraindication("test-injury")],
    });
    expect(Object.keys(toDomainData(lib)).sort()).toEqual(
      ["contraindications", "conversions", "movements", "taxonomy"],
    );
  });

  it("defaults a verdict expectation to moderate, no side", () => {
    const e = LibraryExpectationSchema.parse({
      kind: "verdict", contraindication: "x", movements: ["A"], is: "avoid",
    });
    expect(e).toMatchObject({ severity: "moderate", side: null });
  });

  it("refuses a substitutes expectation with neither startsWith nor includes", () => {
    expect(LibraryExpectationSchema.safeParse({ kind: "substitutes", movement: "A" }).success).toBe(false);
    expect(LibraryExpectationSchema.safeParse({ kind: "substitutes", movement: "A", includes: ["B"] }).success).toBe(true);
  });

  it("defaults a candidates expectation to a full box and moderate conditions", () => {
    const e = LibraryExpectationSchema.parse({
      kind: "candidates", movement: "A", conditions: [{ key: "x" }], first: "B",
    });
    expect(e).toMatchObject({ equipment: null, conditions: [{ key: "x", severity: "moderate", side: null }] });
    expect(LibraryExpectationSchema.safeParse({
      kind: "candidates", movement: "A", conditions: [{ key: "x" }],
    }).success).toBe(false);
  });

  it("round-trips the export format", () => {
    const base = { number: null, exportedAt: new Date().toISOString(), library: emptyLibrary() };
    expect(LibraryExportSchema.safeParse({ format: 1, ...base }).success).toBe(true);
    expect(LibraryExportSchema.safeParse({ format: 2, ...base }).success).toBe(false);
  });
});
