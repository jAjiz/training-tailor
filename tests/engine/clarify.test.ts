import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { StressMechanism } from "@/lib/domain/types";
import { applyAnswers, buildQuestions, conservativeAnswers, mergeFreeText, siteOptions } from "@/lib/engine/clarify";
import type { Restriction } from "@/lib/engine/types";
import { snatchSession } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const r = (patch: Partial<Restriction>): Restriction => ({
  site: null, side: null, movements: [], mechanisms: [], positions: [], evidence: "x", replacements: [], ...patch,
});
const questions = (restrictions: Restriction[], equipment: string[] | null = null) => buildQuestions({
  original: snatchSession(), restrictions, base: [], equipment: equipment as never, movements: domain.movements,
});

describe("siteOptions", () => {
  it("groups the session's movements that load the site by their kinds of load", () => {
    const options = siteOptions(snatchSession(), "shoulder", createMovementResolver(domain.movements));
    expect(options.map((o) => [o.movements, o.mechanisms])).toEqual([
      [["Power Snatch"], ["overhead", "ballistic"]],
      [["Toes-to-Bar"], ["traction", "kipping"]],
    ]);
    expect(options[0].label).toBe("Arms overhead or explosive");
  });

  it("has nothing to offer when no movement loads the site", () => {
    expect(siteOptions(snatchSession(), "neck", createMovementResolver(domain.movements))).toEqual([]);
  });
});

describe("buildQuestions", () => {
  it("asks which loads bother a painful site when nothing was named", () => {
    const [q] = questions([r({ site: "shoulder", evidence: "me duele el hombro" })]);
    expect(q).toMatchObject({ kind: "site", restriction: 0, site: "shoulder", evidence: "me duele el hombro" });
  });

  it("does not ask when the site loads nothing in the session", () => {
    expect(questions([r({ site: "neck" })])).toEqual([]);
  });

  it("does not ask when the best replacement spares the painful site", () => {
    expect(questions([r({ site: "shoulder", movements: ["Power Snatch"] })])).toEqual([]);
  });

  it("asks for the replacement when the best one loads the painful site the same way", () => {
    const [q] = questions([r({ site: "shoulder", movements: ["Power Snatch"] })], ["dumbbell", "kettlebell", "pullup_bar"]);
    expect(q).toMatchObject({ kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 0, movement: "Power Snatch", site: "shoulder" });
    if (q.kind !== "replacement") throw new Error("expected a replacement question");
    expect(q.options[0]).toEqual({ name: "Dumbbell Snatch", shared: ["overhead", "ballistic"] });
    expect(q.options.find((o) => o.name === q.preselected)!.shared).toEqual([]);
  });

  it("never asks about a replacement without a site, nor once the athlete picked one", () => {
    const equipment = ["dumbbell", "kettlebell", "pullup_bar"];
    expect(questions([r({ movements: ["Power Snatch"] })], equipment)).toEqual([]);
    expect(questions([r({
      site: "shoulder", movements: ["Power Snatch"], replacements: [{ blockIndex: 0, componentIndex: 0, replacement: "Kettlebell Swing" }],
    })], equipment)).toEqual([]);
  });
});

describe("applyAnswers", () => {
  const site = r({ site: "shoulder" });

  it("turns a site answer into the kinds of load it bans", () => {
    expect(applyAnswers([site], [{ kind: "site", restriction: 0, mechanisms: ["overhead", "ballistic"] }])[0].mechanisms).toEqual(["overhead", "ballistic"]);
    expect(applyAnswers([site], [{ kind: "site", restriction: 0, mechanisms: "all" }])[0].mechanisms).toEqual(StressMechanism.options);
    expect(applyAnswers([site], [{ kind: "site", restriction: 0, mechanisms: "none" }])[0]).toEqual(site);
  });

  it("records the replacement the athlete picked", () => {
    const named = r({ site: "shoulder", movements: ["Power Snatch"] });
    const [out] = applyAnswers([named], [{ kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 0, replacement: "Kettlebell Swing" }]);
    expect(out.replacements).toEqual([{ blockIndex: 0, componentIndex: 0, replacement: "Kettlebell Swing" }]);
  });

  it("answers conservatively for the eval: every load, the preselected replacement", () => {
    const qs = questions([r({ site: "shoulder" }), r({ site: "shoulder", movements: ["Power Snatch"] })], ["dumbbell", "kettlebell", "pullup_bar"]);
    const answers = conservativeAnswers(qs);
    expect(answers[0]).toEqual({ kind: "site", restriction: 0, mechanisms: "all" });
    expect(answers[1]).toMatchObject({ kind: "replacement", restriction: 1, replacement: "Kettlebell Swing" });
  });
});

describe("mergeFreeText", () => {
  it("replaces the answered restriction with the re-analysis, banning every load on a site still unnamed", () => {
    const kept = r({ movements: ["Toes-to-Bar"] });
    const vague = r({ site: "shoulder", evidence: "me duele el hombro" });
    const merged = mergeFreeText([kept, vague], 1, {
      restrictions: [r({ site: "shoulder", movements: ["Power Snatch"], evidence: "solo el snatch" }), r({ site: "wrist", evidence: "y la muñeca" })],
      questions: [
        { kind: "site", restriction: 1, site: "wrist", side: null, evidence: "y la muñeca", options: [] },
        { kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 0, movement: "Power Snatch", site: "shoulder", options: [], preselected: "Kettlebell Swing" },
      ],
    });
    expect(merged.restrictions.map((x) => [x.evidence, x.mechanisms.length])).toEqual([
      ["x", 0], ["solo el snatch", 0], ["y la muñeca", StressMechanism.options.length],
    ]);
    // Only replacement questions remain, re-indexed into the merged list.
    expect(merged.questions).toEqual([expect.objectContaining({ kind: "replacement", restriction: 1 })]);
  });
});
