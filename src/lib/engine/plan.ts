import { assessMovement, type ActiveCondition, type AssessmentReason, type Verdict } from "@/lib/domain/assess";
import type { MovementResolver } from "@/lib/domain/resolve";
import { Equipment, type Movement, type MovementPattern } from "@/lib/domain/types";
import type { StructuredWorkout } from "./types";

export interface PlanContext {
  movements: Movement[];
  resolve: MovementResolver;
  active: ActiveCondition[];
  equipment: Equipment[] | null; // null = a full box
}

export interface Candidate {
  name: string;
  verdict: "ok" | "caution";
  source: "substitute" | "pattern" | "related" | "goal";
  score: number;
}

export interface ComponentPlan {
  blockIndex: number;
  componentIndex: number;
  movement: string;
  canonical: string | null;
  verdict: Verdict | "unknown";
  reasons: AssessmentReason[];
  missingEquipment: Equipment[];
  needsChange: boolean;
  candidates: Candidate[];
}

/** Today's equipment overrides the profile; null with nothing missing means a full box. */
export function availableEquipment(
  profile: Equipment[] | null, today: Equipment[] | null, unavailable: Equipment[],
): Equipment[] | null {
  const base = today ?? profile;
  if (base === null && unavailable.length === 0) return null;
  return (base ?? Equipment.options).filter((e) => !unavailable.includes(e));
}

export function missingEquipment(m: Movement, equipment: Equipment[] | null): Equipment[] {
  return equipment === null ? [] : m.equipment.filter((e) => !equipment.includes(e));
}

function usable(m: Movement, ctx: PlanContext): "ok" | "caution" | null {
  if (missingEquipment(m, ctx.equipment).length > 0) return null;
  const v = assessMovement(m, ctx.active).verdict;
  return v === "avoid" ? null : v;
}

function sharedStressPairs(a: Movement, b: Movement): number {
  let n = 0;
  for (const sa of a.stresses) {
    for (const sb of b.stresses) {
      if (sa.site === sb.site) n += sa.mechanisms.filter((m) => sb.mechanisms.includes(m)).length;
    }
  }
  return n;
}

const VERDICT_RANK = { ok: 0, caution: 1 } as const;
const byRank = (a: Candidate, b: Candidate) =>
  VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.score - a.score || a.name.localeCompare(b.name);

/** Closest pattern to fall back on when a movement has no usable candidate left (no bar → rows for pull-ups). */
export const RELATED_PATTERNS: Partial<Record<MovementPattern, MovementPattern[]>> = {
  vertical_pull: ["horizontal_pull"],
  horizontal_pull: ["vertical_pull"],
  vertical_push: ["horizontal_push"],
  horizontal_push: ["vertical_push"],
  squat: ["lunge"],
  lunge: ["squat"],
  carry: ["hold"],
  hold: ["carry"],
};

function patternCandidates(
  original: Movement, pattern: MovementPattern, ctx: PlanContext, source: "pattern" | "related" = "pattern",
): Candidate[] {
  const out: Candidate[] = [];
  for (const m of ctx.movements) {
    if (m.name === original.name || !m.patterns.includes(pattern)) continue;
    const verdict = usable(m, ctx);
    if (!verdict) continue;
    const score =
      10 * m.patterns.filter((p) => original.patterns.includes(p)).length +
      2 * sharedStressPairs(original, m) +
      (m.skill === original.skill ? 1 : 0);
    out.push({ name: m.name, verdict, source, score });
  }
  return out.sort(byRank);
}

/**
 * substitutes[] first (in order), then pattern candidates for every pattern of the original that no
 * surviving substitute covers: a Thruster whose press is blocked still gets squats, so the stimulus survives.
 * Only when nothing at all survives do the RELATED_PATTERNS step in.
 *
 * Order: candidates no riskier than the original first (only "ok" when the original must change for safety, "ok"
 * or "caution" when it was already "caution"), then those covering more of its patterns, then ok before caution.
 * A Dumbbell Thruster thus leads for a Thruster without a barbell instead of a half-movement like a press.
 */
export function rankCandidates(original: Movement, ctx: PlanContext, limit = 5, perPattern = 3): Candidate[] {
  const listed: { candidate: Candidate; movement: Movement }[] = [];
  original.substitutes.forEach((name, i) => {
    const m = ctx.resolve(name);
    const verdict = m ? usable(m, ctx) : null;
    if (m && verdict) listed.push({ candidate: { name: m.name, verdict, source: "substitute", score: 1000 - i }, movement: m });
  });
  const kept = listed.sort((a, b) => byRank(a.candidate, b.candidate)).slice(0, limit);
  const out = kept.map((l) => l.candidate);

  const covered = new Set(kept.flatMap((l) => l.movement.patterns));
  for (const pattern of original.patterns.filter((p) => !covered.has(p))) {
    const fresh = patternCandidates(original, pattern, ctx).filter((c) => !out.some((o) => o.name === c.name));
    out.push(...fresh.slice(0, listed.length === 0 && pattern === original.patterns[0] ? limit : perPattern));
  }
  // Nothing of the movement survives: offer the closest pattern rather than leaving the model to improvise.
  for (const related of original.patterns.flatMap((p) => RELATED_PATTERNS[p] ?? [])) {
    if (out.length > 0) break;
    out.push(...patternCandidates(original, related, ctx, "related").slice(0, limit));
  }
  const tolerated = assessMovement(original, ctx.active).verdict === "caution" ? VERDICT_RANK.caution : VERDICT_RANK.ok;
  const riskier = (c: Candidate) => (VERDICT_RANK[c.verdict] > tolerated ? 1 : 0);
  const coverage = new Map(out.map((c) => [c.name, ctx.resolve(c.name)?.patterns.filter((p) => original.patterns.includes(p)).length ?? 0]));
  return out.sort((a, b) => riskier(a) - riskier(b) || coverage.get(b.name)! - coverage.get(a.name)! || byRank(a, b));
}

export function planComponents(workout: StructuredWorkout, ctx: PlanContext): ComponentPlan[] {
  return workout.blocks.flatMap((block, blockIndex) =>
    block.components.map((c, componentIndex): ComponentPlan => {
      const m = c.canonical ? ctx.resolve(c.canonical) : null;
      if (!m) {
        return {
          blockIndex, componentIndex, movement: c.movement, canonical: null, verdict: "unknown",
          reasons: [], missingEquipment: [], needsChange: false, candidates: [],
        };
      }
      const assessment = assessMovement(m, ctx.active);
      const missing = missingEquipment(m, ctx.equipment);
      const needsChange = assessment.verdict === "avoid" || missing.length > 0;
      return {
        blockIndex, componentIndex, movement: c.movement, canonical: m.name, verdict: assessment.verdict,
        reasons: assessment.reasons, missingEquipment: missing, needsChange,
        candidates: needsChange || assessment.verdict === "caution" ? rankCandidates(m, ctx) : [],
      };
    }),
  );
}

/** Movement-goal bias: the target and its substitutes the athlete can do today. */
export function goalFamily(target: string | null, ctx: PlanContext): Candidate[] {
  const m = target ? ctx.resolve(target) : null;
  if (!m) return [];
  const out: Candidate[] = [];
  for (const name of [m.name, ...m.substitutes]) {
    const x = ctx.resolve(name);
    const verdict = x ? usable(x, ctx) : null;
    if (x && verdict) out.push({ name: x.name, verdict, source: "goal", score: 0 });
  }
  return out;
}
