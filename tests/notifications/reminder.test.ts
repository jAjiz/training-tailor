import { describe, it, expect } from "vitest";
import { comingMonday, reminderWeekIndex } from "@/lib/notifications/reminder";

describe("comingMonday", () => {
  it("is the next Monday for the Sunday job, across the DST change", () => {
    expect(comingMonday(new Date("2026-10-25T17:00:00Z"))).toBe("2026-10-26");
  });
  it("is strictly after a Monday just past midnight in Madrid", () => {
    // 2026-10-25T23:30Z is Monday 2026-10-26 00:30 in Madrid (CET).
    expect(comingMonday(new Date("2026-10-25T23:30:00Z"))).toBe("2026-11-02");
  });
  it("gives the coming Monday on a Saturday", () => {
    expect(comingMonday(new Date("2026-10-24T10:00:00Z"))).toBe("2026-10-26");
  });
});

describe("reminderWeekIndex", () => {
  it("counts whole weeks from the program start", () => {
    expect(reminderWeekIndex("2026-10-05", "2026-10-26")).toBe(3);
    expect(reminderWeekIndex("2026-11-02", "2026-10-26")).toBe(-1);
  });
});
