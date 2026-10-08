import type { BarbellSet, BlockColor, Scoring } from "./schemas";

export type DraftSet = { reps: string; mode: "percent" | "kg"; value: string };

/** The planner editor's form state: strings as typed, converted to a BlockInput on save. */
export type BlockDraft = {
  kind: "custom" | "barbell";
  title: string;
  color: BlockColor;
  coachingTips: string;
  videoUrl: string;
  description: string;
  scoring: Scoring;
  timeCapMinutes: string;
  movement: string;
  sets: DraftSet[];
  instructions: string;
};

/** The stored fields a draft is built from (a Block row or its serialized form). */
export type DraftSource = {
  kind: string; title: string | null; color: string; coachingTips: string | null; videoUrl: string | null;
  description: string | null; scoring: string | null; timeCapSeconds: number | null;
  movement: string | null; sets: unknown; instructions: string | null;
};

export function emptyDraft(kind: BlockDraft["kind"]): BlockDraft {
  return {
    kind, title: "", color: "neutral", coachingTips: "", videoUrl: "", description: "", scoring: "none",
    timeCapMinutes: "", movement: "", sets: [{ reps: "5", mode: "percent", value: "" }], instructions: "",
  };
}

export function draftFromBlock(b: DraftSource): BlockDraft {
  const sets = Array.isArray(b.sets) ? (b.sets as BarbellSet[]) : [];
  return {
    ...emptyDraft(b.kind === "barbell" ? "barbell" : "custom"),
    title: b.title ?? "",
    color: b.color as BlockColor,
    coachingTips: b.coachingTips ?? "",
    videoUrl: b.videoUrl ?? "",
    description: b.description ?? "",
    scoring: (b.scoring ?? "none") as Scoring,
    timeCapMinutes: b.timeCapSeconds ? String(b.timeCapSeconds / 60) : "",
    movement: b.movement ?? "",
    sets: sets.length
      ? sets.map((s) => ({ reps: String(s.reps), mode: s.percent !== null ? "percent" : "kg", value: String(s.percent ?? s.kg) }))
      : emptyDraft("barbell").sets,
    instructions: b.instructions ?? "",
  };
}

const toNumber = (s: string) => (s.trim() === "" ? NaN : Number(s));

/** The object sent to the block actions; the server validates it with `BlockInput`. */
export function draftToInput(d: BlockDraft): unknown {
  const common = { title: d.title, color: d.color, coachingTips: d.coachingTips, videoUrl: d.videoUrl };
  if (d.kind === "custom") {
    const minutes = toNumber(d.timeCapMinutes);
    return {
      kind: "custom", ...common, description: d.description, scoring: d.scoring,
      timeCapSeconds: d.scoring === "for_time" && Number.isFinite(minutes) ? Math.round(minutes * 60) : null,
    };
  }
  return {
    kind: "barbell", ...common, movement: d.movement, instructions: d.instructions,
    sets: d.sets.map((s) => ({
      reps: toNumber(s.reps),
      percent: s.mode === "percent" ? toNumber(s.value) : null,
      kg: s.mode === "kg" ? toNumber(s.value) : null,
    })),
  };
}
