import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  applyAthleteLoads, blockAnalysisText, blockMetadata, contentHash, lockedFormatsFor, workoutHash, type BlockFields,
} from "@/lib/training/block-engine";
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
    expect(blockMetadata(barbell)).toEqual({ title: "Test Strength", scoring: null, timeCapMinutes: null });
  });

  it("custom analysis text is what the coach wrote, with no internal labels", () => {
    const text = blockAnalysisText(custom, "en");
    expect(text).toBe("21-15-9\nTest Combo\nTest Pull");
    expect(text).not.toMatch(/Scoring:|Time cap:/);
  });
});

describe("blockMetadata", () => {
  it("carries title, scoring and time cap for the analysis", () => {
    expect(blockMetadata(custom)).toEqual({ title: "Test Couplet", scoring: "for_time", timeCapMinutes: 10 });
  });

  it("leaves out a scoring of none and a missing cap", () => {
    expect(blockMetadata({ ...custom, title: null, scoring: "none", timeCapSeconds: null }))
      .toEqual({ title: null, scoring: null, timeCapMinutes: null });
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
