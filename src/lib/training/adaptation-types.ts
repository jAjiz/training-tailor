import { z } from "zod";
import { Equipment, StressMechanism } from "@/lib/domain/types";
import type { ClarifyAnswer as EngineClarifyAnswer } from "@/lib/engine/clarify";
import {
  ChangeItemSchema, ClarifyQuestionSchema, ConfirmedConditionSchema, FindingSchema, PipelineResultSchema, RestrictionSchema,
  StructuredWorkoutSchema, TailoringResultSchema,
} from "@/lib/engine/types";

const index = z.number().int().nonnegative();

/** A button answer to a clarifying question (the engine's ClarifyAnswer). */
export const ClarifyAnswer = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("site"), restriction: index,
    mechanisms: z.union([z.array(StressMechanism).max(StressMechanism.options.length), z.literal("all"), z.literal("none")]),
  }),
  z.object({
    kind: z.literal("replacement"), restriction: index, blockIndex: index, componentIndex: index,
    replacement: z.string().min(1).max(80),
  }),
]) satisfies z.ZodType<EngineClarifyAnswer>;
export type ClarifyAnswer = EngineClarifyAnswer;

export const ADAPTATION_ERROR_CODES = ["engine_unsafe", "engine_empty", "engine_failed", "quota_exceeded"] as const;

const at = z.string(); // ISO timestamp

/** One entry of the conversation, in order. */
export const AdaptationMessage = z.discriminatedUnion("role", [
  z.object({ role: z.literal("athlete"), at, text: z.string() }),
  z.object({ role: z.literal("question"), at, question: ClarifyQuestionSchema }),
  z.object({ role: z.literal("answer"), at, answer: z.union([ClarifyAnswer, z.object({ text: z.string() })]) }),
  z.object({ role: z.literal("proposal"), at, tailored: TailoringResultSchema, findings: z.array(FindingSchema) }),
  z.object({ role: z.literal("error"), at, code: z.enum(ADAPTATION_ERROR_CODES) }),
]);
export type AdaptationMessage = z.infer<typeof AdaptationMessage>;

/**
 * The engine session the server keeps. `conditions`, `restrictions`, `unavailableEquipment` and `feedback` are what the
 * current turn adds (everything before the first proposal; since `last` after it); a proposal folds them into `last`.
 */
export const AdaptationState = z.object({
  analysisHash: z.string(), // the block's contentHash when it was analyzed
  original: StructuredWorkoutSchema, // the stored block analysis, without the athlete's loads
  conditions: z.array(ConfirmedConditionSchema),
  restrictions: z.array(RestrictionSchema),
  unavailableEquipment: z.array(Equipment),
  pendingQuestions: z.array(ClarifyQuestionSchema),
  feedback: z.string().nullable(),
  last: PipelineResultSchema.nullable(),
});
export type AdaptationState = z.infer<typeof AdaptationState>;

export const AcceptedAdaptation = z.object({
  tailored: TailoringResultSchema,
  findings: z.array(FindingSchema),
  workoutHash: z.string(), // the block's workoutHash when it was accepted
  acceptedAt: z.string(),
});
export type AcceptedAdaptation = z.infer<typeof AcceptedAdaptation>;

/** What a result keeps of the adaptation the athlete performed. */
export const AdaptationSnapshot = z.object({
  text: z.string(),
  changes: z.array(ChangeItemSchema),
  safetyNote: z.string().nullable(),
  situation: z.array(z.string()), // the athlete's own words
});
export type AdaptationSnapshot = z.infer<typeof AdaptationSnapshot>;

/** Body of the analyze route: a typed message, or button answers to the open questions. */
export const AdaptMessageInput = z.union([
  z.object({ text: z.string().trim().min(1).max(2000) }),
  z.object({ answers: z.array(ClarifyAnswer).min(1).max(20) }),
]);
export type AdaptMessageInput = z.infer<typeof AdaptMessageInput>;
