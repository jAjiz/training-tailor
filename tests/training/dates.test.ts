import { describe, it, expect } from "vitest";
import {
  addDays, canLogDay, dateOfDay, dayIndexOf, daysBetween, fromDbDate, inRange, isDayVisible, isIsoDate,
  isMonday, isValidTimeZone, mondayOf, monthGrid, toDbDate, todayIn, weekIndexOf, type Timeline,
} from "@/lib/training/dates";

describe("calendar arithmetic", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-10-08")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-10-8")).toBe(false);
  });

  it("adds days across month ends and the October DST change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // Europe switches on 2026-10-25
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-05", "2026-11-02")).toBe(28);
  });

  it("round-trips database dates", () => {
    expect(fromDbDate(toDbDate("2026-10-26"))).toBe("2026-10-26");
  });

  it("knows Mondays and week indexes", () => {
    expect(isMonday("2026-10-05")).toBe(true);
    expect(isMonday("2026-10-07")).toBe(false);
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week that started Monday
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(weekIndexOf(0)).toBe(0);
    expect(weekIndexOf(6)).toBe(0);
    expect(weekIndexOf(7)).toBe(1);
  });

  it("computes today in the athlete's time zone", () => {
    const now = new Date("2026-10-07T23:30:00Z");
    expect(todayIn("Europe/Madrid", now)).toBe("2026-10-08");
    expect(todayIn("America/New_York", now)).toBe("2026-10-07");
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("builds Monday-first month grids", () => {
    const grid = monthGrid("2026-10");
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid[0][3]).toBe("2026-10-01");
    expect(grid.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
});

describe("timelines", () => {
  const continuous: Timeline = { kind: "continuous", startDate: "2026-10-05", publishedWeeks: new Set([0]) };
  const closed: Timeline = { kind: "closed", startDate: "2026-10-08", weeks: 2, published: true };

  it("maps day indexes to dates and back", () => {
    expect(dateOfDay(continuous, 2)).toBe("2026-10-07");
    expect(dayIndexOf(continuous, "2026-10-07")).toBe(2);
    expect(dayIndexOf(continuous, "2026-10-04")).toBeNull(); // before day 0
    expect(dateOfDay(closed, 0)).toBe("2026-10-08");
    expect(dayIndexOf(closed, "2026-10-22")).toBeNull(); // day 14 is past a 2-week program
    expect(inRange(closed, 13)).toBe(true);
    expect(inRange(closed, 14)).toBe(false);
  });

  it("shows only published weeks of a continuous program", () => {
    expect(isDayVisible(continuous, 6)).toBe(true);
    expect(isDayVisible(continuous, 7)).toBe(false);
  });

  it("shows a closed program only once published", () => {
    expect(isDayVisible(closed, 3)).toBe(true);
    expect(isDayVisible({ ...closed, published: false }, 3)).toBe(false);
  });

  it("allows logging visible days that have arrived", () => {
    expect(canLogDay(continuous, 2, "2026-10-07")).toBe(true);
    expect(canLogDay(continuous, 3, "2026-10-07")).toBe(false); // tomorrow
    expect(canLogDay(continuous, 0, "2026-10-20")).toBe(true); // the past stays loggable
    expect(canLogDay(continuous, 8, "2026-10-20")).toBe(false); // week 1 is not published
  });
});
