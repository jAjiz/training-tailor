import type { Finding } from "@/lib/engine/types";

/** Findings about one component line: matched by block and movement, one per kind (a movement listed twice in a block yields duplicates). */
export function componentFindings(findings: Finding[], blockIndex: number, movement: string): Finding[] {
  const seen = new Set<Finding["kind"]>();
  return findings.filter((f) => {
    if (f.blockIndex !== blockIndex || f.movement !== movement || seen.has(f.kind)) return false;
    seen.add(f.kind);
    return true;
  });
}
