import { percentToKg } from "./barbell";
import type { BarbellSet } from "./schemas";
import type { ScoreTarget } from "./scoring";

/** The log form's state: strings as typed. */
export type LogDraft = {
  minutes: string;
  seconds: string;
  capped: boolean;
  rounds: string;
  reps: string;
  value: string;
  sets: { kg: string; reps: string }[];
};

const str = (n: unknown) => (typeof n === "number" ? String(n) : "");

export function logDraftFor(target: ScoreTarget, existing: unknown | null, prescribed: BarbellSet[], oneRm: number | null): LogDraft {
  const s = (existing ?? {}) as Record<string, number> & { capped?: boolean; sets?: { kg: number; reps: number }[] };
  const draft: LogDraft = { minutes: "", seconds: "", capped: false, rounds: "", reps: "", value: "", sets: [] };
  if (target.kind === "barbell") {
    draft.sets = s.sets
      ? s.sets.map((x) => ({ kg: String(x.kg), reps: String(x.reps) }))
      : prescribed.map((p) => ({
        kg: p.kg !== null ? String(p.kg) : p.percent !== null && oneRm !== null ? String(percentToKg(p.percent, oneRm)) : "",
        reps: String(p.reps),
      }));
    return draft;
  }
  if (typeof s.seconds === "number") {
    draft.minutes = String(Math.floor(s.seconds / 60));
    draft.seconds = String(s.seconds % 60);
  }
  draft.capped = s.capped === true;
  draft.rounds = str(s.rounds);
  draft.reps = str(s.reps);
  draft.value = str(s.kg ?? s.calories ?? s.meters ?? (target.scoring === "reps" ? s.reps : undefined));
  return draft;
}

/** Parses a typed non-negative decimal, accepting a comma as the separator; anything else (empty, "1e3", "0x10") is NaN. */
export function parseDecimal(v: string): number {
  const t = v.trim();
  return /^\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN;
}

/** Parses a typed whole number; anything else (empty, "12,5", "1e3") is NaN. */
export function parseInteger(v: string): number {
  const t = v.trim();
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

const int = parseInteger;
const dec = parseDecimal;
const part = (v: string) => (v.trim() === "" ? 0 : parseInteger(v));

/** True when a typed field did not parse: the form says so before the server rejects the score. */
export function hasInvalidNumber(score: unknown): boolean {
  if (typeof score === "number") return !Number.isFinite(score);
  if (Array.isArray(score)) return score.some(hasInvalidNumber);
  if (score && typeof score === "object") return Object.values(score).some(hasInvalidNumber);
  return false;
}

/** The raw score sent to the server, which validates it with `evaluateScore`. */
export function buildScore(target: ScoreTarget, d: LogDraft): unknown {
  if (target.kind === "barbell") return { sets: d.sets.map((x) => ({ kg: dec(x.kg), reps: int(x.reps) })) };
  const seconds = part(d.minutes) * 60 + part(d.seconds);
  switch (target.scoring) {
    case "for_time": return d.capped ? { capped: true, reps: int(d.reps) } : { seconds };
    case "max_time": return { seconds };
    case "amrap": return { rounds: int(d.rounds), reps: part(d.reps) };
    case "reps": return { reps: int(d.value) };
    case "load": return { kg: dec(d.value) };
    case "calories": return { calories: int(d.value) };
    case "distance": return { meters: dec(d.value) };
    case "none": return {};
  }
}
