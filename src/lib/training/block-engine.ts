import { createHash } from "node:crypto";
import type { BlockMetadata } from "@/lib/engine/analyze";
import type { BlockFormat, StructuredWorkout } from "@/lib/engine/types";
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
 */
const ANALYSIS_FORMAT_VERSION = 2;

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

/** Title, scoring and time cap: context for the analysis (format, time domain), never part of the analyzed text. */
export function blockMetadata(b: BlockFields): BlockMetadata {
  return {
    title: b.title,
    scoring: b.scoring !== null && b.scoring !== "none" ? b.scoring : null,
    timeCapMinutes: b.timeCapSeconds !== null ? Math.round(b.timeCapSeconds / 60) : null,
  };
}

/** The formats an adaptation must keep so the block's scoring still applies; null when any format fits. */
export function lockedFormatsFor(scoring: string | null): BlockFormat[] | null {
  if (scoring === "for_time") return ["for_time"];
  if (scoring === "amrap") return ["amrap"];
  return null;
}

/** Fills each percentage component's loadKg from the athlete's 1RMs, keyed by canonical movement name. */
export function applyAthleteLoads(workout: StructuredWorkout, oneRms: Map<string, number>): StructuredWorkout {
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
