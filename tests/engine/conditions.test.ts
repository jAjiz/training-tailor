import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { activateConditions, profileConditionRefs } from "@/lib/engine/conditions";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

describe("activateConditions", () => {
  it("keeps profile injuries and lets today's detection override the same key", () => {
    const base = profileConditionRefs([
      { key: "knee_pain", side: "left", severity: "mild", notes: "old", since: null },
      { key: "hand_tear", side: null, severity: "moderate", notes: null, since: null },
    ]);
    const { active, refs } = activateConditions(base, [
      { key: "knee_pain", side: "left", severity: "acute", evidence: "me la torcí ayer" },
    ], domain.contraindications);
    expect(refs.map((r) => [r.key, r.severity, r.source])).toEqual([
      ["knee_pain", "acute", "today"],
      ["hand_tear", "moderate", "profile"],
    ]);
    expect(active.map((a) => a.contraindication.key)).toEqual(["knee_pain", "hand_tear"]);
    expect(active[0].side).toBe("left");
  });

  it("drops keys missing from the catalog", () => {
    const { refs } = activateConditions(
      [{ key: "gone", side: null, severity: "mild", source: "profile", evidence: null }], [], domain.contraindications,
    );
    expect(refs).toEqual([]);
  });
});
