import type { Movement } from "@/lib/domain/types";

/** What a movement's records hold: a lift (kg × reps), unbroken reps (with optional added load) or a time over a distance. */
export type RecordKind = "lift" | "reps" | "time";

export const REP_OPTIONS = [1, 2, 3, 5, 8, 10] as const;
export const DISTANCE_OPTIONS = [500, 1000, 2000, 5000, 10000] as const;
/** Equipment that loads a movement: without a barbell, a set's reps mean nothing without its weight. */
export const LOAD_EQUIPMENT = ["dumbbell", "kettlebell", "sandbag", "d_ball", "wall_ball"] as const;

export function recordKind(m: Pick<Movement, "equipment" | "patterns">): RecordKind | null {
  if (m.equipment.includes("barbell")) return "lift";
  if (m.patterns.includes("monostructural")) return "time";
  if (m.equipment.some((e) => (LOAD_EQUIPMENT as readonly string[]).includes(e))) return null;
  return "reps";
}

export function recordKindOf(name: string, movements: readonly Movement[]): RecordKind | null {
  const m = movements.find((x) => x.name === name);
  return m ? recordKind(m) : null;
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

/** The lowest time per distance, the later on a tie; shortest distance first. */
export function bestByDistance<T extends { distanceM: number; seconds: number; achievedOn: Date }>(rows: readonly T[]): T[] {
  const best = new Map<number, T>();
  for (const r of rows) {
    const b = best.get(r.distanceM);
    if (!b || r.seconds < b.seconds || (r.seconds === b.seconds && r.achievedOn > b.achievedOn)) best.set(r.distanceM, r);
  }
  return [...best.values()].sort((a, b) => a.distanceM - b.distanceM);
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

/** "500 m", "2 km". */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${metres / 1000} km`;
}
