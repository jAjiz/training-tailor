import { createHash } from "node:crypto";
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

/** Hash of everything the coach wrote for a block; position, day and color are not part of it. */
export const contentHash = (b: BlockFields): string => sha256({ ...workoutFields(b), coachingTips: b.coachingTips });

/** Like contentHash without the coaching tips: what an athlete's tailoring depends on. */
export const workoutHash = (b: BlockFields): string => sha256(workoutFields(b));

/** The text the engine reads for a block. Barbell loads stay in percent: kg depends on the athlete. */
export function blockAnalysisText(b: BlockFields, locale: string): string {
  const lines = b.kind === "barbell"
    ? [b.title ?? b.movement, ...describeSets((b.sets ?? []) as BarbellSet[], null, locale), b.instructions]
    : [
      b.title, b.description, b.scoring !== null && b.scoring !== "none" ? `Scoring: ${b.scoring}` : null,
      b.timeCapSeconds !== null ? `Time cap: ${Math.round(b.timeCapSeconds / 60)} min` : null,
    ];
  return lines.filter((l): l is string => !!l).join("\n");
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
