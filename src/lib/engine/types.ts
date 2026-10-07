import { z } from "zod";
import { Equipment, Position, Severity, Side, Site, StressMechanism } from "@/lib/domain/types";

// ---- stimulus (mirrors data/stimulus-taxonomy.json; pinned by a sync test) ----
export const Quality = z.enum(["strength", "power", "skill", "conditioning", "muscular_endurance", "preparation"]);
export type Quality = z.infer<typeof Quality>;
export const EnergySystem = z.enum(["phosphagen", "glycolytic", "oxidative"]);
export type EnergySystem = z.infer<typeof EnergySystem>;
export const LoadIntensity = z.enum(["light", "moderate", "heavy"]);
export type LoadIntensity = z.infer<typeof LoadIntensity>;

export const StimulusProfileSchema = z.object({
  quality: Quality,
  energySystem: EnergySystem.nullable(),
  loadIntensity: LoadIntensity.nullable(),
  rationale: z.string().min(1),
});
export type StimulusProfile = z.infer<typeof StimulusProfileSchema>;

// ---- workout ----
export const BlockFormat = z.enum(["amrap", "for_time", "emom", "intervals", "strength", "skill", "partner", "rest", "other"]);
export type BlockFormat = z.infer<typeof BlockFormat>;

export const SexLoadsSchema = z.object({
  male: z.number().positive().nullable(),
  female: z.number().positive().nullable(),
});

// What the model emits. `canonical` is never asked of the model: code resolves it.
export const ComponentDraftSchema = z.object({
  movement: z.string().min(1),
  reps: z.union([z.number(), z.string()]).nullable(), // 21, "21-15-9", "max"
  load: z.string().nullable(),                         // as written, incl. tiers: "61/43 kg"
  loadKg: SexLoadsSchema.nullable(),
  percent1RM: z.number().positive().max(120).nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  calories: z.number().nonnegative().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  notes: z.string().nullable(),
});
export type ComponentDraft = z.infer<typeof ComponentDraftSchema>;

export const WorkoutComponentSchema = ComponentDraftSchema.extend({ canonical: z.string().nullable() });
export type WorkoutComponent = z.infer<typeof WorkoutComponentSchema>;

const blockFields = {
  title: z.string().nullable(),
  rawText: z.string().min(1),                       // verbatim slice of the input
  day: z.number().int().positive().nullable(),      // multi-day pastes (missed days)
  format: BlockFormat,
  scheme: z.string().nullable(),
  timeDomainMinutes: z.number().nonnegative().nullable(),
  coachingNotes: z.string().nullable(),             // intensity/tempo/scaling tiers as prose
  stimulus: StimulusProfileSchema.nullable(),       // null only for rest blocks or a failed analysis
};

export const BlockDraftSchema = z.object({ ...blockFields, components: z.array(ComponentDraftSchema) });
export type BlockDraft = z.infer<typeof BlockDraftSchema>;
export const WorkoutBlockSchema = z.object({ ...blockFields, components: z.array(WorkoutComponentSchema) });
export type WorkoutBlock = z.infer<typeof WorkoutBlockSchema>;

export const WorkoutDraftSchema = z.object({ name: z.string().nullable(), blocks: z.array(BlockDraftSchema).min(1) });
export type WorkoutDraft = z.infer<typeof WorkoutDraftSchema>;

export const WorkoutSource = z.enum(["paste"]); // workouts arrive as the coach's free text
export type WorkoutSource = z.infer<typeof WorkoutSource>;

// A training SESSION. rawText is the durable source of truth; blocks are a derived extraction.
export const StructuredWorkoutSchema = z.object({
  name: z.string().nullable(),
  rawText: z.string().min(1),
  source: WorkoutSource,
  blocks: z.array(WorkoutBlockSchema).min(1),
});
export type StructuredWorkout = z.infer<typeof StructuredWorkoutSchema>;

// ---- analysis ----
export const DetectedConditionSchema = z.object({
  key: z.string().min(1),
  side: Side.nullable(),
  severity: Severity,
  evidence: z.string().min(1), // the athlete's words
});
export type DetectedCondition = z.infer<typeof DetectedConditionSchema>;

// Today's pain or limit in the athlete's own scope: it bans exactly what they named, nothing more.
export const RestrictionDraftSchema = z.object({
  site: Site.nullable(), // where it hurts; null when not said
  side: Side.nullable(),
  movements: z.array(z.string().min(1).max(80)).max(20), // library movements they cannot do
  mechanisms: z.array(StressMechanism), // kinds of load named in general terms ("nothing overhead")
  positions: z.array(Position), // positions named ("I can't hang")
  evidence: z.string().min(1).max(2000), // the athlete's words
});
export type RestrictionDraft = z.infer<typeof RestrictionDraftSchema>;

// The athlete's pick when the best replacement loaded the painful site too: that component's only candidate.
export const ReplacementChoiceSchema = z.object({
  blockIndex: z.number().int().nonnegative(),
  componentIndex: z.number().int().nonnegative(),
  replacement: z.string().min(1).max(80),
});
export type ReplacementChoice = z.infer<typeof ReplacementChoiceSchema>;

export const RestrictionSchema = RestrictionDraftSchema.extend({
  replacements: z.array(ReplacementChoiceSchema).max(20).default([]),
});
export type Restriction = z.infer<typeof RestrictionSchema>;

export const SituationAnalysisSchema = z.object({
  restrictions: z.array(RestrictionDraftSchema),
  conditions: z.array(DetectedConditionSchema), // non-pain catalog conditions only (pregnancy)
  unavailableEquipment: z.array(Equipment),
});
export type SituationAnalysis = z.infer<typeof SituationAnalysisSchema>;
export const PasteAnalysisSchema = SituationAnalysisSchema.extend({ workout: WorkoutDraftSchema });
export type PasteAnalysis = z.infer<typeof PasteAnalysisSchema>;

// ---- tailoring ----
const sourceBlocks = z.array(z.number().int().nonnegative()); // original block indices
export const TailoredBlockDraftSchema = BlockDraftSchema.extend({ sourceBlocks });
export type TailoredBlockDraft = z.infer<typeof TailoredBlockDraftSchema>;
export const TailoredBlockSchema = WorkoutBlockSchema.extend({ sourceBlocks });
export type TailoredBlock = z.infer<typeof TailoredBlockSchema>;

export const DroppedBlockSchema = z.object({ index: z.number().int().nonnegative(), reason: z.string().min(1) });
export type DroppedBlock = z.infer<typeof DroppedBlockSchema>;

export const ChangeItemSchema = z.object({
  blockIndex: z.number().int().nonnegative().nullable(), // tailored block index
  original: z.string().min(1),
  modified: z.string().min(1),
  reason: z.string().min(1),
});
export type ChangeItem = z.infer<typeof ChangeItemSchema>;
/** "modified" value of a change that removes a movement without replacing it. */
export const REMOVED_MOVEMENT = "(removed)";

const tailoringFields = {
  name: z.string().nullable(),
  rawText: z.string().min(1),
  droppedBlocks: z.array(DroppedBlockSchema),
  changes: z.array(ChangeItemSchema),
  rationale: z.string().min(1),
  safetyNote: z.string().nullable(),
};
export const TailoringDraftSchema = z.object({ ...tailoringFields, blocks: z.array(TailoredBlockDraftSchema).min(1) });
export type TailoringDraft = z.infer<typeof TailoringDraftSchema>;

/**
 * The draft schema with "movement" (and each change's "modified") restricted to the given names: the model cannot
 * name a movement code cannot assess, nor summarize a change with a name it did not prescribe.
 */
export function tailoringDraftSchemaFor(movementNames: readonly [string, ...string[]]) {
  const component = ComponentDraftSchema.extend({ movement: z.enum(movementNames) });
  const block = z.object({ ...blockFields, components: z.array(component), sourceBlocks });
  const change = ChangeItemSchema.extend({ modified: z.enum([...movementNames, REMOVED_MOVEMENT]) });
  return z.object({ ...tailoringFields, changes: z.array(change), blocks: z.array(block).min(1) });
}
export const TailoringResultSchema = z.object({ ...tailoringFields, blocks: z.array(TailoredBlockSchema).min(1) });
export type TailoringResult = z.infer<typeof TailoringResultSchema>;

// ---- athlete profile ----
export const BenchmarkKind = z.enum(["1rm", "max_reps", "time"]);
export const BenchmarkUnit = z.enum(["kg", "lb", "reps", "seconds"]);
export const Weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export const Sex = z.enum(["male", "female"]);
export const ScalingLevel = z.enum(["scaled", "intermediate", "rx", "rx_plus"]);

export const ProfileInjurySchema = z.object({
  key: z.string().min(1),
  side: Side.nullable(),
  severity: Severity,
  notes: z.string().nullable(),
  since: z.string().nullable(), // ISO date
});
export type ProfileInjury = z.infer<typeof ProfileInjurySchema>;

export const BenchmarkSchema = z.object({
  movement: z.string().min(1), // canonical
  kind: BenchmarkKind,
  value: z.number().positive(),
  unit: BenchmarkUnit,
  recordedAt: z.string().nullable(),
});
export type Benchmark = z.infer<typeof BenchmarkSchema>;

export const GoalSchema = z.object({ movement: z.string().nullable(), description: z.string().min(1) });
export type Goal = z.infer<typeof GoalSchema>;

export const AvailabilitySchema = z.object({
  minutesPerDay: z.number().int().positive().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).nullable(),
  days: z.array(Weekday),
});
export type Availability = z.infer<typeof AvailabilitySchema>;

export const AthleteProfileSchema = z.object({
  sex: Sex.nullable(),
  scalingLevel: ScalingLevel.nullable(),
  injuries: z.array(ProfileInjurySchema),
  benchmarks: z.array(BenchmarkSchema),
  equipment: z.array(Equipment).nullable(), // null = not specified → a full box
  goals: z.array(GoalSchema),
  availability: AvailabilitySchema,
});
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>;

export function emptyProfile(): AthleteProfile {
  return {
    sex: null, scalingLevel: null, injuries: [], benchmarks: [], equipment: null, goals: [],
    availability: { minutesPerDay: null, daysPerWeek: null, days: [] },
  };
}

// ---- today's request (constraints combine) ----
export const TailorRequestSchema = z.object({
  situation: z.string().max(2000),             // the athlete's words: pain, fatigue, missing kit
  timeCapMinutes: z.number().int().positive().nullable(),
  targetMovement: z.string().nullable(),       // canonical, movement-improvement bias
  equipmentToday: z.array(Equipment).nullable(), // overrides the profile for today
});
export type TailorRequest = z.infer<typeof TailorRequestSchema>;

export function emptyRequest(): TailorRequest {
  return { situation: "", timeCapMinutes: null, targetMovement: null, equipmentToday: null };
}

// ---- findings and results ----
export const FindingKind = z.enum([
  "contraindicated_movement", "equipment_unavailable", "unrecognized_movement", "caution_movement",
  "time_cap_exceeded", "stimulus_drift", "unaccounted_block", "change_mismatch",
]);
export type FindingKind = z.infer<typeof FindingKind>;

export const FindingSchema = z.object({
  kind: FindingKind,
  severity: z.enum(["violation", "warning"]),
  blockIndex: z.number().int().nonnegative().nullable(),
  movement: z.string().nullable(),
  message: z.string().min(1),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ConditionRefSchema = z.object({
  key: z.string().min(1),
  side: Side.nullable(),
  severity: Severity,
  source: z.enum(["profile", "today"]),
  evidence: z.string().nullable(),
});
export type ConditionRef = z.infer<typeof ConditionRefSchema>;

export const PipelineResultSchema = z.object({
  original: StructuredWorkoutSchema,
  conditions: z.array(ConditionRefSchema),
  restrictions: z.array(RestrictionSchema).default([]), // absent in results saved before U4c
  unavailableEquipment: z.array(Equipment),
  tailored: TailoringResultSchema,
  findings: z.array(FindingSchema),
  feedbackHistory: z.array(z.string()),
  model: z.string().min(1),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;

// ---- two-phase tailor: analyze, clarify only when unclear, then tailor ----
// Today's catalog conditions (non-pain, e.g. pregnancy) apply as read; evidence null = added by hand.
export const ConfirmedConditionSchema = DetectedConditionSchema.extend({
  evidence: z.string().nullable(),
});
export type ConfirmedCondition = z.infer<typeof ConfirmedConditionSchema>;

const MechanismList = z.array(StressMechanism);
export const ClarifyQuestionSchema = z.discriminatedUnion("kind", [
  // A painful site with nothing named: which kinds of load bother it (each option lists the session's movements).
  z.object({
    kind: z.literal("site"), restriction: z.number().int().nonnegative(), site: Site, side: Side.nullable(), evidence: z.string(),
    options: z.array(z.object({ label: z.string(), mechanisms: MechanismList, movements: z.array(z.string()) })),
  }),
  // The best replacement loads the painful site like the banned movement: the athlete picks.
  z.object({
    kind: z.literal("replacement"), restriction: z.number().int().nonnegative(),
    blockIndex: z.number().int().nonnegative(), componentIndex: z.number().int().nonnegative(),
    movement: z.string(), site: Site,
    options: z.array(z.object({ name: z.string(), shared: MechanismList })), preselected: z.string(),
  }),
]);
export type ClarifyQuestion = z.infer<typeof ClarifyQuestionSchema>;

export const WorkoutAnalysisResultSchema = z.object({
  original: StructuredWorkoutSchema,
  suggested: z.array(DetectedConditionSchema),
  restrictions: z.array(RestrictionSchema),
  questions: z.array(ClarifyQuestionSchema),
  unavailableEquipment: z.array(Equipment),
  analyzed: z.boolean(), // false = degraded to one raw block
});
export type WorkoutAnalysisResult = z.infer<typeof WorkoutAnalysisResultSchema>;

export const FeedbackAnalysisSchema = z.object({
  suggested: z.array(DetectedConditionSchema),
  restrictions: z.array(RestrictionSchema),
  questions: z.array(ClarifyQuestionSchema),
  unavailableEquipment: z.array(Equipment),
});
export type FeedbackAnalysis = z.infer<typeof FeedbackAnalysisSchema>;
