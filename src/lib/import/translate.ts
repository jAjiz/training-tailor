import type { LlmProvider } from "@/lib/ai/provider";
import { BlockInput, type BlockInputValue } from "@/lib/training/schemas";
import { IMPORT_USER_PROMPT, importSystemPrompt } from "./prompt";
import { ImportModelResponse, MAX_IMPORT_WEEKS, type ModelBlock } from "./schema";

export type PreviewWeek = {
  label: string;
  /** `day` is 0 = Monday … 6 = Sunday. */
  days: { day: number; blocks: BlockInputValue[] }[];
};
export type ImportPreview = { weeksFound: number; daysNamed: boolean; dropped: number; weeks: PreviewWeek[] };

export class ImportEmptyError extends Error {
  constructor() {
    super("No block could be read from the PDF");
    this.name = "ImportEmptyError";
  }
}

function asCustom(b: ModelBlock) {
  return {
    kind: "custom" as const,
    title: b.title,
    color: b.color,
    coachingTips: b.coachingTips,
    videoUrl: null,
    description: b.sourceText,
    scoring: "none" as const,
    timeCapSeconds: null,
  };
}

function toBlock(b: ModelBlock, liftNames: string[]): BlockInputValue | null {
  if (b.kind === "barbell") {
    if (b.movement !== null && liftNames.includes(b.movement)) {
      const barbell = BlockInput.safeParse({
        kind: "barbell",
        title: b.title,
        color: b.color,
        coachingTips: b.coachingTips,
        videoUrl: null,
        movement: b.movement,
        sets: b.sets ?? [],
        instructions: b.instructions,
      });
      if (barbell.success) return barbell.data;
    }
  } else {
    const scoring = b.scoring ?? "none";
    const custom = {
      kind: "custom" as const,
      title: b.title,
      color: b.color,
      coachingTips: b.coachingTips,
      videoUrl: null,
      description: b.description ?? "",
      scoring,
      timeCapSeconds: scoring === "for_time" ? b.timeCapSeconds : null,
    };
    const parsed = BlockInput.safeParse(custom);
    if (parsed.success) return parsed.data;
    const retried = BlockInput.safeParse({ ...custom, description: b.sourceText });
    if (retried.success) return retried.data;
  }
  const fallback = BlockInput.safeParse(asCustom(b));
  return fallback.success ? fallback.data : null;
}

export async function translatePdf(provider: LlmProvider, pdf: Uint8Array, liftNames: string[]): Promise<ImportPreview> {
  const response = await provider.generateStructured({
    systemPrompt: importSystemPrompt(liftNames),
    prompt: IMPORT_USER_PROMPT,
    schema: ImportModelResponse,
    schemaName: "WeekImport",
    attachments: [{ mimeType: "application/pdf", data: pdf }],
  });

  let dropped = 0;
  let kept = 0;
  const weeks: PreviewWeek[] = [];
  for (const week of response.weeks.slice(0, MAX_IMPORT_WEEKS)) {
    // Duplicate days merge in document order. Empty weeks stay: callers map PDF week n by position.
    const byDay = new Map<number, BlockInputValue[]>();
    for (const day of week.days) {
      for (const raw of day.blocks) {
        const block = toBlock(raw, liftNames);
        if (!block) {
          dropped++;
          continue;
        }
        kept++;
        byDay.set(day.day - 1, [...(byDay.get(day.day - 1) ?? []), block]);
      }
    }
    weeks.push({ label: week.label, days: [...byDay].map(([day, blocks]) => ({ day, blocks })) });
  }
  if (kept === 0) throw new ImportEmptyError();
  return {
    weeksFound: Math.max(response.weeksFound, response.weeks.length),
    daysNamed: response.daysNamed,
    dropped,
    weeks,
  };
}
