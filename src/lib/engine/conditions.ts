import type { ActiveCondition } from "@/lib/domain/assess";
import { Site, type Contraindication } from "@/lib/domain/types";
import type { ConditionRef, ConfirmedCondition, ProfileInjury, Restriction } from "./types";

export interface ActivatedConditions {
  active: ActiveCondition[]; // index-aligned with refs
  refs: ConditionRef[];
}

export function profileConditionRefs(injuries: ProfileInjury[]): ConditionRef[] {
  return injuries.map((i) => ({ key: i.key, side: i.side, severity: i.severity, source: "profile", evidence: i.notes }));
}

/** base (profile or a previous result) ⊕ today's confirmed conditions; for the same key today's side/severity win. */
export function activateConditions(
  base: ConditionRef[], confirmed: ConfirmedCondition[], catalog: Contraindication[],
): ActivatedConditions {
  const merged = new Map<string, ConditionRef>();
  for (const r of base) merged.set(r.key, r);
  for (const d of confirmed) {
    merged.set(d.key, { key: d.key, side: d.side, severity: d.severity, source: "today", evidence: d.evidence });
  }
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const out: ActivatedConditions = { active: [], refs: [] };
  for (const ref of merged.values()) {
    const contraindication = byKey.get(ref.key);
    if (!contraindication) {
      console.warn(`conditions: unknown key "${ref.key}" ignored`);
      continue;
    }
    out.active.push({ contraindication, side: ref.side, severity: ref.severity });
    out.refs.push(ref);
  }
  return out;
}

/** A restriction bans something only when the athlete named a movement, a kind of load or a position. */
export const hasScope = (r: Restriction) => r.movements.length + r.mechanisms.length + r.positions.length > 0;

/**
 * Each restriction that bans something becomes a synthetic limitation `today_<offset+i>` (offset = restrictions
 * before it, as in refine): its movements by name, its kinds of load at its site (every site when none was named),
 * its positions. A limitation applies its tiers as written, and its side keeps the healthy-side exemption.
 */
export function restrictionConditions(restrictions: Restriction[], offset = 0): ActiveCondition[] {
  return restrictions.flatMap((r, i): ActiveCondition[] => {
    if (!hasScope(r)) return [];
    const sites = r.site ? [r.site] : Site.options;
    const contraindication: Contraindication = {
      key: restrictionKey(offset + i),
      label: r.evidence,
      kind: "limitation",
      rules: r.mechanisms.length > 0 ? sites.map((site) => ({ site, mechanisms: r.mechanisms, tier: "avoid" as const })) : [],
      positionRules: r.positions.map((position) => ({ position, tier: "avoid" as const })),
      avoidMovements: r.movements,
      notes: null,
    };
    return [{ contraindication, side: r.side, severity: "moderate" }];
  });
}

export const restrictionKey = (i: number) => `today_${i}`;
