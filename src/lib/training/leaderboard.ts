export type RankInput = { division: string; capped: boolean; sortKey: number | null; createdAt: Date };

function compare(a: RankInput, b: RankInput): number {
  const division = (x: RankInput) => (x.division === "rx" ? 0 : 1);
  return division(a) - division(b) || Number(a.capped) - Number(b.capped) || (b.sortKey ?? 0) - (a.sortKey ?? 0);
}

/** Competition ranking (1, 1, 3): rx before scaled, finished before capped, higher sortKey first. */
export function rank<T extends RankInput>(entries: readonly T[]): (T & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => compare(a, b) || a.createdAt.getTime() - b.createdAt.getTime());
  const ranked: (T & { rank: number })[] = [];
  sorted.forEach((entry, i) => {
    const tied = i > 0 && compare(sorted[i - 1], entry) === 0;
    ranked.push({ ...entry, rank: tied ? ranked[i - 1].rank : i + 1 });
  });
  return ranked;
}
