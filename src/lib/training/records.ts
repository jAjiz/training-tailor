import type { CardioTarget, RecordsCatalog } from "@/lib/domain/types";

/** What a record holds: a lift (kg × reps), unbroken reps (optional added load), unbroken metres, or a time for a target. */
export type RecordKind = "lift" | "reps" | "distance" | "time";
export type RecordTab = "lift" | "gymnastics" | "cardio";

export const REP_OPTIONS = [1, 2, 3, 5, 8, 10] as const;

/** A movement's entry in the records catalog, with the kind of record it takes. */
export type RecordEntry =
  | { tab: "lift"; kind: "lift"; movement: string }
  | { tab: "gymnastics"; kind: "reps"; movement: string; weighted: boolean }
  | { tab: "gymnastics"; kind: "distance"; movement: string }
  | { tab: "cardio"; kind: "time"; movement: string; targets: CardioTarget[] };

/** Every catalog entry, in catalog order. */
export function recordEntries(catalog: RecordsCatalog): RecordEntry[] {
  return [
    ...catalog.lift.flatMap((g) => g.entries.map((e): RecordEntry => ({ tab: "lift", kind: "lift", movement: e.movement }))),
    ...catalog.gymnastics.flatMap((g) => g.entries.map((e): RecordEntry => (e.measure === "reps"
      ? { tab: "gymnastics", kind: "reps", movement: e.movement, weighted: e.weighted }
      : { tab: "gymnastics", kind: "distance", movement: e.movement }))),
    ...catalog.cardio.flatMap((g) => g.entries.map((e): RecordEntry => ({ tab: "cardio", kind: "time", movement: e.movement, targets: e.targets }))),
  ];
}

export function findRecordEntry(catalog: RecordsCatalog, movement: string): RecordEntry | null {
  return recordEntries(catalog).find((e) => e.movement === movement) ?? null;
}

export interface RecordFields {
  kind: RecordKind;
  kg: number | null;
  reps: number | null;
  distanceM: number | null;
  calories: number | null;
  seconds: number | null;
}

/** The target a time row is for, or null when it has none. */
export function targetOf(row: { distanceM: number | null; calories: number | null }): CardioTarget | null {
  if (row.distanceM !== null) return { distanceM: row.distanceM };
  if (row.calories !== null) return { calories: row.calories };
  return null;
}

export const sameTarget = (a: CardioTarget, b: CardioTarget) =>
  ("distanceM" in a && "distanceM" in b && a.distanceM === b.distanceM)
  || ("calories" in a && "calories" in b && a.calories === b.calories);

/** Whether a stored or new row is one its catalog entry accepts: same kind, load only if weighted, a listed target. */
export function recordFits(entry: RecordEntry | null, row: RecordFields): boolean {
  if (!entry || entry.kind !== row.kind) return false;
  if (entry.kind === "reps") return entry.weighted || row.kg === null;
  if (entry.kind === "time") {
    const target = targetOf(row);
    return target !== null && entry.targets.some((t) => sameTarget(t, target));
  }
  return true;
}

/** Epley 1RM, rounded down to 0.5 kg so an estimate stays conservative. A single is itself. */
export function epley(kg: number, reps: number): number {
  if (reps <= 1) return kg;
  return Math.floor(kg * (1 + reps / 30) * 2 + 1e-9) / 2;
}

export interface LiftRow { kg: number; reps: number; achievedOn: Date }
export interface OneRm { kg: number; estimated: boolean; achievedOn: Date }

/** The highest of every real single and every Epley estimate; a real single wins a tie, then the later date. */
export function currentOneRm(rows: readonly LiftRow[]): OneRm | null {
  let best: OneRm | null = null;
  for (const r of rows) {
    const c: OneRm = { kg: epley(r.kg, r.reps), estimated: r.reps > 1, achievedOn: r.achievedOn };
    if (
      best === null || c.kg > best.kg
      || (c.kg === best.kg && best.estimated && !c.estimated)
      || (c.kg === best.kg && c.estimated === best.estimated && c.achievedOn > best.achievedOn)
    ) best = c;
  }
  return best;
}

/** The heaviest row per rep count, the later on a tie. */
export function bestByReps<T extends LiftRow>(rows: readonly T[]): Map<number, T> {
  const best = new Map<number, T>();
  for (const r of rows) {
    const b = best.get(r.reps);
    if (!b || r.kg > b.kg || (r.kg === b.kg && r.achievedOn > b.achievedOn)) best.set(r.reps, r);
  }
  return best;
}

/**
 * The one logged set worth offering as a record: among the sets at a listed rep count that beat the athlete's best at
 * that count (or are the first there), the highest Epley estimate; fewer reps on a tie.
 */
export function bestSetAbove(
  sets: readonly { kg: number; reps: number }[], rows: readonly LiftRow[],
): { reps: number; from: number | null; to: number } | null {
  const best = bestByReps(rows);
  let pick: { reps: number; from: number | null; to: number; score: number } | null = null;
  for (const s of sets) {
    if (s.kg <= 0 || !(REP_OPTIONS as readonly number[]).includes(s.reps)) continue;
    const from = best.get(s.reps)?.kg ?? null;
    if (from !== null && s.kg <= from) continue;
    const score = epley(s.kg, s.reps);
    if (!pick || score > pick.score || (score === pick.score && s.reps < pick.reps)) pick = { reps: s.reps, from, to: s.kg, score };
  }
  return pick && { reps: pick.reps, from: pick.from, to: pick.to };
}

/** The most reps per added load (null = bodyweight), the later on a tie; bodyweight first, then lighter loads. */
export function bestByLoad<T extends { reps: number; kg: number | null; achievedOn: Date }>(rows: readonly T[]): T[] {
  const best = new Map<number | null, T>();
  for (const r of rows) {
    const b = best.get(r.kg);
    if (!b || r.reps > b.reps || (r.reps === b.reps && r.achievedOn > b.achievedOn)) best.set(r.kg, r);
  }
  return [...best.values()].sort((a, b) => (a.kg ?? -1) - (b.kg ?? -1));
}

/** The lowest time per target, the later on a tie, in the order of `targets`; rows at other targets are left out. */
export function bestByTarget<T extends { distanceM: number | null; calories: number | null; seconds: number; achievedOn: Date }>(
  rows: readonly T[], targets: readonly CardioTarget[],
): T[] {
  return targets.flatMap((target) => {
    let best: T | null = null;
    for (const r of rows) {
      const t = targetOf(r);
      if (!t || !sameTarget(t, target)) continue;
      if (!best || r.seconds < best.seconds || (r.seconds === best.seconds && r.achievedOn > best.achievedOn)) best = r;
    }
    return best ? [best] : [];
  });
}

/** The longest unbroken distance, the later on a tie. */
export function bestDistance<T extends { distanceM: number; achievedOn: Date }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best || r.distanceM > best.distanceM || (r.distanceM === best.distanceM && r.achievedOn > best.achievedOn)) best = r;
  }
  return best;
}

/** "7:05" or "1:02:05". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Seconds from a typed "m:ss" or "h:mm:ss"; null for anything else or zero. */
export function parseDuration(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;
  const [, h, m, s] = match;
  if (h !== undefined && Number(m) > 59) return null;
  const total = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
  return total > 0 ? total : null;
}

/** "500 m", "2 km", "50 cal". */
export function formatTarget(target: CardioTarget): string {
  if ("calories" in target) return `${target.calories} cal`;
  return target.distanceM < 1000 ? `${target.distanceM} m` : `${target.distanceM / 1000} km`;
}

/**
 * The movement whose 1RM a block asks for and the athlete hasn't recorded: a barbell block on a catalog lift with
 * percentage sets. Null otherwise, so no link points at a movement that takes no record.
 */
export function oneRmToAdd(
  block: { kind: string; movement: string | null; sets: unknown }, catalog: RecordsCatalog, hasOneRm: (movement: string) => boolean,
): string | null {
  if (block.kind !== "barbell" || !block.movement || hasOneRm(block.movement)) return null;
  if (findRecordEntry(catalog, block.movement)?.kind !== "lift") return null;
  const sets = Array.isArray(block.sets) ? (block.sets as { percent: number | null }[]) : [];
  return sets.some((s) => s.percent !== null) ? block.movement : null;
}
