import type { DomainData } from "@/lib/domain/repository";
import type { SiteStress } from "@/lib/domain/types";
import type {
  ComponentDraft, StimulusProfile, StructuredWorkout, TailoringDraft, TailoringResult, WorkoutDraft,
} from "@/lib/engine/types";
import { testContraindication, testDomain, testMovement } from "../helpers/library-builders";

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

const overhead: SiteStress = { site: "shoulder", mechanisms: ["overhead"], load: "high" };
const overheadBallistic: SiteStress = { site: "shoulder", mechanisms: ["overhead", "ballistic"], load: "high" };
const hangingShoulder: SiteStress = { site: "shoulder", mechanisms: ["traction"], load: "high" };

/**
 * The invented library the workouts below are written against. Test Combo is a squat plus an overhead press,
 * Test Pull and the raises hang from a bar, and the Test Hoist family is a barbell/dumbbell lift that loads the
 * shoulder overhead and ballistically.
 */
export function fixtureDomain(): DomainData {
  return testDomain({
    movements: [
      testMovement("Test Combo", {
        patterns: ["squat", "vertical_push"], equipment: ["barbell"], stresses: [overhead, { site: "knee", mechanisms: ["deep_flexion"], load: "high" }],
        substitutes: ["Test Press", "Test Goblet"],
      }),
      testMovement("Test Goblet", { patterns: ["squat"], equipment: ["kettlebell"] }),
      testMovement("Test Press", { patterns: ["vertical_push"], equipment: ["dumbbell"], stresses: [overhead] }),
      testMovement("Test Squat", { patterns: ["squat"], equipment: ["barbell"] }),
      testMovement("Test Dumbbell Squat", { patterns: ["squat"], equipment: ["dumbbell"] }),
      testMovement("Test Pull", {
        patterns: ["vertical_pull"], positions: ["hanging"], equipment: ["pullup_bar"], stresses: [hangingShoulder],
        substitutes: ["Test Row"], aliases: ["TP"],
      }),
      testMovement("Test Row", { patterns: ["horizontal_pull"], equipment: ["rings"] }),
      testMovement("Test Dumbbell Row", { patterns: ["horizontal_pull"], equipment: ["dumbbell"] }),
      testMovement("Test Hang Raise", {
        patterns: ["core"], positions: ["hanging"], equipment: ["pullup_bar"],
        stresses: [{ site: "shoulder", mechanisms: ["traction", "kipping"], load: "high" }],
        substitutes: ["Test Knee Raise", "Test Strict Raise"], aliases: ["THR"],
      }),
      testMovement("Test Strict Raise", { patterns: ["core"], positions: ["hanging"], equipment: ["pullup_bar"], stresses: [hangingShoulder] }),
      testMovement("Test Knee Raise", { patterns: ["core"], positions: ["hanging"], equipment: ["pullup_bar"] }),
      testMovement("Test Hoist", {
        patterns: ["olympic"], equipment: ["barbell"], stresses: [overheadBallistic],
        substitutes: ["Test Clean", "Test Swing", "Test Dumbbell Hoist"],
      }),
      testMovement("Test Hang Hoist", { patterns: ["olympic"], equipment: ["barbell"], stresses: [overheadBallistic] }),
      testMovement("Test Dumbbell Hoist", { patterns: ["olympic"], equipment: ["dumbbell"], stresses: [overheadBallistic], unilateral: "upper" }),
      testMovement("Test Clean", { patterns: ["olympic"], equipment: ["barbell"] }),
      testMovement("Test Swing", { patterns: ["hinge"], equipment: ["kettlebell"] }),
      testMovement("Test Crawl", { patterns: ["monostructural"] }),
      testMovement("Test Jump", { patterns: ["jump"], equipment: ["box"] }),
    ],
    contraindications: [
      testContraindication("test_shoulder", {
        label: "Test Shoulder",
        rules: [
          { site: "shoulder", mechanisms: ["overhead", "kipping"], tier: "avoid" },
          { site: "shoulder", mechanisms: ["traction"], tier: "caution" },
        ],
      }),
      testContraindication("test_knee", { label: "Test Knee", rules: [{ site: "knee", mechanisms: ["deep_flexion"], tier: "avoid" }] }),
      testContraindication("test_hand", { label: "Test Hand", rules: [{ site: "grip", mechanisms: ["traction"], tier: "caution" }] }),
      testContraindication("test_no_hanging", { label: "Test No Hanging", kind: "limitation", positionRules: [{ position: "hanging", tier: "avoid" }] }),
      testContraindication("test_condition", { label: "Test Condition", kind: "condition" }),
    ],
    conversions: {
      effort: [{
        key: "test_distance", note: "Test equivalence.",
        equivalents: [
          { movement: "Test Run", unit: "meters", male: 300, female: 300 },
          { movement: "Test Erg", unit: "meters", male: 700, female: 700 },
        ],
      }],
      implementLoad: [],
    },
  });
}

export const COUPLET_TEXT = "Test Workout\n21-15-9 for time\nTest Combo 43/30 kg\nTest Pull";

export function coupletDraft(): WorkoutDraft {
  return {
    name: "Test Workout",
    blocks: [{
      title: "Test Block", rawText: COUPLET_TEXT, day: null, format: "for_time", scheme: "21-15-9 for time",
      timeDomainMinutes: 6, coachingNotes: null, stimulus: sprint,
      components: [
        component("Test Combo", { reps: "21-15-9", load: "43/30 kg", loadKg: { male: 43, female: 30 } }),
        component("Test Pull", { reps: "21-15-9" }),
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

export const couplet = (): StructuredWorkout => resolved(coupletDraft(), COUPLET_TEXT);

export const SPLIT_TEXT = "A) Test Squat 5x3 @ 85%\n\nB) AMRAP 10 min\n10 Test Crawl\n10 Test Jump";

export function split(): StructuredWorkout {
  return resolved({
    name: null,
    blocks: [
      {
        title: "A", rawText: "A) Test Squat 5x3 @ 85%", day: null, format: "strength", scheme: "5x3 @ 85%",
        timeDomainMinutes: 15, coachingNotes: null, stimulus: heavy,
        components: [component("Test Squat", { reps: "5x3", percent1RM: 85 })],
      },
      {
        title: "B", rawText: "B) AMRAP 10 min\n10 Test Crawl\n10 Test Jump", day: null, format: "amrap", scheme: "AMRAP 10 min",
        timeDomainMinutes: 10, coachingNotes: null, stimulus: sprint,
        components: [component("Test Crawl", { reps: 10 }), component("Test Jump", { reps: 10 })],
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

export const HOIST_TEXT = "10 rounds for time:\n3 test hoist\n5 test crawl\n7 test hang raise";

/** A session where banning the hoist must leave the hanging raise alone. */
export function hoistSession(): StructuredWorkout {
  return resolved({
    name: null,
    blocks: [{
      title: null, rawText: HOIST_TEXT, day: null, format: "for_time", scheme: "10 rounds for time",
      timeDomainMinutes: 15, coachingNotes: null, stimulus: sprint,
      components: [
        component("Test Hoist", { reps: 3, load: "60/40 kg", loadKg: { male: 60, female: 40 } }),
        component("Test Crawl", { reps: 5 }),
        component("Test Hang Raise", { reps: 7 }),
      ],
    }],
  }, HOIST_TEXT);
}
