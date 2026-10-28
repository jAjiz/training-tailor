import { z } from "zod";
import { BlockColor, Scoring } from "@/lib/training/schemas";

/** The most weeks one import keeps; the model is told to stop there too. */
export const MAX_IMPORT_WEEKS = 4;

/**
 * One block as the model writes it. Flat (no unions) because Gemini's JSON schema support is simpler
 * that way; string limits match `BlockInput`, everything else is judged by `BlockInput` afterwards.
 */
const ModelBlock = z.object({
  kind: z.enum(["custom", "barbell"]),
  title: z.string().max(120).nullable(),
  color: BlockColor,
  coachingTips: z.string().max(2000).nullable(),
  description: z.string().max(5000).nullable(),
  scoring: Scoring.nullable(),
  timeCapSeconds: z.number().int().nullable(),
  movement: z.string().max(80).nullable(),
  sets: z.array(z.object({
    reps: z.number().int(),
    percent: z.number().nullable(),
    kg: z.number().nullable(),
  })).nullable(),
  instructions: z.string().max(2000).nullable(),
  sourceText: z.string().max(5000),
});
export type ModelBlock = z.infer<typeof ModelBlock>;

export const ImportModelResponse = z.object({
  weeksFound: z.number().int().min(0),
  daysNamed: z.boolean(),
  weeks: z.array(z.object({
    label: z.string().max(80),
    days: z.array(z.object({
      day: z.number().int().min(1).max(7),
      blocks: z.array(ModelBlock),
    })),
  })),
});
export type ImportModelResponse = z.infer<typeof ImportModelResponse>;
