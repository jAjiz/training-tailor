import { z } from "zod";
import { Scoring } from "@/lib/training/schemas";

/** The most weeks one import keeps; the model is told to stop there too. */
export const MAX_IMPORT_WEEKS = 4;

/**
 * One block as the model writes it. Every block imports as custom, so the model only copies text. Fields
 * that rarely apply are optional so the model leaves them out instead of writing nulls: output length is
 * what makes a long PDF slow.
 */
const ModelBlock = z.object({
  title: z.string().max(120).optional(),
  description: z.string().max(5000),
  coachingTips: z.string().max(2000).optional(),
  scoring: Scoring.optional(),
  timeCapSeconds: z.number().int().optional(),
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

/** The tidy pass over blocks already cut from a calendar PDF: the model only rewraps text, by block id. */
export const TidyResponse = z.object({
  blocks: z.array(z.object({
    id: z.number().int(),
    description: z.string().max(5000),
    coachingTips: z.string().max(2000).optional(),
    scoring: Scoring.optional(),
    timeCapSeconds: z.number().int().optional(),
  })),
});
export type TidyResponse = z.infer<typeof TidyResponse>;
