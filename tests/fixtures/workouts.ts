import type {
  ComponentDraft, StimulusProfile, StructuredWorkout, TailoringDraft, TailoringResult, WorkoutDraft,
} from "@/lib/engine/types";

export const component = (movement: string, extra: Partial<ComponentDraft> = {}): ComponentDraft => ({
  movement, reps: null, load: null, loadKg: null, percent1RM: null,
  distanceMeters: null, calories: null, durationSeconds: null, notes: null, ...extra,
});

export const sprint: StimulusProfile = {
  quality: "conditioning", energySystem: "glycolytic", loadIntensity: "moderate", rationale: "Short couplet near redline.",
};
export const heavy: StimulusProfile = {
  quality: "strength", energySystem: "phosphagen", loadIntensity: "heavy", rationale: "Heavy low-rep sets.",
};

export const FRAN_TEXT = "Fran\n21-15-9 for time\nThrusters 43/30 kg\nPull-ups";

export function franDraft(): WorkoutDraft {
  return {
    name: "Fran",
    blocks: [{
      title: "Fran", rawText: FRAN_TEXT, day: null, format: "for_time", scheme: "21-15-9 for time",
      timeDomainMinutes: 6, coachingNotes: null, stimulus: sprint,
      components: [
        component("Thruster", { reps: "21-15-9", load: "43/30 kg", loadKg: { male: 43, female: 30 } }),
        component("Pull-up", { reps: "21-15-9" }),
      ],
    }],
  };
}

function resolved(draft: WorkoutDraft, rawText: string): StructuredWorkout {
  return {
    name: draft.name, rawText, source: "paste",
    blocks: draft.blocks.map((b) => ({ ...b, components: b.components.map((c) => ({ ...c, canonical: c.movement })) })),
  };
}

export const fran = (): StructuredWorkout => resolved(franDraft(), FRAN_TEXT);

export const SPLIT_TEXT = "A) Back Squat 5x3 @ 85%\n\nB) AMRAP 10 min\n10 Burpees\n10 Box Jumps";

export function split(): StructuredWorkout {
  return resolved({
    name: null,
    blocks: [
      {
        title: "A", rawText: "A) Back Squat 5x3 @ 85%", day: null, format: "strength", scheme: "5x3 @ 85%",
        timeDomainMinutes: 15, coachingNotes: null, stimulus: heavy,
        components: [component("Back Squat", { reps: "5x3", percent1RM: 85 })],
      },
      {
        title: "B", rawText: "B) AMRAP 10 min\n10 Burpees\n10 Box Jumps", day: null, format: "amrap", scheme: "AMRAP 10 min",
        timeDomainMinutes: 10, coachingNotes: null, stimulus: sprint,
        components: [component("Burpee", { reps: 10 }), component("Box Jump", { reps: 10 })],
      },
    ],
  }, SPLIT_TEXT);
}

/** The identity modification of `workout`, as the model would return it (no canonical names). */
export function toTailoringDraft(workout: StructuredWorkout, overrides: Partial<TailoringDraft> = {}): TailoringDraft {
  return {
    name: workout.name, rawText: workout.rawText, droppedBlocks: [], changes: [],
    rationale: "No change needed.", safetyNote: null,
    blocks: workout.blocks.map((b, i) => ({
      ...b,
      sourceBlocks: [i],
      components: b.components.map((c): ComponentDraft => {
        const { canonical, ...draft } = c;
        void canonical;
        return draft;
      }),
    })),
    ...overrides,
  };
}

/** The identity modification of `workout` after code resolution (canonical names kept). */
export function identityResult(workout: StructuredWorkout): TailoringResult {
  return {
    name: workout.name, rawText: workout.rawText, droppedBlocks: [], changes: [],
    rationale: "No change needed.", safetyNote: null,
    blocks: workout.blocks.map((b, i) => ({ ...b, sourceBlocks: [i] })),
  };
}
