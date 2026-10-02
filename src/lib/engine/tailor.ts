import type { LlmProvider } from "@/lib/ai/provider";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { Contraindication, Conversions, Equipment, Movement } from "@/lib/domain/types";
import type { Candidate, ComponentPlan } from "./plan";
import { resolveBlocks } from "./resolve-blocks";
import {
  TailoringDraftSchema,
  type AthleteProfile, type ConditionRef, type Finding, type StructuredWorkout, type TailorRequest, type TailoringResult,
} from "./types";

export interface TailorInput {
  original: StructuredWorkout;
  profile: AthleteProfile;
  request: TailorRequest;
  conditions: ConditionRef[];
  contraindications: Contraindication[];
  plan: ComponentPlan[];
  goal: Candidate[];
  equipment: Equipment[] | null;
  movements: Movement[];
  conversions: Conversions;
  previousAttempt: { result: TailoringResult; feedbackHistory: string[] } | null;
  violations: Finding[];
}

const SYSTEM = `You are an expert functional fitness coach. Modify ONE athlete's training session for today so it fits their situation WHILE PRESERVING EACH BLOCK'S STIMULUS (quality, energy system, load intensity, time domain). Return JSON only.

Hard rules (code checks the output and rejects violations):
1. Never prescribe a movement marked AVOID, nor one that needs MISSING equipment. Replace every component marked MUST CHANGE, preferring its candidates in order.
2. Spell every movement exactly as in the MOVEMENT LIBRARY.
3. Each tailored block lists in "sourceBlocks" the 0-based indices of the original blocks it comes from. Every original block appears in some "sourceBlocks" or in "droppedBlocks" with a reason.
4. With a time cap, the sum of "timeDomainMinutes" over the tailored blocks must not exceed it.
5. Keep each block's "stimulus" unless a change is unavoidable; then explain it in "changes".

Coaching rules:
- CAUTION movements may stay at reduced load or range: say so in the component "notes" and in "safetyNote". "healthy side only" means single-limb work on the uninjured side.
- Scale loads to the athlete's benchmarks, sex and scaling level; when the programming lists tiers (Rx+/Rx/Int, M/F) pick the athlete's. Fill "loadKg" or "percent1RM" whenever you set a load.
- Use the EFFORT CONVERSIONS when swapping monostructural or rope work, and the implement load range when replacing a barbell with dumbbells or kettlebells.
- Blocks with different "day" values are missed days: merge and prioritize them into ONE session that fits today, keeping the most important stimuli.
- A target movement means: bias the session toward its GOAL FAMILY without breaking the stimulus.
- With no constraint, keep the session and only personalize loads.
- Be conservative with pain: when unsure choose the lower-risk option, and recommend consulting a professional in "safetyNote".
- "rawText" (session and each block) is clean text of the MODIFIED workout. "rationale" explains how the stimulus is preserved; "changes" lists original/modified/reason with the tailored "blockIndex". Write prose in the language of the athlete's situation (English if none).`;

function annotate(m: Movement): string {
  const stresses = m.stresses
    .map((s) => `${s.site}(${s.mechanisms.join(",")}${s.load === "low" ? ", low" : ""})`)
    .join(" ") || "none";
  return `- ${m.name} [${m.patterns.join("+")}; ${m.skill}; equip: ${m.equipment.join("+") || "none"}; stresses: ${stresses}; positions: ${m.positions.join(",") || "none"}${m.unilateral ? `; unilateral: ${m.unilateral}` : ""}]`;
}

function planLine(p: ComponentPlan): string {
  const head = `[b${p.blockIndex}.c${p.componentIndex}] ${p.canonical ?? p.movement}`;
  if (p.verdict === "unknown") return `${head} → UNRECOGNIZED (not in the library: judge it against the active conditions yourself)`;
  const parts = [`${head} → ${p.verdict.toUpperCase()}`];
  if (p.reasons.length > 0) {
    parts.push(`(${p.reasons.map((r) => `${r.conditionKey}: ${r.detail}${r.healthySideOnly ? ", healthy side only" : ""}`).join("; ")})`);
  }
  if (p.missingEquipment.length > 0) parts.push(`missing: ${p.missingEquipment.join(", ")}`);
  if (p.needsChange) parts.push("MUST CHANGE");
  if (p.candidates.length > 0) parts.push(`candidates: ${p.candidates.map((c) => `${c.name} (${c.verdict})`).join(", ")}`);
  return parts.join("; ");
}

export function buildTailorPrompt(input: TailorInput): string {
  const byName = new Map(input.movements.map((m) => [m.name, m]));
  const catalog = new Map(input.contraindications.map((c) => [c.key, c]));
  const detailed = [...new Set([...input.plan.flatMap((p) => p.candidates), ...input.goal].map((c) => c.name))]
    .map((n) => byName.get(n))
    .filter((m): m is Movement => m !== undefined);

  const parts = [
    `ORIGINAL SESSION (block index in brackets):\n${input.original.blocks.map((b, i) => `[${i}] ${JSON.stringify({
      title: b.title, day: b.day, format: b.format, scheme: b.scheme, timeDomainMinutes: b.timeDomainMinutes,
      stimulus: b.stimulus, coachingNotes: b.coachingNotes, rawText: b.rawText, components: b.components,
    })}`).join("\n")}`,
    `ATHLETE:\n${JSON.stringify({
      sex: input.profile.sex, scalingLevel: input.profile.scalingLevel, benchmarks: input.profile.benchmarks,
      goals: input.profile.goals, minutesPerDay: input.profile.availability.minutesPerDay,
    })}`,
    `TODAY:\n${JSON.stringify({
      situation: input.request.situation, timeCapMinutes: input.request.timeCapMinutes, targetMovement: input.request.targetMovement,
    })}`,
    `ACTIVE CONDITIONS:\n${input.conditions.map((r) => {
      const c = catalog.get(r.key);
      return `- ${r.key} (${c?.label ?? r.key}) side=${r.side ?? "n/a"} severity=${r.severity} source=${r.source}${r.evidence ? `: "${r.evidence}"` : ""}${c?.notes ? ` — ${c.notes}` : ""}`;
    }).join("\n") || "none"}`,
    `EQUIPMENT AVAILABLE: ${input.equipment === null ? "a full box (assume everything)" : input.equipment.join(", ") || "none (bodyweight only)"}`,
    `COMPONENT PLAN:\n${input.plan.map(planLine).join("\n") || "(no components extracted: work from the block rawText)"}`,
    `GOAL FAMILY: ${input.goal.map((c) => `${c.name} (${c.verdict})`).join(", ") || "none"}`,
    `CANDIDATE DETAILS:\n${detailed.map(annotate).join("\n") || "none"}`,
    `EFFORT CONVERSIONS (approximate, male/female):\n${[
      ...input.conversions.effort.map((g) => `- ${g.equivalents.map((e) => `${e.movement} ${e.male}/${e.female} ${e.unit}`).join(" = ")} (${g.note})`),
      ...input.conversions.implementLoad.map((r) => `- ${r.from} → ${r.to}: ${r.perHandFraction.low}-${r.perHandFraction.high} of the barbell load per hand (${r.note})`),
    ].join("\n")}`,
    `MOVEMENT LIBRARY (names): ${input.movements.map((m) => m.name).join(", ")}`,
  ];
  if (input.previousAttempt) {
    parts.push(
      `PREVIOUS ATTEMPT (rejected by the athlete):\n${JSON.stringify(input.previousAttempt.result)}\n` +
      `ATHLETE FEEDBACK (oldest first):\n${input.previousAttempt.feedbackHistory.map((f) => `- ${f}`).join("\n")}\n` +
      `Produce a NEW modification of the ORIGINAL session that addresses the latest feedback while following every rule.`,
    );
  }
  if (input.violations.length > 0) {
    parts.push(
      `YOUR PREVIOUS OUTPUT WAS REJECTED BY THE SAFETY CHECK:\n${input.violations.map((v) => `- [${v.kind}] ${v.message}`).join("\n")}\nFix every item.`,
    );
  }
  parts.push("Return the tailored session as JSON.");
  return parts.join("\n\n");
}

export async function tailor(provider: LlmProvider, input: TailorInput): Promise<TailoringResult> {
  const draft = await provider.generateStructured({
    systemPrompt: SYSTEM,
    prompt: buildTailorPrompt(input),
    schema: TailoringDraftSchema,
    schemaName: "TailoringResult",
  });
  return { ...draft, blocks: resolveBlocks(draft.blocks, createMovementResolver(input.movements)) };
}
