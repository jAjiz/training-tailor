import { describe, it, expect } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { ImportEmptyError, translatePdf } from "@/lib/import/translate";
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

  it("sends the PDF as an attachment, with low thinking", async () => {
    const { fake, result } = run(script([block()]));
    await result;
    expect(fake.calls[0].lowThinking).toBe(true);
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
