import { z } from "zod";
import { ManualWorkoutSchema, PipelineResultSchema, TailorRequestSchema } from "@/lib/engine/types";

export const WorkoutInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paste"), rawText: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("manual"), workout: ManualWorkoutSchema }),
]);

export const TailorBodySchema = z.object({ input: WorkoutInputSchema, request: TailorRequestSchema });
export const RefineBodySchema = z.object({
  previous: PipelineResultSchema,
  feedback: z.string().trim().min(1).max(2000),
  request: TailorRequestSchema,
});
export const SaveBodySchema = z.object({ result: PipelineResultSchema, request: TailorRequestSchema });
