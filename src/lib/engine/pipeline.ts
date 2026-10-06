import type { LlmProvider } from "@/lib/ai/provider";
import type { ActiveCondition } from "@/lib/domain/assess";
import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { Equipment } from "@/lib/domain/types";
import { analyzeManual, analyzePaste, analyzeSituation, type AnalyzeContext } from "./analyze";
import { activateConditions, profileConditionRefs } from "./conditions";
import { availableEquipment, goalFamily, planComponents } from "./plan";
import { tailor, type TailorInput } from "./tailor";
import {
  REMOVED_MOVEMENT,
  type AthleteProfile, type ConditionRef, type ConfirmedCondition, type FeedbackAnalysis, type Finding, type ManualWorkout,
  type PipelineResult, type StructuredWorkout, type TailorRequest, type TailoringResult, type WorkoutAnalysisResult,
} from "./types";
import { isViolation, validateTailoring } from "./validate";

export type WorkoutInput = { kind: "paste"; rawText: string } | { kind: "manual"; workout: ManualWorkout };
export type ProgressStage = "analyzing" | "tailoring" | "validating" | "retrying";

/** A contraindicated movement survived the retry: nothing is returned to the athlete. */
export class EngineUnsafeError extends Error {
  constructor(readonly findings: Finding[]) {
    super("engine_unsafe");
    this.name = "EngineUnsafeError";
  }
}

export interface AnalyzeArgs {
  input: WorkoutInput;
  situation: string;
  domain: DomainData;
}

/** Phase 2 input: the phase-1 session plus the conditions the athlete confirmed. */
export interface PipelineArgs {
  original: StructuredWorkout;
  confirmed: ConfirmedCondition[];
  unavailableEquipment: Equipment[];
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

export interface RefineArgs {
  previous: PipelineResult;
  feedback: string;
  confirmed: ConfirmedCondition[]; // conditions the feedback added, as the athlete confirmed them
  unavailableEquipment: Equipment[]; // equipment the feedback says is missing
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

interface TailorStage {
  original: StructuredWorkout;
  active: ActiveCondition[];
  refs: ConditionRef[];
  unavailable: Equipment[];
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  previousAttempt: TailorInput["previousAttempt"];
  progress: (stage: ProgressStage) => void;
}

const analyzeContext = (d: DomainData): AnalyzeContext => ({
  movements: d.movements, contraindications: d.contraindications, taxonomy: d.taxonomy,
});

const NO_EQUIPMENT_REASON = "No alternative with today's equipment.";

/**
 * Last resort after the retry: a movement that still needs missing equipment is removed, not handed to the
 * athlete, and its change says why. Findings name movements by their canonical library name.
 */
function removeUnavailable(result: TailoringResult, findings: Finding[]): TailoringResult {
  const gone = findings.filter((f) => f.kind === "equipment_unavailable" && f.blockIndex !== null && f.movement !== null);
  const isGone = (blockIndex: number | null, name: string) =>
    gone.find((f) => f.movement === name && (blockIndex === null || f.blockIndex === blockIndex));
  const explained = new Set<Finding>();
  const changes = result.changes.map((c) => {
    const f = isGone(c.blockIndex, c.modified);
    if (!f) return c;
    explained.add(f);
    return { ...c, modified: REMOVED_MOVEMENT, reason: NO_EQUIPMENT_REASON };
  });
  for (const f of gone) {
    if (!explained.has(f)) changes.push({ blockIndex: f.blockIndex, original: f.movement!, modified: REMOVED_MOVEMENT, reason: NO_EQUIPMENT_REASON });
  }
  return {
    ...result,
    blocks: result.blocks.map((b, i) => ({ ...b, components: b.components.filter((c) => !c.canonical || !isGone(i, c.canonical)) })),
    changes,
  };
}

async function tailorAndValidate(
  provider: LlmProvider, s: TailorStage,
): Promise<{ result: TailoringResult; findings: Finding[] }> {
  const { domain } = s;
  const equipment = availableEquipment(s.profile.equipment, s.request.equipmentToday, s.unavailable);
  const planContext = { movements: domain.movements, resolve: createMovementResolver(domain.movements), active: s.active, equipment };
  const input: TailorInput = {
    original: s.original, profile: s.profile, request: s.request, conditions: s.refs,
    contraindications: domain.contraindications, plan: planComponents(s.original, planContext),
    goal: goalFamily(s.request.targetMovement, planContext), equipment, movements: domain.movements,
    conversions: domain.conversions, previousAttempt: s.previousAttempt, violations: [],
  };
  const validate = (result: TailoringResult) => validateTailoring({
    original: s.original, result, movements: domain.movements, active: s.active, equipment,
    timeCapMinutes: s.request.timeCapMinutes,
  });

  s.progress("tailoring");
  let result = await tailor(provider, input);
  s.progress("validating");
  let findings = validate(result);
  if (findings.some(isViolation)) {
    s.progress("retrying");
    result = await tailor(provider, { ...input, violations: findings.filter(isViolation) });
    s.progress("validating");
    findings = validate(result);
  }
  if (findings.some((f) => f.kind === "equipment_unavailable" && isViolation(f))) {
    result = removeUnavailable(result, findings);
    findings = validate(result);
  }
  if (findings.some((f) => f.kind === "contraindicated_movement" && isViolation(f))) {
    throw new EngineUnsafeError(findings);
  }
  return { result, findings };
}

/** Phase 1: the session and today's SUGGESTED conditions; nothing is applied until the athlete confirms. */
export async function analyzeWorkout(provider: LlmProvider, args: AnalyzeArgs): Promise<WorkoutAnalysisResult> {
  const ctx = analyzeContext(args.domain);
  const a = args.input.kind === "paste"
    ? await analyzePaste(provider, args.input.rawText, args.situation, ctx)
    : await analyzeManual(provider, args.input.workout, args.situation, ctx);
  return { original: a.workout, suggested: a.conditions, unavailableEquipment: a.unavailableEquipment, analyzed: a.analyzed };
}

/** Refine phase 1: the conditions and missing equipment the feedback suggests. */
export async function analyzeFeedback(provider: LlmProvider, feedback: string, domain: DomainData): Promise<FeedbackAnalysis> {
  const s = await analyzeSituation(provider, feedback, analyzeContext(domain));
  return { suggested: s.conditions, unavailableEquipment: s.unavailableEquipment };
}

export async function runTailorPipeline(provider: LlmProvider, args: PipelineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  const { active, refs } = activateConditions(
    profileConditionRefs(args.profile.injuries), args.confirmed, args.domain.contraindications,
  );
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.original, active, refs, unavailable: args.unavailableEquipment,
    profile: args.profile, request: args.request, domain: args.domain, previousAttempt: null, progress,
  });
  return {
    original: args.original, conditions: refs, unavailableEquipment: args.unavailableEquipment,
    tailored: result, findings, feedbackHistory: [], model: provider.model,
  };
}

export async function runRefinePipeline(provider: LlmProvider, args: RefineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  // `previous` comes back from the client: the stored profile injuries are always re-applied.
  const { active, refs } = activateConditions(
    [...profileConditionRefs(args.profile.injuries), ...args.previous.conditions],
    args.confirmed,
    args.domain.contraindications,
  );
  const unavailable = [...new Set([...args.previous.unavailableEquipment, ...args.unavailableEquipment])];
  const feedbackHistory = [...args.previous.feedbackHistory, args.feedback];
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.previous.original, active, refs, unavailable, profile: args.profile, request: args.request,
    domain: args.domain, previousAttempt: { result: args.previous.tailored, feedbackHistory }, progress,
  });
  return {
    original: args.previous.original, conditions: refs, unavailableEquipment: unavailable,
    tailored: result, findings, feedbackHistory, model: provider.model,
  };
}
