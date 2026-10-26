import { describe, it, expect, vi } from "vitest";
import { emptyProfile, type AthleteProfile } from "@/lib/engine/types";
import { normalizeProfile, sanitizeProfile } from "@/lib/profile";
import { fixtureDomain } from "../fixtures/workouts";

const domain = fixtureDomain();

describe("normalizeProfile", () => {
  it("returns an empty profile for a new athlete", () => {
    expect(normalizeProfile(null)).toEqual(emptyProfile());
  });

  it("passes a valid stored profile through", () => {
    const p: AthleteProfile = { ...emptyProfile(), sex: "male", equipment: ["barbell"] };
    expect(normalizeProfile(p)).toEqual(p);
  });

  it("falls back to an empty profile when the stored document is invalid", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(normalizeProfile({ injuries: "nope" })).toEqual(emptyProfile());
    spy.mockRestore();
  });
});

describe("sanitizeProfile", () => {
  it("keeps catalog injuries once and canonicalizes movement names", () => {
    const p = sanitizeProfile({
      ...emptyProfile(),
      injuries: [
        { key: "test_knee", side: "left", severity: "mild", notes: null, since: null },
        { key: "test_knee", side: "right", severity: "acute", notes: null, since: null },
        { key: "test_missing", side: null, severity: "acute", notes: null, since: null },
      ],
      benchmarks: [
        { movement: "THR", kind: "max_reps", value: 15, unit: "reps", recordedAt: null },
        { movement: "Test Unlisted Carry", kind: "1rm", value: 100, unit: "kg", recordedAt: null },
      ],
      goals: [
        { movement: "test pulls", description: "First strict test pull" },
        { movement: "Test Unlisted Move", description: "Dance" },
      ],
    }, domain);
    expect(p.injuries.map((i) => [i.key, i.side])).toEqual([["test_knee", "left"]]);
    expect(p.benchmarks.map((b) => b.movement)).toEqual(["Test Hang Raise"]);
    expect(p.goals.map((g) => g.movement)).toEqual(["Test Pull", null]);
  });
});
