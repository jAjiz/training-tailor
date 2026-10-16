import { z } from "zod";
import type { Scoring } from "./schemas";

const Count = z.number().int().min(0).max(100_000);
const Duration = z.number().int().min(1).max(86_400);

export const BarbellResultSchema = z.object({
  sets: z.array(z.object({ kg: z.number().min(0).max(500), reps: z.number().int().min(0).max(100) }).strict()).min(1).max(20),
}).strict();
export type BarbellResult = z.output<typeof BarbellResultSchema>;

const ForTime = z.union([
  z.object({ seconds: Duration }).strict(),
  z.object({ capped: z.literal(true), reps: Count }).strict(),
]);
const Amrap = z.object({ rounds: Count, reps: z.number().int().min(0).max(9_999) }).strict();
const Reps = z.object({ reps: Count }).strict();
const Load = z.object({ kg: z.number().min(0).max(1_000) }).strict();
const Calories = z.object({ calories: Count }).strict();
const Distance = z.object({ meters: z.number().min(0).max(1_000_000) }).strict();
const MaxTime = z.object({ seconds: Duration }).strict();

export type ScoreTarget = { kind: "custom"; scoring: Scoring; timeCapSeconds: number | null } | { kind: "barbell" };
export type EvaluatedScore = { score: object; sortKey: number | null; capped: boolean };

export function scoreTarget(block: { kind: string; scoring: string | null; timeCapSeconds: number | null }): ScoreTarget {
  return block.kind === "barbell"
    ? { kind: "barbell" }
    : { kind: "custom", scoring: (block.scoring ?? "none") as Scoring, timeCapSeconds: block.timeCapSeconds };
}

function single<T extends object>(schema: z.ZodType<T>, raw: unknown, key: (s: T) => number): EvaluatedScore | null {
  const r = schema.safeParse(raw);
  return r.success ? { score: r.data, sortKey: key(r.data), capped: false } : null;
}

/** Validates a score against its block and computes its rank key (higher is better). */
export function evaluateScore(target: ScoreTarget, raw: unknown): EvaluatedScore | null {
  if (target.kind === "barbell") {
    const r = BarbellResultSchema.safeParse(raw);
    return r.success ? { score: r.data, sortKey: null, capped: false } : null;
  }
  switch (target.scoring) {
    case "for_time": {
      const r = ForTime.safeParse(raw);
      if (!r.success) return null;
      if ("capped" in r.data) {
        return target.timeCapSeconds === null ? null : { score: r.data, sortKey: r.data.reps, capped: true };
      }
      if (target.timeCapSeconds !== null && r.data.seconds > target.timeCapSeconds) return null;
      return { score: r.data, sortKey: -r.data.seconds, capped: false };
    }
    case "amrap": return single(Amrap, raw, (s) => s.rounds * 10_000 + s.reps);
    case "reps": return single(Reps, raw, (s) => s.reps);
    case "load": return single(Load, raw, (s) => s.kg);
    case "calories": return single(Calories, raw, (s) => s.calories);
    case "distance": return single(Distance, raw, (s) => s.meters);
    case "max_time": return single(MaxTime, raw, (s) => s.seconds);
    case "none": return null;
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** Language-neutral score text ("9:32", "5 + 12", "CAP · 87", "100 kg"). */
export function formatScore(target: ScoreTarget, score: unknown): string {
  const s = score as Record<string, number> & { sets?: { kg: number; reps: number }[]; capped?: boolean };
  if (target.kind === "barbell") return (s.sets ?? []).map((x) => `${x.reps}×${num(x.kg)} kg`).join(" · ");
  switch (target.scoring) {
    case "for_time": return s.capped ? `CAP · ${s.reps}` : formatDuration(s.seconds);
    case "amrap": return `${s.rounds} + ${s.reps}`;
    case "reps": return String(s.reps);
    case "load": return `${num(s.kg)} kg`;
    case "calories": return `${s.calories} cal`;
    case "distance": return `${num(s.meters)} m`;
    case "max_time": return formatDuration(s.seconds);
    case "none": return "";
  }
}
