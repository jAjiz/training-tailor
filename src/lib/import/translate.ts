import type { LlmProvider } from "@/lib/ai/provider";
import { BlockInput, type BlockInputValue } from "@/lib/training/schemas";
import { IMPORT_SYSTEM_PROMPT, IMPORT_USER_PROMPT } from "./prompt";
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

/** Every block imports as custom. A bad scoring or time cap falls back to none rather than losing the block. */
function toBlock(b: ModelBlock): BlockInputValue | null {
  const scoring = b.scoring ?? "none";
  const block = {
    kind: "custom" as const,
    title: b.title ?? null,
    color: "neutral" as const,
    coachingTips: b.coachingTips ?? null,
    videoUrl: null,
    description: b.description,
    scoring,
    timeCapSeconds: scoring === "for_time" ? b.timeCapSeconds ?? null : null,
  };
  const parsed = BlockInput.safeParse(block);
  if (parsed.success) return parsed.data;
  const unscored = BlockInput.safeParse({ ...block, scoring: "none", timeCapSeconds: null });
  return unscored.success ? unscored.data : null;
}

export async function translatePdf(provider: LlmProvider, pdf: Uint8Array): Promise<ImportPreview> {
  const response = await provider.generateStructured({
    systemPrompt: IMPORT_SYSTEM_PROMPT,
    prompt: IMPORT_USER_PROMPT,
    schema: ImportModelResponse,
    schemaName: "WeekImport",
    attachments: [{ mimeType: "application/pdf", data: pdf }],
    lowThinking: true,
  });

  let dropped = 0;
  let kept = 0;
  const weeks: PreviewWeek[] = [];
  for (const week of response.weeks.slice(0, MAX_IMPORT_WEEKS)) {
    // Duplicate days merge in document order. Empty weeks stay: callers map PDF week n by position.
    const byDay = new Map<number, BlockInputValue[]>();
    for (const day of week.days) {
      for (const raw of day.blocks) {
        const block = toBlock(raw);
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
