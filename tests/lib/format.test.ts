import { describe, it, expect } from "vitest";
import { formatDayRange, initials } from "@/lib/format";

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Juan Ajiz")).toBe("JA");
    expect(initials("  maría  de la  Sierra ")).toBe("MS");
  });

  it("uses one letter for one word and ? for a blank name", () => {
    expect(initials("madonna")).toBe("M");
    expect(initials("   ")).toBe("?");
  });
});

describe("formatDayRange", () => {
  it("formats a span of dates once, sharing month and year", () => {
    expect(formatDayRange("2026-10-12", "2026-10-18", "es")).toMatch(/^12\s*[–-]\s*18 oct 2026$/);
    expect(formatDayRange("2026-10-26", "2026-11-01", "en")).toMatch(/^Oct 26\s*[–-]\s*Nov 1, 2026$/);
  });
});
