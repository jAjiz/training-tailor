import { describe, it, expect, vi } from "vitest";
import { emptyStoredProfile, type StoredProfile } from "@/lib/engine/types";
import { normalizeProfile, sanitizeProfile } from "@/lib/profile";
import { fixtureDomain } from "../fixtures/workouts";

const domain = fixtureDomain();

describe("normalizeProfile", () => {
  it("returns an empty profile for a new athlete", () => {
    expect(normalizeProfile(null)).toEqual(emptyStoredProfile());
  });

  it("passes a valid stored profile through", () => {
    const p: StoredProfile = { ...emptyStoredProfile(), sex: "male", equipment: ["barbell"] };
    expect(normalizeProfile(p)).toEqual(p);
  });

  it("drops benchmarks a profile stored before records, keeping the rest", () => {
    const legacy = { ...emptyStoredProfile(), sex: "female", benchmarks: [{ movement: "Test Pull", kind: "max_reps", value: 12, unit: "reps", recordedAt: null }] };
    const p = normalizeProfile(legacy);
    expect(p.sex).toBe("female");
    expect(p).not.toHaveProperty("benchmarks");
  });

  it("falls back to an empty profile when the stored document is invalid", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(normalizeProfile({ injuries: "nope" })).toEqual(emptyStoredProfile());
    spy.mockRestore();
  });
});

describe("sanitizeProfile", () => {
  it("keeps catalog injuries once and canonicalizes movement names", () => {
    const p = sanitizeProfile({
      ...emptyStoredProfile(),
      injuries: [
        { key: "test_knee", side: "left", severity: "mild", notes: null, since: null },
        { key: "test_knee", side: "right", severity: "acute", notes: null, since: null },
        { key: "test_missing", side: null, severity: "acute", notes: null, since: null },
      ],
      goals: [
        { movement: "test pulls", description: "First strict test pull" },
        { movement: "Test Unlisted Move", description: "Dance" },
      ],
    }, domain);
    expect(p.injuries.map((i) => [i.key, i.side])).toEqual([["test_knee", "left"]]);
    expect(p.goals.map((g) => g.movement)).toEqual(["Test Pull", null]);
  });
});
