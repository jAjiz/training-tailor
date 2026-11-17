import { describe, it, expect } from "vitest";
import { applyAthleteLoads, blockAnalysisText, contentHash, workoutHash, type BlockFields } from "@/lib/training/block-engine";
import type { StructuredWorkout } from "@/lib/engine/types";
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

  it("custom analysis text lists title, description, scoring and time cap", () => {
    expect(blockAnalysisText(custom, "en")).toBe("Test Couplet\n21-15-9\nTest Combo\nTest Pull\nScoring: for_time\nTime cap: 10 min");
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
