import type { ComponentDraft } from "./types";

export function renderComponent(c: ComponentDraft): string {
  const parts = [
    c.reps != null ? String(c.reps) : null,
    c.movement,
    c.load ? `@ ${c.load}` : null,
    c.distanceMeters != null ? `${c.distanceMeters} m` : null,
    c.calories != null ? `${c.calories} cal` : null,
    c.durationSeconds != null ? `${c.durationSeconds} s` : null,
  ].filter((p): p is string => p !== null);
  return parts.join(" ") + (c.notes ? ` (${c.notes})` : "");
}
