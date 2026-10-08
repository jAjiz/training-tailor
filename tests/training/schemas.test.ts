import { describe, it, expect } from "vitest";
import { ERROR_CODES, TrainingError } from "@/lib/training/errors";
import {
  AthleteSettingsInput, BlockInput, ProgramCreateInput, ProgramUpdateInput, parse,
} from "@/lib/training/schemas";

describe("ProgramCreateInput", () => {
  it("accepts a continuous program starting on a Monday", () => {
    const v = parse(ProgramCreateInput, { kind: "continuous", name: " Daily RX ", description: "", startDate: "2026-10-05" });
    expect(v).toEqual({ kind: "continuous", name: "Daily RX", description: null, startDate: "2026-10-05" });
  });

  it("rejects a continuous program that does not start on a Monday", () => {
    expect(() => parse(ProgramCreateInput, { kind: "continuous", name: "Daily", description: null, startDate: "2026-10-07" }))
      .toThrow(TrainingError);
  });

  it("accepts a closed program of 1 to 52 weeks", () => {
    expect(parse(ProgramCreateInput, { kind: "closed", name: "Cycle", description: null, weeks: 8 }).kind).toBe("closed");
    expect(() => parse(ProgramCreateInput, { kind: "closed", name: "Cycle", description: null, weeks: 53 })).toThrow();
  });

  it("allows partial date/length changes on update", () => {
    expect(parse(ProgramUpdateInput, { name: "X", description: null })).toEqual({ name: "X", description: null });
  });
});

describe("BlockInput", () => {
  const common = { title: "", color: "red", coachingTips: "", videoUrl: "" };

  it("normalizes blank optional text to null", () => {
    const v = parse(BlockInput, { kind: "custom", ...common, description: "AMRAP 12", scoring: "amrap", timeCapSeconds: null });
    expect(v).toMatchObject({ title: null, coachingTips: null, videoUrl: null });
  });

  it("only allows a time cap on for_time blocks", () => {
    expect(() => parse(BlockInput, { kind: "custom", ...common, description: "x", scoring: "amrap", timeCapSeconds: 600 })).toThrow();
    expect(parse(BlockInput, { kind: "custom", ...common, description: "x", scoring: "for_time", timeCapSeconds: 600 }))
      .toMatchObject({ timeCapSeconds: 600 });
  });

  it("accepts only https video links", () => {
    expect(() => parse(BlockInput, { kind: "custom", ...common, videoUrl: "http://x.com/v", description: "x", scoring: "none", timeCapSeconds: null })).toThrow();
    expect(parse(BlockInput, { kind: "custom", ...common, videoUrl: "https://youtu.be/abc", description: "x", scoring: "none", timeCapSeconds: null }))
      .toMatchObject({ videoUrl: "https://youtu.be/abc" });
  });

  it("requires exactly one of percent or kg per barbell set", () => {
    const base = { kind: "barbell", ...common, movement: "Back Squat", instructions: "" };
    expect(parse(BlockInput, { ...base, sets: [{ reps: 5, percent: 80, kg: null }] }).kind).toBe("barbell");
    expect(() => parse(BlockInput, { ...base, sets: [{ reps: 5, percent: 80, kg: 100 }] })).toThrow();
    expect(() => parse(BlockInput, { ...base, sets: [{ reps: 5, percent: null, kg: null }] })).toThrow();
    expect(() => parse(BlockInput, { ...base, sets: [] })).toThrow();
  });

  it("rejects unknown colors", () => {
    expect(() => parse(BlockInput, { kind: "custom", ...common, color: "pink", description: "x", scoring: "none", timeCapSeconds: null })).toThrow();
  });
});

describe("AthleteSettingsInput", () => {
  it("validates the time zone and the locale", () => {
    expect(parse(AthleteSettingsInput, { displayName: "Ana", timezone: "Europe/Madrid", locale: "es" }).locale).toBe("es");
    expect(() => parse(AthleteSettingsInput, { displayName: "Ana", timezone: "Mars/Base", locale: "es" })).toThrow();
    expect(() => parse(AthleteSettingsInput, { displayName: "Ana", timezone: "Europe/Madrid", locale: "fr" })).toThrow();
  });
});

describe("parse", () => {
  it("throws invalid_request", () => {
    try {
      parse(AthleteSettingsInput, null);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TrainingError);
      expect((e as TrainingError).code).toBe("invalid_request");
    }
  });

  it("knows every error code once", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
