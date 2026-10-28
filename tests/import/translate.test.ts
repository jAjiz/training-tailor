import { describe, it, expect } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { ImportEmptyError, translatePdf } from "@/lib/import/translate";
import type { TextItem } from "@/lib/import/layout";
import type { ModelBlock } from "@/lib/import/schema";

const PDF = new Uint8Array([37, 80, 68, 70]);

function block(over: Partial<ModelBlock> = {}): ModelBlock {
  return { title: "Test Block", description: "Test work", ...over };
}
function script(blocks: ModelBlock[], over: Record<string, unknown> = {}) {
  return { weeksFound: 1, daysNamed: true, weeks: [{ label: "Week 1", days: [{ day: 1, blocks }] }], ...over };
}
function run(response: unknown) {
  const fake = new FakeProvider({ WeekImport: response });
  return { fake, result: translatePdf(fake, PDF) };
}

describe("translatePdf", () => {
  it("maps model days 1–7 to 0–6 and keeps document order", async () => {
    const { result } = run({
      weeksFound: 1, daysNamed: true,
      weeks: [{ label: "Week 1", days: [
        { day: 5, blocks: [block({ title: "Test B" })] },
        { day: 1, blocks: [block({ title: "Test A" })] },
        { day: 7, blocks: [block({ title: "Test C" })] },
      ] }],
    });
    const preview = await result;
    expect(preview.weeks[0].days.map((d) => d.day)).toEqual([4, 0, 6]);
    expect(preview.weeks[0].days.map((d) => d.blocks[0].title)).toEqual(["Test B", "Test A", "Test C"]);
  });

  it("keeps the first 4 weeks and reports weeksFound", async () => {
    const weeks = Array.from({ length: 6 }, (_, i) => ({ label: `Week ${i + 1}`, days: [{ day: 1, blocks: [block()] }] }));
    const preview = await run({ weeksFound: 6, daysNamed: true, weeks }).result;
    expect(preview.weeks).toHaveLength(4);
    expect(preview.weeksFound).toBe(6);
  });

  it("imports every block as a neutral custom block, filling omitted fields", async () => {
    const preview = await run(script([{ description: "Test work" }])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toEqual({
      kind: "custom", title: null, color: "neutral", coachingTips: null, videoUrl: null,
      description: "Test work", scoring: "none", timeCapSeconds: null,
    });
  });

  it("keeps coaching tips and scoring", async () => {
    const preview = await run(script([block({ coachingTips: "Test tip", scoring: "amrap" })])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ coachingTips: "Test tip", scoring: "amrap" });
  });

  it("keeps a for_time block with a valid time cap", async () => {
    const preview = await run(script([block({ scoring: "for_time", timeCapSeconds: 1200 })])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ scoring: "for_time", timeCapSeconds: 1200 });
  });

  it("clears a time cap on a non for_time block", async () => {
    const preview = await run(script([block({ scoring: "amrap", timeCapSeconds: 600 })])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ scoring: "amrap", timeCapSeconds: null });
  });

  it("keeps a block with an invalid time cap, unscored", async () => {
    const preview = await run(script([block({ scoring: "for_time", timeCapSeconds: -5 })])).result;
    expect(preview.dropped).toBe(0);
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ description: "Test work", scoring: "none", timeCapSeconds: null });
  });

  it("drops blocks that cannot be made valid and counts them", async () => {
    const preview = await run(script([block(), block({ description: "" })])).result;
    expect(preview.dropped).toBe(1);
    expect(preview.weeks[0].days[0].blocks).toHaveLength(1);
  });

  it("passes daysNamed through", async () => {
    expect((await run(script([block()], { daysNamed: false })).result).daysNamed).toBe(false);
    expect((await run(script([block()], { daysNamed: true })).result).daysNamed).toBe(true);
  });

  it("throws ImportEmptyError when no block survives", async () => {
    const { result } = run(script([block({ description: "" })]));
    await expect(result).rejects.toBeInstanceOf(ImportEmptyError);
  });

  it("sends a PDF that is not a calendar to the model whole", async () => {
    const { fake, result } = run(script([block()]));
    await result;
    expect(fake.calls[0].schemaName).toBe("WeekImport");
    expect(fake.calls[0].attachments?.[0].mimeType).toBe("application/pdf");
    expect(fake.calls[0].attachments?.[0].data).toBe(PDF);
  });

  it("keeps a week whose blocks all failed, in position", async () => {
    const week = (label: string, b: ModelBlock) => ({ label, days: [{ day: 1, blocks: [b] }] });
    const preview = await run({
      weeksFound: 3, daysNamed: true,
      weeks: [week("Week 1", block()), week("Week 2", block({ description: "" })), week("Week 3", block())],
    }).result;
    expect(preview.weeks.map((w) => w.label)).toEqual(["Week 1", "Week 2", "Week 3"]);
    expect(preview.weeks[1].days).toEqual([]);
    expect(preview.dropped).toBe(1);
  });

  it("merges duplicate days in document order", async () => {
    const preview = await run({
      weeksFound: 1, daysNamed: true,
      weeks: [{ label: "Week 1", days: [
        { day: 2, blocks: [block({ title: "Test A" })] },
        { day: 3, blocks: [block({ title: "Test C" })] },
        { day: 2, blocks: [block({ title: "Test B" })] },
      ] }],
    }).result;
    expect(preview.weeks[0].days.map((d) => d.day)).toEqual([1, 2]);
    expect(preview.weeks[0].days[0].blocks.map((b) => b.title)).toEqual(["Test A", "Test B"]);
  });

  it("never reports fewer weeks found than it returns", async () => {
    const preview = await run(script([block()], { weeksFound: 0 })).result;
    expect(preview.weeksFound).toBe(1);
  });
});

describe("translatePdf with a calendar PDF", () => {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const at = (str: string, x: number, y: number, h = 7.5): TextItem => ({ str, x, y, h });
  // Two blocks on Monday, then a title-only box and one block on Wednesday; body text is the most common size.
  const pages: TextItem[][] = [[
    ...DAYS.map((d, i) => at(d, 10 + i * 100, 800, 9.5)),
    at("Test Warm-up", 10, 780, 8.5), at("Test row 2 min", 10, 770), at("Test bike 2 min", 10, 760),
    at("Test Strength", 10, 740, 8.5), at("Test 5 x 5", 10, 730),
    at("Test Day Summary", 210, 790, 8.5),
    at("Test Engine", 210, 760, 8.5), at("Test 20 min", 210, 750), at("Coaching tips", 210, 740), at("Test pace", 210, 730),
  ]];
  const readText = async () => pages;
  const tidy = (blocks: unknown[]) => new FakeProvider({ BlockTidy: { blocks } });

  it("keeps the code's days and titles and takes the tidied text and colour by id", async () => {
    const fake = tidy([
      { id: 1, description: "test warm-up\nTest row 2 min\nTest bike 2 min", color: "blue" },
      { id: 2, description: "Test 5 x 5", scoring: "load", color: "red" },
      { id: 3, description: "", color: "purple" },
      { id: 4, description: "Test 20 min", coachingTips: "Test pace", color: "yellow" },
    ]);
    const preview = await translatePdf(fake, PDF, readText);
    expect(fake.calls[0].schemaName).toBe("BlockTidy");
    expect(fake.calls[0].attachments).toBeUndefined();
    expect(fake.calls[0].prompt).toContain("[4] Test Engine");
    expect(preview).toMatchObject({ weeksFound: 1, daysNamed: true, dropped: 0 });
    expect(preview.weeks[0].days.map((d) => [d.day, d.blocks.map((b) => b.title)])).toEqual([
      [0, ["Test Warm-up", "Test Strength"]],
      [2, [null, "Test Engine"]],
    ]);
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ description: "Test row 2 min\nTest bike 2 min" });
    expect(preview.weeks[0].days[0].blocks[1]).toMatchObject({ kind: "custom", description: "Test 5 x 5", scoring: "load", color: "red" });
    expect(preview.weeks[0].days[1].blocks[0]).toMatchObject({ description: "Test Day Summary", color: "purple" });
    expect(preview.weeks[0].days[1].blocks[1]).toMatchObject({ coachingTips: "Test pace", color: "yellow" });
  });

  it("keeps the document text for a block the model skipped", async () => {
    const preview = await translatePdf(tidy([{ id: 1, description: "Test tidy", color: "blue" }]), PDF, readText);
    expect(preview.weeks[0].days[0].blocks.map((b) => [b.kind === "custom" && b.description, b.color]))
      .toEqual([["Test tidy", "blue"], ["Test 5 x 5", "neutral"]]);
  });
});
