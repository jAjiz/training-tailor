import type { LlmProvider } from "@/lib/ai/provider";
import type { ActiveCondition } from "@/lib/domain/assess";
import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { Equipment } from "@/lib/domain/types";
import { analyzeManual, analyzePaste, analyzeSituation, type AnalyzeContext } from "./analyze";
import { activateConditions, profileConditionRefs } from "./conditions";
import { availableEquipment, goalFamily, planComponents } from "./plan";
import { tailor, type TailorInput } from "./tailor";
import type {
  AthleteProfile, ConditionRef, Finding, ManualWorkout, PipelineResult, StructuredWorkout, TailorRequest, TailoringResult,
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

export interface PipelineArgs {
  input: WorkoutInput;
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

export interface RefineArgs {
  previous: PipelineResult;
  feedback: string;
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
  if (findings.some((f) => f.kind === "contraindicated_movement" && isViolation(f))) {
    throw new EngineUnsafeError(findings);
  }
  return { result, findings };
}

export async function runTailorPipeline(provider: LlmProvider, args: PipelineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  progress("analyzing");
  const ctx = analyzeContext(args.domain);
  const analysis = args.input.kind === "paste"
    ? await analyzePaste(provider, args.input.rawText, args.request.situation, ctx)
    : await analyzeManual(provider, args.input.workout, args.request.situation, ctx);
  const { active, refs } = activateConditions(
    profileConditionRefs(args.profile.injuries), analysis.conditions, args.domain.contraindications,
  );
  const { result, findings } = await tailorAndValidate(provider, {
    original: analysis.workout, active, refs, unavailable: analysis.unavailableEquipment,
    profile: args.profile, request: args.request, domain: args.domain, previousAttempt: null, progress,
  });
  return {
    original: analysis.workout, conditions: refs, unavailableEquipment: analysis.unavailableEquipment,
    tailored: result, findings, feedbackHistory: [], model: provider.model,
  };
}

export async function runRefinePipeline(provider: LlmProvider, args: RefineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  progress("analyzing");
  const situation = await analyzeSituation(provider, args.feedback, analyzeContext(args.domain));
  // `previous` comes back from the client: the stored profile injuries are always re-applied.
  const { active, refs } = activateConditions(
    [...profileConditionRefs(args.profile.injuries), ...args.previous.conditions],
    situation.conditions,
    args.domain.contraindications,
  );
  const unavailable = [...new Set([...args.previous.unavailableEquipment, ...situation.unavailableEquipment])];
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
