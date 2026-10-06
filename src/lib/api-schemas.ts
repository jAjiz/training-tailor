import { z } from "zod";
import { Equipment } from "@/lib/domain/types";
import {
  ConfirmedConditionSchema, DismissedConditionSchema, ManualWorkoutSchema, PipelineResultSchema, TailorRequestSchema, WorkoutAnalysisResultSchema,
} from "@/lib/engine/types";

// Raw body caps, checked before parsing: tailor carries an analyzed workout, refine and save a whole PipelineResult,
// all of which the client could inflate.
export const MAX_TAILOR_BODY_CHARS = 64_000;
export const MAX_RESULT_BODY_CHARS = 256_000;

export const WorkoutInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paste"), rawText: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("manual"), workout: ManualWorkoutSchema }),
]);

const feedback = z.string().trim().min(1).max(2000);
const confirmed = z.array(ConfirmedConditionSchema).max(20);
const dismissed = z.array(DismissedConditionSchema).max(20).default([]); // suggestions the athlete removed

export const AnalyzeBodySchema = z.object({ input: WorkoutInputSchema, request: TailorRequestSchema });
export const AnalyzeFeedbackBodySchema = z.object({ feedback });
export const TailorBodySchema = z.object({
  analysis: WorkoutAnalysisResultSchema.pick({ original: true, unavailableEquipment: true }),
  confirmed,
  dismissed,
  request: TailorRequestSchema,
});
export const RefineBodySchema = z.object({
  previous: PipelineResultSchema,
  feedback,
  confirmed,
  dismissed,
  unavailableEquipment: z.array(Equipment),
  request: TailorRequestSchema,
});
export const SaveBodySchema = z.object({ result: PipelineResultSchema, request: TailorRequestSchema });
