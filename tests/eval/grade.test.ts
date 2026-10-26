import { describe, it, expect } from "vitest";
import { EvalCaseSchema, gradeCase, resolveCase } from "@/lib/eval/grade";
import type { PipelineResult } from "@/lib/engine/types";
import { couplet, fixtureDomain } from "../fixtures/workouts";

const baseCase = EvalCaseSchema.parse({
  id: "test-shoulder", description: "Test workout with a sore shoulder",
  rawText: "Test Workout",
  request: { situation: "sore shoulder" },
  expect: { mustAvoid: ["Test Combo"], mustRestrict: ["shoulder"], maxTotalMinutes: 10 },
});

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  const original = couplet();
  return {
    original,
    conditions: [],
    restrictions: [{ site: "shoulder", side: "right", movements: [], mechanisms: ["overhead"], positions: [], evidence: "sore", replacements: [] }],
    unavailableEquipment: [],
    tailored: {
      name: null, rawText: "x", droppedBlocks: [], changes: [], rationale: "r", safetyNote: null,
      blocks: original.blocks.map((b, i) => ({
        ...b, sourceBlocks: [i],
        components: [{ ...b.components[1], movement: "Test Row", canonical: "Test Row" }],
      })),
    },
    findings: [], feedbackHistory: [], model: "fake", ...overrides,
  };
}

const domain = fixtureDomain();

describe("eval grading", () => {
  it("fills defaults for profile, request and expectations", () => {
    const c = EvalCaseSchema.parse({ id: "x", description: "x", rawText: "x" });
    expect(c.expect).toEqual({
      mustAvoid: [], mustKeep: [], mustDetect: [], mustRestrict: [], maxTotalMinutes: null, expectFailClosed: false,
      originalMustContain: [], originalMustNotContain: [], mustKeepPatterns: [],
    });
    const { profile, request } = resolveCase(c);
    expect(profile.equipment).toBeNull();
    expect(request.situation).toBe("");
  });

  it("passes a clean result that meets every expectation", () => {
    expect(gradeCase(baseCase, { kind: "result", result: result() })).toEqual({ passed: true, failures: [] });
  });

  it("fails on violations, forbidden movements, missed restrictions and overtime", () => {
    const bad = result({
      restrictions: [],
      findings: [{ kind: "time_cap_exceeded", severity: "violation", blockIndex: null, movement: null, message: "over" }],
    });
    bad.tailored.blocks[0].components = [{ ...bad.tailored.blocks[0].components[0], movement: "Test Combo", canonical: "Test Combo" }];
    bad.tailored.blocks[0].timeDomainMinutes = 20;
    const g = gradeCase(baseCase, { kind: "result", result: bad });
    expect(g.passed).toBe(false);
    expect(g.failures).toEqual([
      "violation [time_cap_exceeded] over",
      "prescribed forbidden movement Test Combo",
      "no restriction on the shoulder",
      "total 20 min > 10 min",
    ]);
  });

  it("checks how the original workout was recognized", () => {
    const c = EvalCaseSchema.parse({
      id: "unlisted-lift", description: "x", rawText: "x",
      expect: { originalMustContain: ["Test Combo", "Test Missing"], originalMustNotContain: ["Test Pull"] },
    });
    expect(gradeCase(c, { kind: "result", result: result() }).failures).toEqual([
      "original is missing Test Missing",
      "original contains Test Pull",
    ]);
  });

  it("compares recognition expectations ignoring case and punctuation", () => {
    const r = result();
    r.original.blocks[0].components.push({ ...r.original.blocks[0].components[0], movement: "test unlisted-lift", canonical: null });
    const c = EvalCaseSchema.parse({
      id: "unlisted", description: "x", rawText: "x",
      expect: { originalMustContain: ["test combo"], originalMustNotContain: ["Test Unlisted Lift"] },
    });
    expect(gradeCase(c, { kind: "result", result: r }).failures).toEqual(["original contains Test Unlisted Lift"]);
  });

  it("checks that the tailored session keeps the required movement patterns", () => {
    const c = EvalCaseSchema.parse({
      id: "keep-squat", description: "x", rawText: "x",
      expect: { mustKeepPatterns: ["squat", "horizontal_pull"] },
    });
    // result() prescribes only Test Row (horizontal_pull): the squat half of the Test Combo is gone.
    expect(gradeCase(c, { kind: "result", result: result() }, domain.movements).failures).toEqual([
      "no tailored movement keeps the squat pattern",
    ]);
  });

  it("treats an engine error as a failure unless fail-closed was expected", () => {
    expect(gradeCase(baseCase, { kind: "error", error: "engine_unsafe" }).failures).toEqual(["engine error: engine_unsafe"]);
    const closed = EvalCaseSchema.parse({ ...baseCase, expect: { expectFailClosed: true } });
    expect(gradeCase(closed, { kind: "error", error: "engine_unsafe" }).passed).toBe(true);
    expect(gradeCase(closed, { kind: "result", result: result() }).failures).toEqual(["expected the engine to fail closed"]);
  });

  it("grades today's non-pain conditions, and the movements nothing restricted", () => {
    const c = EvalCaseSchema.parse({
      id: "keep", description: "x", rawText: "x",
      expect: { mustDetect: ["test_condition"], mustKeep: ["Test Row", "Test Hang Raise"] },
    });
    expect(gradeCase(c, { kind: "result", result: result() }).failures).toEqual([
      "dropped Test Hang Raise, which nothing restricted",
      "did not detect test_condition",
    ]);
  });
});
