import { describe, it, expect } from "vitest";
import { calendarBlocks, type TextItem } from "@/lib/import/layout";

const at = (str: string, x: number, y: number, h = 7.5): TextItem => ({ str, x, y, h });
const HEADERS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"].map((d, i) => at(d, 10 + i * 100, 800, 9.5));
const titles = (blocks: ReturnType<typeof calendarBlocks>) => blocks?.map((b) => `${b.day}:${b.title}`);

describe("calendarBlocks", () => {
  it("returns null without a row of weekday headers", () => {
    expect(calendarBlocks([[at("Test Week 1", 10, 800, 9.5), at("Test Day 1", 10, 780, 8.5), at("Test 5 x 5", 10, 770)]])).toBeNull();
    expect(calendarBlocks([])).toBeNull();
  });

  it("places blocks by column and skips columns left empty on later pages", () => {
    const blocks = calendarBlocks([
      [...HEADERS, at("Test A", 10, 780, 8.5), at("Test a", 10, 770), at("Test a2", 12, 760)],
      [at("Test F", 512, 780, 8.5), at("Test f", 512, 770), at("Test G", 610, 780, 8.5), at("Test g", 610, 770)],
    ]);
    expect(titles(blocks)).toEqual(["0:Test A", "5:Test F", "6:Test G"]);
    expect(blocks?.[0].text).toBe("Test a\nTest a2");
  });

  it("continues a block across a page break in its own column", () => {
    const blocks = calendarBlocks([
      [...HEADERS, at("Test B", 110, 780, 8.5), at("Test part 1", 110, 770)],
      [at("Test part 2", 110, 790), at("Test C", 110, 770, 8.5), at("Test c", 110, 760)],
    ]);
    expect(titles(blocks)).toEqual(["1:Test B", "1:Test C"]);
    expect(blocks?.[0].text).toBe("Test part 1\nTest part 2");
  });

  it("joins a wrapped heading and drops a heading with no text", () => {
    const blocks = calendarBlocks([[
      ...HEADERS,
      at("Test day title", 10, 780, 8.5),
      at("Test Long", 10, 750, 8.5), at("Heading", 10, 740, 8.5),
      at("Test text 1", 10, 730), at("Test text 2", 10, 720), at("Test text 3", 10, 710), at("Test text 4", 10, 700),
    ]]);
    expect(titles(blocks)).toEqual(["0:Test Long Heading"]);
  });

  it("joins runs on one line", () => {
    const blocks = calendarBlocks([[...HEADERS, at("Test H", 10, 780, 8.5), at("4 x 5 rep", 10, 770), at("@65%", 60, 770.5)]]);
    expect(blocks?.[0].text).toBe("4 x 5 rep @65%");
  });
});
