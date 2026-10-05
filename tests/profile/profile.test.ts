import { describe, it, expect, beforeAll, vi } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { emptyProfile, type AthleteProfile } from "@/lib/engine/types";
import { normalizeProfile, sanitizeProfile } from "@/lib/profile";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

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
        { key: "knee_pain", side: "left", severity: "mild", notes: null, since: null },
        { key: "knee_pain", side: "right", severity: "acute", notes: null, since: null },
        { key: "broken_heart", side: null, severity: "acute", notes: null, since: null },
      ],
      benchmarks: [
        { movement: "T2B", kind: "max_reps", value: 15, unit: "reps", recordedAt: null },
        { movement: "Zercher Carry", kind: "1rm", value: 100, unit: "kg", recordedAt: null },
      ],
      goals: [
        { movement: "pull ups", description: "First strict pull-up" },
        { movement: "Moonwalk", description: "Dance" },
      ],
    }, domain);
    expect(p.injuries.map((i) => [i.key, i.side])).toEqual([["knee_pain", "left"]]);
    expect(p.benchmarks.map((b) => b.movement)).toEqual(["Toes-to-Bar"]);
    expect(p.goals.map((g) => g.movement)).toEqual(["Pull-up", null]);
  });
});
