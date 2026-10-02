import type { ComponentDraft, ManualBlock, ManualWorkout } from "./types";

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

export function renderBlock(b: Pick<ManualBlock, "title" | "scheme" | "components" | "coachingNotes"> & { format?: string }): string {
  const lines = [b.title, b.scheme, ...b.components.map(renderComponent), b.coachingNotes]
    .filter((l): l is string => !!l && l.trim().length > 0);
  return lines.length > 0 ? lines.join("\n") : `(${b.format ?? "block"})`;
}

export function renderManualWorkout(w: ManualWorkout): string {
  return [w.name, ...w.blocks.map(renderBlock)].filter((p): p is string => !!p).join("\n\n");
}
