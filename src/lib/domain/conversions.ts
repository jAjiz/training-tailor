import type { Conversions, EffortUnit } from "./types";

export interface EffortAmount { movement: string; unit: EffortUnit; amount: number }
export interface EffortTarget { movement: string; unit: EffortUnit }

/** Deterministic effort conversion within an equivalence group; null when no group holds both. */
export function convertEffort(
  conversions: Conversions, from: EffortAmount, to: EffortTarget, sex: "male" | "female" | null,
): number | null {
  for (const group of conversions.effort) {
    const a = group.equivalents.find((e) => e.movement === from.movement && e.unit === from.unit);
    const b = group.equivalents.find((e) => e.movement === to.movement && e.unit === to.unit);
    if (!a || !b) continue;
    const amountOf = (e: typeof a) => (sex === null ? (e.male + e.female) / 2 : e[sex]);
    const raw = (from.amount * amountOf(b)) / amountOf(a);
    return to.unit === "meters" ? Math.round(raw / 10) * 10 : Math.max(1, Math.round(raw));
  }
  return null;
}
