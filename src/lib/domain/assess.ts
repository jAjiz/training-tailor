import {
  LOWER_LIMB_SITES, UPPER_LIMB_SITES,
  type Contraindication, type ContraindicationKind, type Movement, type Severity,
  type Side, type Site, type StressLoad, type Tier,
} from "./types";

export type Verdict = "ok" | "caution" | "avoid";

export interface ActiveCondition {
  contraindication: Contraindication;
  side: Side | null;
  severity: Severity;
}

export interface AssessmentReason {
  conditionKey: string;
  verdict: Exclude<Verdict, "ok">;
  detail: string; // "knee: deep_flexion" | "position: hanging" | "explicit"
  healthySideOnly: boolean;
}

export interface Assessment {
  verdict: Verdict;
  reasons: AssessmentReason[];
}

const RANK: Record<Verdict, number> = { ok: 0, caution: 1, avoid: 2 };

export function worstVerdict(a: Verdict, b: Verdict): Verdict {
  return RANK[a] >= RANK[b] ? a : b;
}

// Spec "Assessment": rule tier × stress load × severity.
const TABLE: Record<Tier, Record<StressLoad, Record<Severity, Verdict>>> = {
  avoid: {
    high: { mild: "caution", moderate: "avoid", acute: "avoid" },
    low: { mild: "ok", moderate: "caution", acute: "avoid" },
  },
  caution: {
    high: { mild: "caution", moderate: "caution", acute: "avoid" },
    low: { mild: "ok", moderate: "ok", acute: "caution" },
  },
};

export function effectiveVerdict(
  tier: Tier, load: StressLoad, severity: Severity, kind: ContraindicationKind,
): Verdict {
  return TABLE[tier][load][kind === "injury" ? severity : "moderate"];
}

function limbOf(site: Site): "upper" | "lower" | null {
  if ((UPPER_LIMB_SITES as readonly Site[]).includes(site)) return "upper";
  if ((LOWER_LIMB_SITES as readonly Site[]).includes(site)) return "lower";
  return null;
}

export function assessMovement(movement: Movement, active: ActiveCondition[]): Assessment {
  const reasons: AssessmentReason[] = [];
  for (const { contraindication: c, side, severity } of active) {
    if (c.avoidMovements.includes(movement.name)) {
      reasons.push({ conditionKey: c.key, verdict: "avoid", detail: "explicit", healthySideOnly: false });
    }
    for (const rule of c.positionRules) {
      if (movement.positions.includes(rule.position)) {
        reasons.push({ conditionKey: c.key, verdict: rule.tier, detail: `position: ${rule.position}`, healthySideOnly: false });
      }
    }
    for (const stress of movement.stresses) {
      for (const rule of c.rules) {
        if (rule.site !== stress.site) continue;
        const shared = rule.mechanisms.filter((m) => stress.mechanisms.includes(m));
        if (shared.length === 0) continue;
        let verdict = effectiveVerdict(rule.tier, stress.load, severity, c.kind);
        if (verdict === "ok") continue;
        let healthySideOnly = false;
        if (
          verdict === "avoid" && (side === "left" || side === "right") &&
          movement.unilateral !== null && movement.unilateral === limbOf(stress.site)
        ) {
          verdict = "caution";
          healthySideOnly = true;
        }
        reasons.push({ conditionKey: c.key, verdict, detail: `${stress.site}: ${shared.join("/")}`, healthySideOnly });
      }
    }
  }
  return { verdict: reasons.reduce<Verdict>((v, r) => worstVerdict(v, r.verdict), "ok"), reasons };
}

/** Shorthand used by integrity tests: assessed "avoid" at moderate severity, no side. */
export function matchesContraindication(movement: Movement, contraindication: Contraindication): boolean {
  return assessMovement(movement, [{ contraindication, side: null, severity: "moderate" }]).verdict === "avoid";
}
