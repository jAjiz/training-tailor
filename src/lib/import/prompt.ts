import { MAX_IMPORT_WEEKS } from "./schema";

// Kept short on purpose: the PDF is the bulk of the input, and every rule here is one the samples needed.
export const IMPORT_SYSTEM_PROMPT = `Convert a coach's training programme PDF into weekly blocks.

- Read every week in order, at most ${MAX_IMPORT_WEEKS}; "weeksFound" is the total in the document.
- "day": 1 = Monday … 7 = Sunday when weekdays are named ("daysNamed": true); otherwise the training day's position in its week.
- If weekdays are columns, columns continue onto later pages without headers: a block's day is its column's horizontal position. A block cut at a page bottom continues at the top of the same column on the next page.
- One block per section the document separates. Include every block; skip none.
- "description": the block's full text in the document's language. Fix only line breaks and obvious typos; never change movements, reps, loads, percentages, times, levels or notes.
- "coachingTips": text marked as coaching tips, objectives or coach notes for the block.
- "scoring" only when obvious (for_time, amrap, ...); "timeCapSeconds" only for for_time.
- Omit fields that do not apply.`;

export const IMPORT_USER_PROMPT = "Convert the attached PDF.";
