import type { Movement } from "@/lib/domain/types";
import type { BarbellSet } from "./schemas";

export type LiftGroup = { pattern: string; movements: string[] };

const PATTERN_ORDER = ["squat", "hinge", "olympic", "vertical_push", "horizontal_push", "lunge", "horizontal_pull", "vertical_pull"];

const isLift = (m: Movement) => m.equipment.includes("barbell");

/** Barbell movements (the ones a 1RM applies to), grouped by their first pattern. */
export function liftCatalog(movements: readonly Movement[]): LiftGroup[] {
  const groups = new Map<string, string[]>();
  for (const m of movements.filter(isLift)) {
    const pattern = m.patterns[0];
    groups.set(pattern, [...(groups.get(pattern) ?? []), m.name]);
  }
  const rank = (p: string) => (PATTERN_ORDER.includes(p) ? PATTERN_ORDER.indexOf(p) : PATTERN_ORDER.length);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([pattern, names]) => ({ pattern, movements: [...names].sort((x, y) => x.localeCompare(y)) }));
}

export function isLiftMovement(name: string, movements: readonly Movement[]): boolean {
  return movements.some((m) => m.name === name && isLift(m));
}

export function percentToKg(percent: number, oneRm: number): number {
  return Math.round((percent / 100) * oneRm * 2) / 2;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const sameSet = (a: BarbellSet, b: BarbellSet) => a.reps === b.reps && a.percent === b.percent && a.kg === b.kg;

/** "3 × 5 @ 80 % (100 kg)" lines, collapsing identical consecutive sets. */
export function describeSets(sets: readonly BarbellSet[], oneRm: number | null): string[] {
  const lines: string[] = [];
  for (let i = 0; i < sets.length;) {
    let j = i;
    while (j + 1 < sets.length && sameSet(sets[j + 1], sets[i])) j++;
    const s = sets[i];
    const load = s.percent !== null
      ? `${num(s.percent)} %${oneRm !== null ? ` (${num(percentToKg(s.percent, oneRm))} kg)` : ""}`
      : `${num(s.kg as number)} kg`;
    const count = j - i + 1;
    lines.push(`${count > 1 ? `${count} × ` : ""}${s.reps} @ ${load}`);
    i = j + 1;
  }
  return lines;
}
