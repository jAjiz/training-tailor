/** The current 1RM is the heaviest recorded entry. */
export function currentOneRm(entries: readonly { kg: number }[]): number | null {
  return entries.length ? Math.max(...entries.map((e) => e.kg)) : null;
}

/** The heaviest single above the current 1RM, if any: the app then offers to record it. */
export function singleAbove(sets: readonly { kg: number; reps: number }[], current: number | null): number | null {
  const singles = sets.filter((s) => s.reps === 1 && s.kg > 0).map((s) => s.kg);
  if (singles.length === 0) return null;
  const top = Math.max(...singles);
  return current === null || top > current ? top : null;
}
