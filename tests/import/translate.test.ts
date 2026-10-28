import { describe, it, expect } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { ImportEmptyError, translatePdf } from "@/lib/import/translate";
import type { ModelBlock } from "@/lib/import/schema";

const LIFTS = ["Test Back Squat"];
const PDF = new Uint8Array([37, 80, 68, 70]);

function custom(over: Partial<ModelBlock> = {}): ModelBlock {
  return {
    kind: "custom", title: "Test Block", color: "neutral", coachingTips: null, description: "Test work",
    scoring: "none", timeCapSeconds: null, movement: null, sets: null, instructions: null,
    sourceText: "Test work", ...over,
  };
}
function barbell(over: Partial<ModelBlock> = {}): ModelBlock {
  return custom({
    kind: "barbell", description: null, movement: "Test Back Squat",
    sets: [{ reps: 8, percent: 68, kg: null }], ...over,
  });
}
function script(blocks: ModelBlock[], over: Record<string, unknown> = {}) {
  return { weeksFound: 1, daysNamed: true, weeks: [{ label: "Week 1", days: [{ day: 1, blocks }] }], ...over };
}
function run(response: unknown) {
  const fake = new FakeProvider({ WeekImport: response });
  return { fake, result: translatePdf(fake, PDF, LIFTS) };
}

describe("translatePdf", () => {
  it("maps model days 1–7 to 0–6 and keeps document order", async () => {
    const { result } = run({
      weeksFound: 1, daysNamed: true,
      weeks: [{ label: "Week 1", days: [
        { day: 5, blocks: [custom({ title: "Test B" })] },
        { day: 1, blocks: [custom({ title: "Test A" })] },
        { day: 7, blocks: [custom({ title: "Test C" })] },
      ] }],
    });
    const preview = await result;
    expect(preview.weeks[0].days.map((d) => d.day)).toEqual([4, 0, 6]);
    expect(preview.weeks[0].days.map((d) => d.blocks[0].title)).toEqual(["Test B", "Test A", "Test C"]);
  });

  it("keeps the first 4 weeks and reports weeksFound", async () => {
    const weeks = Array.from({ length: 6 }, (_, i) => ({ label: `Week ${i + 1}`, days: [{ day: 1, blocks: [custom()] }] }));
    const preview = await run({ weeksFound: 6, daysNamed: true, weeks }).result;
    expect(preview.weeks).toHaveLength(4);
    expect(preview.weeksFound).toBe(6);
  });

  it("keeps a valid barbell block", async () => {
    const preview = await run(script([barbell()])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({
      kind: "barbell", movement: "Test Back Squat", sets: [{ reps: 8, percent: 68, kg: null }],
    });
  });

  it("turns a barbell block with an unknown movement into custom with its source text", async () => {
    const preview = await run(script([barbell({
      movement: "Test Clean Complex", title: "Test Complex", coachingTips: "Test tip", sourceText: "4 x 2 clean pull…",
    })])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({
      kind: "custom", title: "Test Complex", coachingTips: "Test tip",
      description: "4 x 2 clean pull…", scoring: "none", timeCapSeconds: null,
    });
  });

  it("turns a barbell block with invalid sets into custom", async () => {
    const preview = await run(script([barbell({
      sets: [{ reps: 5, percent: 70, kg: 100 }], sourceText: "5 @ 70% / 100 kg",
    })])).result;
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ kind: "custom", description: "5 @ 70% / 100 kg" });
  });

  it("drops blocks that cannot be made valid and counts them", async () => {
    const preview = await run(script([custom(), custom({ description: "", sourceText: "" })])).result;
    expect(preview.dropped).toBe(1);
    expect(preview.weeks[0].days[0].blocks).toHaveLength(1);
  });

  it("clears a time cap on a non for_time block", async () => {
    const preview = await run(script([custom({ scoring: "amrap", timeCapSeconds: 600 })])).result;
    expect(preview.dropped).toBe(0);
    expect(preview.weeks[0].days[0].blocks[0]).toMatchObject({ scoring: "amrap", timeCapSeconds: null });
  });

  it("passes daysNamed through", async () => {
    expect((await run(script([custom()], { daysNamed: false })).result).daysNamed).toBe(false);
    expect((await run(script([custom()], { daysNamed: true })).result).daysNamed).toBe(true);
  });

  it("throws ImportEmptyError when no block survives", async () => {
    const { result } = run(script([custom({ description: "", sourceText: "" })]));
    await expect(result).rejects.toBeInstanceOf(ImportEmptyError);
  });

  it("sends the PDF as an attachment and the lift names in the prompt", async () => {
    const { fake, result } = run(script([custom()]));
    await result;
    expect(fake.calls[0].attachments?.[0].mimeType).toBe("application/pdf");
    expect(fake.calls[0].attachments?.[0].data).toBe(PDF);
    expect(fake.calls[0].systemPrompt).toContain("Test Back Squat");
  });
});
