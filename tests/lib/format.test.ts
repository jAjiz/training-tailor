import { describe, it, expect } from "vitest";
import { formatDayRange, initials, relativeTime } from "@/lib/format";

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

describe("relativeTime", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("picks the largest whole unit", () => {
    expect(relativeTime(ago(10_000), now, "en")).toBe("now");
    expect(relativeTime(ago(5 * 60_000), now, "en")).toBe("5 minutes ago");
    expect(relativeTime(ago(3 * 3_600_000), now, "en")).toBe("3 hours ago");
    expect(relativeTime(ago(3 * 86_400_000), now, "es")).toBe("hace 3 días");
  });
  it("falls back to a date after a month and tolerates a future timestamp", () => {
    expect(relativeTime(ago(40 * 86_400_000), now, "en")).toBe("Sep 10");
    expect(relativeTime(new Date(now.getTime() + 5000), now, "en")).toBe("now");
  });
});
