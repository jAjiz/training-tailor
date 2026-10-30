import { describe, it, expect } from "vitest";
import type { ImportPreview, PreviewItem } from "@/lib/import/translate";
import { allKeys, isWeekImportable, selectedImport, targetWeek, toggleBlock, toggleWeek } from "@/lib/import/selection";
import type { ImportRole } from "@/lib/import/schema";
import type { BlockInputValue } from "@/lib/training/schemas";

function item(title: string, role: ImportRole = "block"): PreviewItem {
  const block: BlockInputValue = {
    kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
    description: "Test work", scoring: "none", timeCapSeconds: null,
  };
  return { role, block };
}

const noRoles = new Map<string, ImportRole>();
const items = (sel: Set<string>, ctx: { weekIndex: number; maxWeek: number | null }) => selectedImport(sel, noRoles, preview, ctx).items;

// Week 1: Wednesday before Monday (first-seen order); week 2: Monday only; week 3: nothing survived.
const preview: ImportPreview = {
  weeksFound: 3,
  daysNamed: true,
  dropped: 0,
  weeks: [
    { label: "Test W1", days: [{ day: 2, items: [item("Test A"), item("Test B")] }, { day: 0, items: [item("Test C")] }] },
    { label: "Test W2", days: [{ day: 0, items: [item("Test D")] }] },
    { label: "Test W3", days: [] },
  ],
};

describe("import selection", () => {
  it("selects every block at first, keyed by week, weekday and position", () => {
    expect([...allKeys(preview)].sort()).toEqual(["0:0:0", "0:2:0", "0:2:1", "1:0:0"]);
  });

  it("targets the open week plus the PDF week's position", () => {
    expect(targetWeek({ weekIndex: 3 }, 0)).toBe(3);
    expect(targetWeek({ weekIndex: 3 }, 2)).toBe(5);
  });

  it("toggles one block", () => {
    const off = toggleBlock(allKeys(preview), "0:2:1");
    expect(off.has("0:2:1")).toBe(false);
    expect(toggleBlock(off, "0:2:1").has("0:2:1")).toBe(true);
  });

  it("toggles a week on when any block is off, else off", () => {
    const all = allKeys(preview);
    const weekOff = toggleWeek(all, preview, 0);
    expect([...weekOff]).toEqual(["1:0:0"]);
    const partly = toggleBlock(all, "0:0:0");
    expect(toggleWeek(partly, preview, 0)).toEqual(all);
    expect(toggleWeek(weekOff, preview, 0)).toEqual(all);
  });

  it("refuses weeks past a closed program's last week", () => {
    expect(isWeekImportable({ weekIndex: 2, maxWeek: 3 }, 1)).toBe(true);
    expect(isWeekImportable({ weekIndex: 2, maxWeek: 3 }, 2)).toBe(false);
    expect(isWeekImportable({ weekIndex: 40, maxWeek: null }, 3)).toBe(true);
  });

  it("maps selected blocks to day indexes in document order", () => {
    expect(items(allKeys(preview), { weekIndex: 3, maxWeek: null }).map((i) => [i.dayIndex, i.block.title])).toEqual([
      [23, "Test A"], [23, "Test B"], [21, "Test C"], [28, "Test D"],
    ]);
  });

  it("maps PDF week 2 Monday opened on week 5 (weekIndex 4) to day 35", () => {
    expect(items(allKeys(preview), { weekIndex: 4, maxWeek: null }).find((i) => i.block.title === "Test D")?.dayIndex).toBe(35);
  });

  it("skips deselected blocks and weeks that cannot be imported", () => {
    const sel = toggleBlock(allKeys(preview), "0:2:0");
    expect(items(sel, { weekIndex: 3, maxWeek: 3 }).map((i) => i.block.title)).toEqual(["Test B", "Test C"]);
  });
});

describe("import selection of notes", () => {
  const notes: ImportPreview = {
    weeksFound: 1,
    daysNamed: true,
    dropped: 0,
    weeks: [{
      label: "Test W1",
      days: [{ day: 2, items: [item("Test goal", "day_note"), item("Test A"), item("Test principles", "week_note")] }],
    }],
  };
  const ctx = { weekIndex: 3, maxWeek: null };

  it("sends day and week notes to their target day and week, not as blocks", () => {
    const { items, notes: out } = selectedImport(allKeys(notes), noRoles, notes, ctx);
    expect(items.map((i) => i.block.title)).toEqual(["Test A"]);
    expect(out).toEqual([
      { scope: "day", index: 23, text: "Test goal\nTest work" },
      { scope: "week", index: 3, text: "Test principles\nTest work" },
    ]);
  });

  it("imports a note as a block when its role is changed", () => {
    const roles = new Map<string, ImportRole>([["0:2:0", "block"], ["0:2:1", "week_note"]]);
    const { items, notes: out } = selectedImport(allKeys(notes), roles, notes, ctx);
    expect(items.map((i) => [i.dayIndex, i.block.title])).toEqual([[23, "Test goal"]]);
    expect(out.map((n) => [n.scope, n.index, n.text])).toEqual([
      ["week", 3, "Test A\nTest work"], ["week", 3, "Test principles\nTest work"],
    ]);
  });

  it("leaves deselected notes out", () => {
    const sel = toggleBlock(toggleBlock(allKeys(notes), "0:2:0"), "0:2:2");
    expect(selectedImport(sel, noRoles, notes, ctx).notes).toEqual([]);
  });
});
