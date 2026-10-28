import { BLOCK_COLORS } from "@/lib/training/schemas";
import { MAX_IMPORT_WEEKS } from "./schema";

// A fixed colour per kind of block, so every imported week looks the same.
const COLOR_RULE = `"color", one of ${BLOCK_COLORS.join(", ")}, by the kind of block: warm-up or mobility blue, weightlifting orange, strength red, conditioning or WOD yellow, endurance or running green, accessories or gymnastics skills purple, day or week notes and anything else neutral.`;

// Kept short on purpose: the PDF is the bulk of the input, and every rule here is one the samples needed.
export const IMPORT_SYSTEM_PROMPT = `Convert a coach's training programme PDF into weekly blocks.

- Read every week in order, at most ${MAX_IMPORT_WEEKS}; "weeksFound" is the total in the document.
- "day": 1 = Monday … 7 = Sunday when weekdays are named ("daysNamed": true); otherwise the training day's position in its week.
- If weekdays are columns, columns continue onto later pages without headers: a block's day is its column's horizontal position. A block cut at a page bottom continues at the top of the same column on the next page.
- One block per section the document separates. Include every block; skip none.
- "description": the block's full text in the document's language. Fix only line breaks and obvious typos; never change movements, reps, loads, percentages, times, levels or notes.
- "coachingTips": text marked as coaching tips, objectives or coach notes for the block.
- "scoring" only when obvious (for_time, amrap, ...); "timeCapSeconds" only for for_time.
- ${COLOR_RULE} Prefer the document's own colours when it has them.
- Omit fields that do not apply.`;

export const IMPORT_USER_PROMPT = "Convert the attached PDF.";

export const TIDY_SYSTEM_PROMPT = `Tidy the blocks of a coach's training week. Each block is "[id] heading" followed by its text, extracted from a PDF whose narrow columns wrapped long lines. Return every block by id.

- "description": the block's text with the wrapping undone: keep one line per item (exercise, set, level, note) and join a line to the previous one only when it continues the same sentence or item. Keep every blank line. Fix obvious typos; never change movements, reps, loads, percentages, times, levels or notes. Do not repeat the heading. A block with no text (a day or week summary) gets an empty description.
- "coachingTips": only the text after a "Coaching tips" label, wrapped the same way; drop the label. Everything else, including notes and objectives, stays in "description".
- "scoring" only when obvious; "timeCapSeconds" only for for_time.
- ${COLOR_RULE}
- Omit optional fields that do not apply.`;
