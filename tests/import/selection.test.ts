import { describe, it, expect } from "vitest";
import type { ImportPreview } from "@/lib/import/translate";
import { allKeys, isWeekImportable, selectedItems, targetWeek, toggleBlock, toggleWeek } from "@/lib/import/selection";
import type { BlockInputValue } from "@/lib/training/schemas";

function block(title: string): BlockInputValue {
  return {
    kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
    description: "Test work", scoring: "none", timeCapSeconds: null,
  };
}

// Week 1: Wednesday before Monday (first-seen order); week 2: Monday only; week 3: nothing survived.
const preview: ImportPreview = {
  weeksFound: 3,
  daysNamed: true,
  dropped: 0,
  weeks: [
    { label: "Test W1", days: [{ day: 2, blocks: [block("Test A"), block("Test B")] }, { day: 0, blocks: [block("Test C")] }] },
    { label: "Test W2", days: [{ day: 0, blocks: [block("Test D")] }] },
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
    const items = selectedItems(allKeys(preview), preview, { weekIndex: 3, maxWeek: null });
    expect(items.map((i) => [i.dayIndex, i.block.title])).toEqual([
      [23, "Test A"], [23, "Test B"], [21, "Test C"], [28, "Test D"],
    ]);
  });

  it("maps PDF week 2 Monday opened on week 5 (weekIndex 4) to day 35", () => {
    const items = selectedItems(allKeys(preview), preview, { weekIndex: 4, maxWeek: null });
    expect(items.find((i) => i.block.title === "Test D")?.dayIndex).toBe(35);
  });

  it("skips deselected blocks and weeks that cannot be imported", () => {
    const sel = toggleBlock(allKeys(preview), "0:2:0");
    expect(selectedItems(sel, preview, { weekIndex: 3, maxWeek: 3 }).map((i) => i.block.title)).toEqual(["Test B", "Test C"]);
  });
});
