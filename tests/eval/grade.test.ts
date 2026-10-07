import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { EvalCaseSchema, gradeCase, resolveCase } from "@/lib/eval/grade";
import type { PipelineResult } from "@/lib/engine/types";
import { fran } from "../fixtures/workouts";

const baseCase = EvalCaseSchema.parse({
  id: "fran-shoulder", description: "Fran with a sore shoulder",
  input: { kind: "paste", rawText: "Fran" },
  request: { situation: "sore shoulder" },
  expect: { mustAvoid: ["Thruster"], mustRestrict: ["shoulder"], maxTotalMinutes: 10 },
});

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  const original = fran();
  return {
    original,
    conditions: [],
    restrictions: [{ site: "shoulder", side: "right", movements: [], mechanisms: ["overhead"], positions: [], evidence: "sore", replacements: [] }],
    unavailableEquipment: [],
    tailored: {
      name: null, rawText: "x", droppedBlocks: [], changes: [], rationale: "r", safetyNote: null,
      blocks: original.blocks.map((b, i) => ({
        ...b, sourceBlocks: [i],
        components: [{ ...b.components[1], movement: "Ring Row", canonical: "Ring Row" }],
      })),
    },
    findings: [], feedbackHistory: [], model: "fake", ...overrides,
  };
}

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

describe("eval grading", () => {
  it("fills defaults for profile, request and expectations", () => {
    const c = EvalCaseSchema.parse({ id: "x", description: "x", input: { kind: "paste", rawText: "x" } });
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
    bad.tailored.blocks[0].components = [{ ...bad.tailored.blocks[0].components[0], movement: "Thruster", canonical: "Thruster" }];
    bad.tailored.blocks[0].timeDomainMinutes = 20;
    const g = gradeCase(baseCase, { kind: "result", result: bad });
    expect(g.passed).toBe(false);
    expect(g.failures).toEqual([
      "violation [time_cap_exceeded] over",
      "prescribed forbidden movement Thruster",
      "no restriction on the shoulder",
      "total 20 min > 10 min",
    ]);
  });

  it("checks how the original workout was recognized", () => {
    const c = EvalCaseSchema.parse({
      id: "snatch-pull", description: "x", input: { kind: "paste", rawText: "x" },
      expect: { originalMustContain: ["Thruster", "Snatch Pull"], originalMustNotContain: ["Pull-up"] },
    });
    expect(gradeCase(c, { kind: "result", result: result() }).failures).toEqual([
      "original is missing Snatch Pull",
      "original contains Pull-up",
    ]);
  });

  it("compares recognition expectations ignoring case and punctuation", () => {
    const r = result();
    r.original.blocks[0].components.push({ ...r.original.blocks[0].components[0], movement: "sots press", canonical: null });
    const c = EvalCaseSchema.parse({
      id: "sots", description: "x", input: { kind: "paste", rawText: "x" },
      expect: { originalMustContain: ["thruster"], originalMustNotContain: ["Sots Press"] },
    });
    expect(gradeCase(c, { kind: "result", result: r }).failures).toEqual(["original contains Sots Press"]);
  });

  it("checks that the tailored session keeps the required movement patterns", () => {
    const c = EvalCaseSchema.parse({
      id: "keep-squat", description: "x", input: { kind: "paste", rawText: "x" },
      expect: { mustKeepPatterns: ["squat", "horizontal_pull"] },
    });
    // result() prescribes only Ring Row (horizontal_pull): the squat half of the Thruster is gone.
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
      id: "keep", description: "x", input: { kind: "paste", rawText: "x" },
      expect: { mustDetect: ["pregnancy"], mustKeep: ["Ring Row", "Toes-to-Bar"] },
    });
    expect(gradeCase(c, { kind: "result", result: result() }).failures).toEqual([
      "dropped Toes-to-Bar, which nothing restricted",
      "did not detect pregnancy",
    ]);
  });
});
