"use client";

import type { ComponentDraft, ManualBlock, ManualWorkout } from "@/lib/engine/types";

export const emptyComponent = (): ComponentDraft => ({
  movement: "", reps: null, load: null, loadKg: null, percent1RM: null,
  distanceMeters: null, calories: null, durationSeconds: null, notes: null,
});
export const emptyBlock = (): ManualBlock => ({
  title: null, format: "for_time", scheme: null, timeDomainMinutes: null, coachingNotes: null, components: [emptyComponent()],
});
export const emptyManualWorkout = (): ManualWorkout => ({ name: null, blocks: [emptyBlock()] });

interface Props {
  value: ManualWorkout;
  onChange: (w: ManualWorkout) => void;
  movementNames: string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until U5
export function ManualEntryForm(_props: Props) {
  return <p className="text-sm text-neutral-600">Manual entry is coming in the next step.</p>;
}
