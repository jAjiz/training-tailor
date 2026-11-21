import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  applyAthleteLoads, blockAnalysisText, blockMetadata, contentHash, lockedFormatsFor, withBarbellText, workoutHash, type BlockFields,
} from "@/lib/training/block-engine";
import type { StructuredWorkout, TailoringResult, WorkoutComponent } from "@/lib/engine/types";
import { component, coupletDraft } from "../fixtures/workouts";

const custom: BlockFields = {
  kind: "custom", title: "Test Couplet", description: "21-15-9\nTest Combo\nTest Pull", scoring: "for_time",
  timeCapSeconds: 600, movement: null, sets: null, instructions: null, coachingTips: "Stay smooth",
};

const workoutWith = (percent1RM: number | null, canonical: string | null): StructuredWorkout => ({
  name: null, rawText: "x", source: "paste",
  blocks: [{ ...coupletDraft().blocks[0], components: [{ ...component("Test Squat", { percent1RM }), canonical }] }],
});

describe("block hashes", () => {
  it("moving a block keeps both hashes", () => {
    const moved = { ...custom, position: 3, dayIndex: 2, color: "red" } as BlockFields;
    expect(contentHash(moved)).toBe(contentHash(custom));
    expect(workoutHash(moved)).toBe(workoutHash(custom));
  });

  it("editing tips changes contentHash but not workoutHash", () => {
    const edited = { ...custom, coachingTips: "Go hard" };
    expect(contentHash(edited)).not.toBe(contentHash(custom));
    expect(workoutHash(edited)).toBe(workoutHash(custom));
  });

  // The fields of a block that an athlete's tailoring depends on, in the order the hashes have always used.
  const workoutPayload = (b: BlockFields) => ({
    kind: b.kind, title: b.title, description: b.description, scoring: b.scoring, timeCapSeconds: b.timeCapSeconds,
    movement: b.movement, sets: b.sets ?? null, instructions: b.instructions,
  });
  const sha256 = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

  it("workoutHash keeps its format, so accepted adaptations never go stale on an analysis change", () => {
    expect(workoutHash(custom)).toBe(sha256(workoutPayload(custom)));
  });

  it("contentHash carries the analysis format, so analyses stored with the old session text are redone", () => {
    expect(contentHash(custom)).not.toBe(sha256({ ...workoutPayload(custom), coachingTips: custom.coachingTips }));
  });

  it("editing the description changes both", () => {
    const edited = { ...custom, description: "10 rounds" };
    expect(contentHash(edited)).not.toBe(contentHash(custom));
    expect(workoutHash(edited)).not.toBe(workoutHash(custom));
  });
});

describe("blockAnalysisText", () => {
  it("barbell analysis text uses percents, never kg", () => {
    const text = blockAnalysisText({
      ...custom, kind: "barbell", title: null, description: null, scoring: null, timeCapSeconds: null,
      movement: "Test Squat", sets: [{ reps: 5, percent: 80, kg: null }], instructions: "Belt optional",
    }, "en");
    expect(text).toMatch(/80 ?%/);
    expect(text).not.toContain("kg");
    expect(text.split("\n")[0]).toBe("Test Squat");
  });

  it("barbell analysis text leaves the title to the metadata", () => {
    const barbell = {
      ...custom, kind: "barbell", title: "Test Strength", description: null, scoring: null, timeCapSeconds: null,
      movement: "Test Squat", sets: [{ reps: 5, percent: 80, kg: null }], instructions: null,
    };
    expect(blockAnalysisText(barbell, "en")).not.toContain("Test Strength");
    expect(blockMetadata(barbell)).toEqual({ title: "Test Strength", scoring: null, timeCapMinutes: null, coachingTips: "Stay smooth" });
  });

  it("custom analysis text is what the coach wrote, with no internal labels", () => {
    const text = blockAnalysisText(custom, "en");
    expect(text).toBe("21-15-9\nTest Combo\nTest Pull");
    expect(text).not.toMatch(/Scoring:|Time cap:/);
  });
});

describe("blockMetadata", () => {
  it("carries title, scoring, time cap and coaching tips for the analysis", () => {
    expect(blockMetadata(custom)).toEqual({ title: "Test Couplet", scoring: "for_time", timeCapMinutes: 10, coachingTips: "Stay smooth" });
  });

  it("reads blank tips as none", () => {
    expect(blockMetadata({ ...custom, coachingTips: "  \n " }).coachingTips).toBeNull();
  });

  it("leaves out a scoring of none and a missing cap", () => {
    expect(blockMetadata({ ...custom, title: null, scoring: "none", timeCapSeconds: null }))
      .toEqual({ title: null, scoring: null, timeCapMinutes: null, coachingTips: "Stay smooth" });
  });
});

describe("applyAthleteLoads", () => {
  it("fills both sex slots from the 1RM", () => {
    const out = applyAthleteLoads(workoutWith(80, "Test Squat"), new Map([["Test Squat", 100]]));
    expect(out.blocks[0].components[0].loadKg).toEqual({ male: 80, female: 80 });
  });

  it("leaves loadKg null without a 1RM", () => {
    const out = applyAthleteLoads(workoutWith(80, "Test Squat"), new Map());
    expect(out.blocks[0].components[0].loadKg).toBeNull();
  });
});

describe("lockedFormatsFor", () => {
  it("locks the formats whose score depends on them", () => {
    expect(lockedFormatsFor("for_time")).toEqual(["for_time"]);
    expect(lockedFormatsFor("amrap")).toEqual(["amrap"]);
    expect(lockedFormatsFor("load")).toBeNull();
    expect(lockedFormatsFor(null)).toBeNull();
  });
});

describe("withBarbellText", () => {
  const tailoredWith = (components: WorkoutComponent[], scheme: string | null = null): TailoringResult => ({
    name: null, rawText: "Test Goblet 5 @ 80 %", droppedBlocks: [], changes: [], rationale: "r", safetyNote: null,
    blocks: [{
      ...coupletDraft().blocks[0], rawText: "Test Goblet 5 @ 80 %", format: "strength", scheme, sourceBlocks: [0], components,
    }],
  });
  const comp = (movement: string, extra: Partial<WorkoutComponent> = {}): WorkoutComponent =>
    ({ ...component(movement), canonical: movement, ...extra });

  it("writes a replaced lift in kg from its data, never the model's percentage", () => {
    const out = withBarbellText(tailoredWith([comp("Test Goblet", { reps: 5, load: "80 %", loadKg: { male: 20, female: 20 } })]), null, "en");
    expect(out.rawText).toBe("Test Goblet: 5 @ 20 kg");
    expect(out.blocks[0].rawText).toBe(out.rawText);
  });

  it("keeps a kept lift's percentage with the athlete's kg, in the locale's decimals", () => {
    const out = withBarbellText(tailoredWith([comp("Test Squat", { reps: 5, percent1RM: 80, loadKg: { male: 83.5, female: 83.5 } })]), "male", "es");
    expect(out.rawText).toBe("Test Squat: 5 @ 80 % (83,5 kg)");
  });

  it("picks the athlete's sex load, or both when the sex is unknown", () => {
    const loads = [comp("Test Goblet", { reps: 8, loadKg: { male: 24, female: 16 } })];
    expect(withBarbellText(tailoredWith(loads), "female", "en").rawText).toBe("Test Goblet: 8 @ 16 kg");
    expect(withBarbellText(tailoredWith(loads), null, "en").rawText).toBe("Test Goblet: 8 @ 24/16 kg");
  });

  it("puts the scheme first and leaves out a load the data does not give", () => {
    const out = withBarbellText(tailoredWith([comp("Test Goblet", { reps: "5-3-1" }), comp("Test Crawl", { distanceMeters: 20 })], "3 rounds"), null, "en");
    expect(out.rawText).toBe("3 rounds\nTest Goblet: 5-3-1\nTest Crawl: 20 m");
  });

  it("leaves out a scheme that carries a percentage", () => {
    const out = withBarbellText(tailoredWith([comp("Test Goblet", { reps: 5, loadKg: { male: 20, female: 20 } })], "5 × 5 @ 70 %"), null, "en");
    expect(out.rawText).toBe("Test Goblet: 5 @ 20 kg");
  });
});
