import { createHash } from "node:crypto";
import type { BlockMetadata } from "@/lib/engine/analyze";
import type { BlockFormat, StructuredWorkout, TailoredBlock, TailoringResult, WorkoutComponent } from "@/lib/engine/types";
import { formatDecimal } from "@/lib/format";
import { describeSets, percentToKg } from "./barbell";
import type { BarbellSet } from "./schemas";

export interface BlockFields {
  kind: string;
  title: string | null;
  description: string | null;
  scoring: string | null;
  timeCapSeconds: number | null;
  movement: string | null;
  sets: unknown;
  instructions: string | null;
  coachingTips: string | null;
}

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function workoutFields(b: BlockFields) {
  return {
    kind: b.kind, title: b.title, description: b.description, scoring: b.scoring, timeCapSeconds: b.timeCapSeconds,
    movement: b.movement, sets: b.sets ?? null, instructions: b.instructions,
  };
}

/**
 * The version of what a block analysis is read from (blockAnalysisText, blockMetadata and the prompt around them).
 * Bump it when that changes so stored analyses are redone. It is part of contentHash only, never of workoutHash: an
 * accepted adaptation must not go stale because the analysis input changed.
 * 2: title, scoring and time cap moved out of the analyzed text into the coach metadata.
 * 3: coaching tips in the coach metadata.
 */
const ANALYSIS_FORMAT_VERSION = 3;

/** Hash of everything the coach wrote for a block, plus the analysis format; position, day and color are not part of it. */
export const contentHash = (b: BlockFields): string =>
  sha256({ ...workoutFields(b), coachingTips: b.coachingTips, analysisFormat: ANALYSIS_FORMAT_VERSION });

/** What an athlete's tailoring depends on: the coach's workout, without the tips or the analysis format. */
export const workoutHash = (b: BlockFields): string => sha256(workoutFields(b));

/**
 * The text the engine reads for a block: only what the coach wrote, since the analysis keeps verbatim slices of it and
 * the adapted text starts from them. Barbell loads stay in percent: kg depends on the athlete.
 */
export function blockAnalysisText(b: BlockFields, locale: string): string {
  const lines = b.kind === "barbell"
    ? [b.movement, ...describeSets((b.sets ?? []) as BarbellSet[], null, locale), b.instructions]
    : [b.description];
  return lines.filter((l): l is string => !!l).join("\n");
}

/** Title, scoring, time cap and tips: context for the analysis (format, time domain, stimulus), never part of the analyzed text. */
export function blockMetadata(b: BlockFields): BlockMetadata {
  return {
    title: b.title,
    scoring: b.scoring !== null && b.scoring !== "none" ? b.scoring : null,
    timeCapMinutes: b.timeCapSeconds !== null ? Math.round(b.timeCapSeconds / 60) : null,
    coachingTips: b.coachingTips?.trim() || null,
  };
}

/** The formats an adaptation must keep so the block's scoring still applies; null when any format fits. */
export function lockedFormatsFor(scoring: string | null): BlockFormat[] | null {
  if (scoring === "for_time") return ["for_time"];
  if (scoring === "amrap") return ["amrap"];
  return null;
}

/** Fills each percentage component's loadKg from the athlete's 1RMs, keyed by canonical movement name. */
export function applyAthleteLoads<W extends { blocks: { components: WorkoutComponent[] }[] }>(workout: W, oneRms: Map<string, number>): W {
  return {
    ...workout,
    blocks: workout.blocks.map((b) => ({
      ...b,
      components: b.components.map((c) => {
        const oneRm = c.canonical !== null ? oneRms.get(c.canonical) : undefined;
        if (c.percent1RM === null || oneRm === undefined) return c;
        const kg = percentToKg(c.percent1RM, oneRm);
        return { ...c, loadKg: { male: kg, female: kg } };
      }),
    })),
  };
}

type Sex = "male" | "female";

function componentLine(c: WorkoutComponent, sex: Sex | null, locale: string): string {
  const num = (n: number) => formatDecimal(n, locale);
  const { male, female } = c.loadKg ?? { male: null, female: null };
  const kg = sex !== null ? (sex === "male" ? male : female)
    : male !== null && female !== null && male !== female ? null : male ?? female;
  const kgText = kg !== null ? `${num(kg)} kg` : male !== null && female !== null ? `${num(male)}/${num(female)} kg` : null;
  const load = c.percent1RM !== null ? `${num(c.percent1RM)} %${kg !== null ? ` (${num(kg)} kg)` : ""}` : kgText;
  const amount = [
    c.reps !== null ? String(c.reps) : null,
    c.distanceMeters !== null ? `${num(c.distanceMeters)} m` : null,
    c.calories !== null ? `${num(c.calories)} cal` : null,
    c.durationSeconds !== null ? `${num(c.durationSeconds)} s` : null,
  ].filter((p): p is string => p !== null).join(" · ");
  const detail = [amount || null, load !== null ? `@ ${load}` : null].filter(Boolean).join(" ");
  return detail ? `${c.canonical ?? c.movement}: ${detail}` : (c.canonical ?? c.movement);
}

const blockText = (b: TailoredBlock, sex: Sex | null, locale: string) =>
  [b.scheme?.includes("%") ? null : b.scheme, ...b.components.map((c) => componentLine(c, sex, locale))].filter((l): l is string => !!l).join("\n");

/**
 * A barbell block's adapted text, written from the tailored data instead of the model's prose: the prose can keep a
 * percentage of 1RM that no longer applies (a lift replaced by dumbbells). Loads come from loadKg for the athlete's sex,
 * and a percentage only where the data kept one; the free-text load, the notes and a scheme with a percentage are left
 * out for the same reason.
 */
export function withBarbellText(tailored: TailoringResult, sex: Sex | null, locale: string): TailoringResult {
  const blocks = tailored.blocks.map((b) => ({ ...b, rawText: blockText(b, sex, locale) || b.rawText }));
  return { ...tailored, blocks, rawText: blocks.map((b) => b.rawText).join("\n\n") };
}
