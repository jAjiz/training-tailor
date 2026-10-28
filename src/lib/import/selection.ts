import type { ImportItem } from "@/lib/training/services/blocks";
import type { ImportPreview } from "./translate";

/** One translated block: `"w:d:i"`, PDF week position, weekday (0 = Monday) and position in that day. */
export type BlockKey = string;

type WeekTarget = { weekIndex: number; maxWeek: number | null };

export const blockKey = (w: number, day: number, i: number): BlockKey => `${w}:${day}:${i}`;

/** The keys of PDF week `w`'s blocks. */
export function weekKeys(preview: ImportPreview, w: number): BlockKey[] {
  return preview.weeks[w].days.flatMap(({ day, blocks }) => blocks.map((_, i) => blockKey(w, day, i)));
}

export function allKeys(preview: ImportPreview): Set<BlockKey> {
  return new Set(preview.weeks.flatMap((_, w) => weekKeys(preview, w)));
}

/** PDF week `w` (0-based) lands `w` weeks after the week open in the planner. */
export function targetWeek(ctx: { weekIndex: number }, w: number): number {
  return ctx.weekIndex + w;
}

/** False when the target week falls past a closed program's last week. */
export function isWeekImportable(ctx: WeekTarget, w: number): boolean {
  return ctx.maxWeek === null || targetWeek(ctx, w) <= ctx.maxWeek;
}

export function toggleBlock(sel: Set<BlockKey>, key: BlockKey): Set<BlockKey> {
  const next = new Set(sel);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** Selects the whole week if any of its blocks is off, else deselects it. */
export function toggleWeek(sel: Set<BlockKey>, preview: ImportPreview, w: number): Set<BlockKey> {
  const keys = weekKeys(preview, w);
  const on = keys.some((k) => !sel.has(k));
  const next = new Set(sel);
  for (const k of keys) {
    if (on) next.add(k);
    else next.delete(k);
  }
  return next;
}

/** The selected blocks of importable weeks with their planner day, in document order. */
export function selectedItems(sel: Set<BlockKey>, preview: ImportPreview, ctx: WeekTarget): ImportItem[] {
  return preview.weeks.flatMap((week, w) => !isWeekImportable(ctx, w) ? [] : week.days.flatMap(({ day, blocks }) =>
    blocks.flatMap((block, i) => sel.has(blockKey(w, day, i)) ? [{ dayIndex: targetWeek(ctx, w) * 7 + day, block }] : [])));
}
