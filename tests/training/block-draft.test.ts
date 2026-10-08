import { describe, it, expect } from "vitest";
import { BlockInput, parse } from "@/lib/training/schemas";
import { draftFromBlock, draftToInput, emptyDraft } from "@/lib/training/block-draft";

describe("block drafts", () => {
  it("turns an empty custom draft into a valid input once described", () => {
    const d = { ...emptyDraft("custom"), description: "Fran", scoring: "for_time" as const, timeCapMinutes: "10" };
    expect(parse(BlockInput, draftToInput(d))).toMatchObject({ kind: "custom", timeCapSeconds: 600, title: null });
  });

  it("drops the time cap when the scoring is not for_time", () => {
    const d = { ...emptyDraft("custom"), description: "AMRAP", scoring: "amrap" as const, timeCapMinutes: "10" };
    expect(parse(BlockInput, draftToInput(d))).toMatchObject({ timeCapSeconds: null });
  });

  it("maps barbell rows to percent or kg", () => {
    const d = {
      ...emptyDraft("barbell"), movement: "Deadlift",
      sets: [{ reps: "5", mode: "percent" as const, value: "80" }, { reps: "3", mode: "kg" as const, value: "150" }],
    };
    expect(parse(BlockInput, draftToInput(d))).toMatchObject({
      sets: [{ reps: 5, percent: 80, kg: null }, { reps: 3, percent: null, kg: 150 }],
    });
  });

  it("round-trips a stored block", () => {
    const stored = {
      kind: "barbell", title: "Strength", color: "blue", coachingTips: null, videoUrl: null, description: null,
      scoring: null, timeCapSeconds: null, movement: "Deadlift", instructions: "Belt allowed",
      sets: [{ reps: 5, percent: 80, kg: null }],
    };
    expect(parse(BlockInput, draftToInput(draftFromBlock(stored)))).toMatchObject({
      kind: "barbell", title: "Strength", color: "blue", movement: "Deadlift", instructions: "Belt allowed",
      sets: [{ reps: 5, percent: 80, kg: null }],
    });
  });
});
