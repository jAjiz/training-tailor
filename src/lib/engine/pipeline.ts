import type { LlmProvider } from "@/lib/ai/provider";
import { assessMovement, type ActiveCondition } from "@/lib/domain/assess";
import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { Equipment } from "@/lib/domain/types";
import { analyzePaste, analyzeSituation, type AnalyzeContext } from "./analyze";
import { buildQuestions } from "./clarify";
import { activateConditions, profileConditionRefs, restrictionConditions } from "./conditions";
import {
  availableEquipment, goalFamily, missingEquipment, planComponents, type ComponentPlan, type PlanContext,
} from "./plan";
import { tailor, type TailorInput } from "./tailor";
import {
  REMOVED_MOVEMENT,
  type AthleteProfile, type ConditionRef, type ConfirmedCondition, type FeedbackAnalysis, type Finding,
  type PipelineResult, type Restriction, type StructuredWorkout, type TailorRequest, type TailoringResult,
  type WorkoutAnalysisResult,
} from "./types";
import { isViolation, validateTailoring } from "./validate";

export type ProgressStage = "analyzing" | "tailoring" | "validating" | "retrying";

/** A contraindicated movement survived the retry: nothing is returned to the athlete. */
export class EngineUnsafeError extends Error {
  constructor(readonly findings: Finding[]) {
    super("engine_unsafe");
    this.name = "EngineUnsafeError";
  }
}

export interface AnalyzeArgs {
  rawText: string; // the session as the coach wrote it
  request: TailorRequest;
  profile: AthleteProfile;
  domain: DomainData;
}

/** What the session already carries when feedback (or a clarifying free-text answer) is analyzed. */
export interface FeedbackSession {
  original: StructuredWorkout;
  conditions: ConditionRef[];
  restrictions: Restriction[];
  unavailableEquipment: Equipment[];
}

export interface FeedbackArgs {
  feedback: string;
  session: FeedbackSession;
  request: TailorRequest;
  profile: AthleteProfile;
  domain: DomainData;
}

/** Phase 2 input: the phase-1 session, today's conditions and the answered restrictions. */
export interface PipelineArgs {
  original: StructuredWorkout;
  confirmed: ConfirmedCondition[]; // today's non-pain catalog conditions
  restrictions: Restriction[];
  unavailableEquipment: Equipment[];
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

export interface RefineArgs {
  previous: PipelineResult;
  feedback: string;
  confirmed: ConfirmedCondition[]; // non-pain conditions the feedback added
  restrictions: Restriction[]; // restrictions the feedback added, answered
  unavailableEquipment: Equipment[]; // equipment the feedback says is missing
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

interface TailorStage {
  original: StructuredWorkout;
  refs: ConditionRef[];
  catalogActive: ActiveCondition[]; // profile and today's catalog conditions, index-aligned with refs
  restrictions: Restriction[];
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

/** The athlete's pick is that component's only candidate; a pick the conditions or the equipment forbid is ignored. */
function forceReplacements(plan: ComponentPlan[], restrictions: Restriction[], ctx: PlanContext): ComponentPlan[] {
  const picks = restrictions.flatMap((r) => r.replacements);
  return plan.map((p) => {
    const pick = picks.find((x) => x.blockIndex === p.blockIndex && x.componentIndex === p.componentIndex);
    const m = pick ? ctx.resolve(pick.replacement) : null;
    if (!p.needsChange || !m) return p;
    const verdict = assessMovement(m, ctx.active).verdict;
    if (verdict === "avoid" || missingEquipment(m, ctx.equipment).length > 0) return p;
    return { ...p, candidates: [{ name: m.name, verdict, source: "athlete", score: 0 }] };
  });
}

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
  const active = [...s.catalogActive, ...restrictionConditions(s.restrictions)];
  const planContext = { movements: domain.movements, resolve: createMovementResolver(domain.movements), active, equipment };
  const input: TailorInput = {
    original: s.original, profile: s.profile, request: s.request, conditions: s.refs, restrictions: s.restrictions,
    contraindications: domain.contraindications,
    plan: forceReplacements(planComponents(s.original, planContext), s.restrictions, planContext),
    goal: goalFamily(s.request.targetMovement, planContext), equipment, movements: domain.movements,
    conversions: domain.conversions, previousAttempt: s.previousAttempt, violations: [],
  };
  const validate = (result: TailoringResult) => validateTailoring({
    original: s.original, result, movements: domain.movements, active, equipment,
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

/**
 * Phase 1: the session, today's restrictions and non-pain conditions, and the questions only the athlete can
 * answer (built from the plan, no model call). Nothing is tailored yet.
 */
export async function analyzeWorkout(provider: LlmProvider, args: AnalyzeArgs): Promise<WorkoutAnalysisResult> {
  const ctx = analyzeContext(args.domain);
  const a = await analyzePaste(provider, args.rawText, args.request.situation, ctx);
  const { active } = activateConditions(profileConditionRefs(args.profile.injuries), a.conditions, args.domain.contraindications);
  const questions = buildQuestions({
    original: a.workout, restrictions: a.restrictions, base: active, movements: args.domain.movements,
    equipment: availableEquipment(args.profile.equipment, args.request.equipmentToday, a.unavailableEquipment),
  });
  return {
    original: a.workout, suggested: a.conditions, restrictions: a.restrictions, questions,
    unavailableEquipment: a.unavailableEquipment, analyzed: a.analyzed,
  };
}

/** Refine phase 1 (and a free-text answer to a question): what the feedback adds, and its questions. */
export async function analyzeFeedback(provider: LlmProvider, args: FeedbackArgs): Promise<FeedbackAnalysis> {
  const s = await analyzeSituation(provider, args.feedback, analyzeContext(args.domain));
  const { session } = args;
  const { active } = activateConditions(
    [...profileConditionRefs(args.profile.injuries), ...session.conditions], s.conditions, args.domain.contraindications,
  );
  const unavailable = [...new Set([...session.unavailableEquipment, ...s.unavailableEquipment])];
  const questions = buildQuestions({
    original: session.original, restrictions: s.restrictions, offset: session.restrictions.length,
    base: [...active, ...restrictionConditions(session.restrictions)], movements: args.domain.movements,
    equipment: availableEquipment(args.profile.equipment, args.request.equipmentToday, unavailable),
  });
  return { suggested: s.conditions, restrictions: s.restrictions, questions, unavailableEquipment: s.unavailableEquipment };
}

export async function runTailorPipeline(provider: LlmProvider, args: PipelineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  const { active, refs } = activateConditions(
    profileConditionRefs(args.profile.injuries), args.confirmed, args.domain.contraindications,
  );
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.original, refs, catalogActive: active, restrictions: args.restrictions,
    unavailable: args.unavailableEquipment, profile: args.profile, request: args.request, domain: args.domain,
    previousAttempt: null, progress,
  });
  return {
    original: args.original, conditions: refs, restrictions: args.restrictions, unavailableEquipment: args.unavailableEquipment,
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
  const restrictions = [...args.previous.restrictions, ...args.restrictions];
  const unavailable = [...new Set([...args.previous.unavailableEquipment, ...args.unavailableEquipment])];
  const feedbackHistory = [...args.previous.feedbackHistory, args.feedback];
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.previous.original, refs, catalogActive: active, restrictions, unavailable, profile: args.profile,
    request: args.request, domain: args.domain, previousAttempt: { result: args.previous.tailored, feedbackHistory }, progress,
  });
  return {
    original: args.previous.original, conditions: refs, restrictions, unavailableEquipment: unavailable,
    tailored: result, findings, feedbackHistory, model: provider.model,
  };
}
