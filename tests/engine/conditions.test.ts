import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { assessMovement } from "@/lib/domain/assess";
import { activateConditions, hasScope, profileConditionRefs, restrictionConditions } from "@/lib/engine/conditions";
import type { Restriction } from "@/lib/engine/types";

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

describe("restrictionConditions", () => {
  const byName = (n: string) => domain.movements.find((m) => m.name === n)!;
  const r = (patch: Partial<Restriction>): Restriction => ({
    site: null, side: null, movements: [], mechanisms: [], positions: [], evidence: "x", replacements: [], ...patch,
  });
  const verdict = (restrictions: Restriction[], name: string) =>
    assessMovement(byName(name), restrictionConditions(restrictions)).verdict;

  it("bans only the movements the athlete named", () => {
    const named = [r({ site: "shoulder", movements: ["Power Snatch"] })];
    expect(verdict(named, "Power Snatch")).toBe("avoid");
    expect(verdict(named, "Toes-to-Bar")).toBe("ok");
    expect(verdict(named, "Push Press")).toBe("ok");
  });

  it("bans a named kind of load at the named site, or anywhere when no site was named", () => {
    expect(verdict([r({ site: "shoulder", mechanisms: ["overhead"] })], "Push Press")).toBe("avoid");
    expect(verdict([r({ site: "shoulder", mechanisms: ["overhead"] })], "Pull-up")).toBe("ok");
    expect(verdict([r({ site: "knee", mechanisms: ["overhead"] })], "Push Press")).toBe("ok");
    expect(verdict([r({ mechanisms: ["overhead"] })], "Push Press")).toBe("avoid");
  });

  it("bans a named position", () => {
    expect(verdict([r({ positions: ["hanging"] })], "Toes-to-Bar")).toBe("avoid");
  });

  it("activates nothing for a restriction that names nothing (context only)", () => {
    expect(restrictionConditions([r({ site: "shoulder" })])).toEqual([]);
    expect(hasScope(r({ site: "shoulder" }))).toBe(false);
    expect(hasScope(r({ movements: ["Power Snatch"] }))).toBe(true);
  });

  it("keys each restriction by its index, offset for refine", () => {
    const active = restrictionConditions([r({ site: "shoulder" }), r({ movements: ["Power Snatch"] })], 2);
    expect(active.map((a) => [a.contraindication.key, a.contraindication.kind])).toEqual([["today_3", "limitation"]]);
  });

  it("keeps the healthy-side exemption for a sided restriction", () => {
    const sided = [r({ site: "shoulder", side: "right", mechanisms: ["overhead"] })];
    const single = domain.movements.find((m) => m.unilateral === "upper" && m.stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("overhead")))!;
    expect(assessMovement(single, restrictionConditions(sided)).verdict).toBe("caution");
  });
});
