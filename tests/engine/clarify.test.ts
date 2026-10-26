import { describe, it, expect } from "vitest";
import { createMovementResolver } from "@/lib/domain/resolve";
import { StressMechanism } from "@/lib/domain/types";
import { applyAnswers, buildQuestions, conservativeAnswers, mergeFreeText, siteOptions } from "@/lib/engine/clarify";
import type { Restriction } from "@/lib/engine/types";
import { fixtureDomain, hoistSession } from "../fixtures/workouts";

const domain = fixtureDomain();

const r = (patch: Partial<Restriction>): Restriction => ({
  site: null, side: null, movements: [], mechanisms: [], positions: [], evidence: "x", replacements: [], ...patch,
});
const questions = (restrictions: Restriction[], equipment: string[] | null = null) => buildQuestions({
  original: hoistSession(), restrictions, base: [], equipment: equipment as never, movements: domain.movements,
});

describe("siteOptions", () => {
  it("groups the session's movements that load the site by their kinds of load", () => {
    const options = siteOptions(hoistSession(), "shoulder", createMovementResolver(domain.movements));
    expect(options.map((o) => [o.movements, o.mechanisms])).toEqual([
      [["Test Hoist"], ["overhead", "ballistic"]],
      [["Test Hang Raise"], ["traction", "kipping"]],
    ]);
    expect(options[0].label).toBe("Arms overhead or explosive");
  });

  it("has nothing to offer when no movement loads the site", () => {
    expect(siteOptions(hoistSession(), "neck", createMovementResolver(domain.movements))).toEqual([]);
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
    expect(questions([r({ site: "shoulder", movements: ["Test Hoist"] })])).toEqual([]);
  });

  it("asks for the replacement when the best one loads the painful site the same way", () => {
    const [q] = questions([r({ site: "shoulder", movements: ["Test Hoist"] })], ["dumbbell", "kettlebell", "pullup_bar"]);
    expect(q).toMatchObject({ kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 0, movement: "Test Hoist", site: "shoulder" });
    if (q.kind !== "replacement") throw new Error("expected a replacement question");
    expect(q.options[0]).toEqual({ name: "Test Dumbbell Hoist", shared: ["overhead", "ballistic"] });
    expect(q.options.find((o) => o.name === q.preselected)!.shared).toEqual([]);
  });

  it("never asks about a replacement without a site, nor once the athlete picked one", () => {
    const equipment = ["dumbbell", "kettlebell", "pullup_bar"];
    expect(questions([r({ movements: ["Test Hoist"] })], equipment)).toEqual([]);
    expect(questions([r({
      site: "shoulder", movements: ["Test Hoist"], replacements: [{ blockIndex: 0, componentIndex: 0, replacement: "Test Swing" }],
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
    const named = r({ site: "shoulder", movements: ["Test Hoist"] });
    const [out] = applyAnswers([named], [{ kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 0, replacement: "Test Swing" }]);
    expect(out.replacements).toEqual([{ blockIndex: 0, componentIndex: 0, replacement: "Test Swing" }]);
  });

  it("answers conservatively for the eval: every load, the preselected replacement", () => {
    const qs = questions([r({ site: "shoulder" }), r({ site: "shoulder", movements: ["Test Hoist"] })], ["dumbbell", "kettlebell", "pullup_bar"]);
    const answers = conservativeAnswers(qs);
    expect(answers[0]).toEqual({ kind: "site", restriction: 0, mechanisms: "all" });
    expect(answers[1]).toMatchObject({ kind: "replacement", restriction: 1, replacement: "Test Swing" });
  });
});

describe("mergeFreeText", () => {
  it("replaces the answered restriction with the re-analysis, banning every load on a site still unnamed", () => {
    const kept = r({ movements: ["Test Hang Raise"] });
    const vague = r({ site: "shoulder", evidence: "me duele el hombro" });
    const merged = mergeFreeText([kept, vague], 1, {
      restrictions: [r({ site: "shoulder", movements: ["Test Hoist"], evidence: "solo el hoist" }), r({ site: "wrist", evidence: "y la muñeca" })],
      questions: [
        { kind: "site", restriction: 1, site: "wrist", side: null, evidence: "y la muñeca", options: [] },
        { kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 0, movement: "Test Hoist", site: "shoulder", options: [], preselected: "Test Swing" },
      ],
    });
    expect(merged.restrictions.map((x) => [x.evidence, x.mechanisms.length])).toEqual([
      ["x", 0], ["solo el hoist", 0], ["y la muñeca", StressMechanism.options.length],
    ]);
    // Only replacement questions remain, re-indexed into the merged list.
    expect(merged.questions).toEqual([expect.objectContaining({ kind: "replacement", restriction: 1 })]);
  });

  it("keeps the asked site when the answer names none", () => {
    const vague = r({ site: "shoulder", side: "right", evidence: "me duele el hombro" });
    const merged = mergeFreeText([vague], 0, {
      restrictions: [r({ mechanisms: ["traction"], positions: ["hanging"], evidence: "solo al colgarme" })], questions: [],
    });
    expect(merged.restrictions).toEqual([expect.objectContaining({ site: "shoulder", side: "right", mechanisms: ["traction"] })]);
  });
});
