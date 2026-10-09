import { BLOCK_COLORS, type BlockColor } from "@/lib/training/schemas";

/**
 * Block colors live in globals.css as tokens: an element carries data-color={blockColor(color)} and reads
 * --block-stripe / --block-fill / --block-ink. Unknown stored values render as neutral.
 */
export const blockColor = (color: string): BlockColor =>
  (BLOCK_COLORS as readonly string[]).includes(color) ? (color as BlockColor) : "neutral";
