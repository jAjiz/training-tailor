import { z } from "zod";
import { Equipment } from "@/lib/domain/types";
import {
  ConditionRefSchema, ConfirmedConditionSchema, ManualWorkoutSchema, PipelineResultSchema, RestrictionSchema, StructuredWorkoutSchema,
  TailorRequestSchema, WorkoutAnalysisResultSchema,
} from "@/lib/engine/types";

// Raw body caps, checked before parsing: analyze carries the paste; tailor, feedback analysis, refine and save carry
// an analyzed workout or a whole PipelineResult, all of which the client could inflate.
export const MAX_TAILOR_BODY_CHARS = 64_000;
export const MAX_RESULT_BODY_CHARS = 256_000;

export const WorkoutInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paste"), rawText: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("manual"), workout: ManualWorkoutSchema }),
]);

const feedback = z.string().trim().min(1).max(2000);
const confirmed = z.array(ConfirmedConditionSchema).max(20);
const restrictions = z.array(RestrictionSchema).max(20); // answered in the clarify step

export const AnalyzeBodySchema = z.object({ input: WorkoutInputSchema, request: TailorRequestSchema });
// Refine feedback, or a free-text answer to a clarifying question, read against the session it applies to.
export const AnalyzeFeedbackBodySchema = z.object({
  feedback,
  session: z.object({
    original: StructuredWorkoutSchema,
    conditions: z.array(ConditionRefSchema).max(20),
    restrictions,
    unavailableEquipment: z.array(Equipment),
  }),
  request: TailorRequestSchema,
});
export const TailorBodySchema = z.object({
  analysis: WorkoutAnalysisResultSchema.pick({ original: true, unavailableEquipment: true }),
  confirmed,
  restrictions,
  request: TailorRequestSchema,
});
export const RefineBodySchema = z.object({
  previous: PipelineResultSchema,
  feedback,
  confirmed,
  restrictions,
  unavailableEquipment: z.array(Equipment),
  request: TailorRequestSchema,
});
export const SaveBodySchema = z.object({ result: PipelineResultSchema, request: TailorRequestSchema });
