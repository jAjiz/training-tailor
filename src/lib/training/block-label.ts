type LabelBlock = { title: string | null; movement: string | null; kind: string; scoring: string | null };

/** Display label for a block: title, movement, scoring label, else kind label (blocks may be untitled). */
export function blockLabel(b: LabelBlock, t: (key: string) => string): string {
  if (b.title) return b.title;
  if (b.movement) return b.movement;
  if (b.scoring && b.scoring !== "none") return t(`block.scoring.${b.scoring}`);
  return t(`editor.kinds.${b.kind}`);
}
