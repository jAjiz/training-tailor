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

const int = (v: string) => (v.trim() === "" ? NaN : Number(v));
const part = (v: string) => (v.trim() === "" ? 0 : Number(v));

/** The raw score sent to the server, which validates it with `evaluateScore`. */
export function buildScore(target: ScoreTarget, d: LogDraft): unknown {
  if (target.kind === "barbell") return { sets: d.sets.map((x) => ({ kg: int(x.kg), reps: int(x.reps) })) };
  const seconds = part(d.minutes) * 60 + part(d.seconds);
  switch (target.scoring) {
    case "for_time": return d.capped ? { capped: true, reps: int(d.reps) } : { seconds };
    case "max_time": return { seconds };
    case "amrap": return { rounds: int(d.rounds), reps: part(d.reps) };
    case "reps": return { reps: int(d.value) };
    case "load": return { kg: int(d.value) };
    case "calories": return { calories: int(d.value) };
    case "distance": return { meters: int(d.value) };
    case "none": return {};
  }
}
