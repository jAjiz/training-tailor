import type { ActiveCondition } from "@/lib/domain/assess";
import type { Contraindication } from "@/lib/domain/types";
import type { ConditionRef, ConfirmedCondition, ProfileInjury } from "./types";

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
