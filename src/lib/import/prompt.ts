import { BLOCK_COLORS } from "@/lib/training/schemas";
import { MAX_IMPORT_WEEKS } from "./schema";

export function importSystemPrompt(liftNames: string[]): string {
  const lifts = liftNames.length > 0 ? liftNames.map((n) => `- ${n}`).join("\n") : "(none)";
  return `You translate a coach's training programme from a PDF into structured weekly blocks.

Weeks and days
- Read every week in the PDF, in order. If there are more than ${MAX_IMPORT_WEEKS} weeks, return only the first ${MAX_IMPORT_WEEKS} but set "weeksFound" to the total number of weeks in the document.
- "day" is 1 for Monday through 7 for Sunday when the document names weekdays. Otherwise "day" is the position of the training day within its week (1 for the first training day, 2 for the second, ...). Set "daysNamed" to true only when weekdays are named.

Blocks
- Write one block per section the document separates (warm-up, strength, conditioning, accessory, week objectives, ...).
- Keep the document's language. Tidy line breaks, lists and obvious typos, but never change movements, reps, loads, percentages, times, levels (Rx+/Rx/Int/Esc) or notes.
- Put coaching tips, objectives and coach notes in "coachingTips".
- Use kind "barbell" only for a single lift from the list below whose sets are reps plus either a percentage or kilograms. Use the lift's name exactly as listed. Every other block is kind "custom".
- Set "scoring" only when it is obvious from the text, otherwise "none". Set "timeCapSeconds" only when scoring is "for_time".
- Map the document's colours to the nearest of: ${BLOCK_COLORS.join(", ")}. Use "neutral" when there is no clear match.
- "sourceText" is the block's full text exactly as written in the document.
- Use null for any field that does not apply to the block.

Lifts
${lifts}`;
}

export const IMPORT_USER_PROMPT = "Translate the attached PDF into weekly training blocks.";
