import { describe, it, expect } from "vitest";
import { EvalCaseSchema, gradeCase, resolveCase } from "@/lib/eval/grade";
import type { PipelineResult } from "@/lib/engine/types";
import { fran } from "../fixtures/workouts";

const baseCase = EvalCaseSchema.parse({
  id: "fran-shoulder", description: "Fran with a sore shoulder",
  input: { kind: "paste", rawText: "Fran" },
  request: { situation: "sore shoulder" },
  expect: { mustAvoid: ["Thruster"], mustDetect: ["shoulder_impingement"], maxTotalMinutes: 10 },
});

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  const original = fran();
  return {
    original,
    conditions: [{ key: "shoulder_impingement", side: "right", severity: "moderate", source: "today", evidence: "sore" }],
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

describe("eval grading", () => {
  it("fills defaults for profile, request and expectations", () => {
    const c = EvalCaseSchema.parse({ id: "x", description: "x", input: { kind: "paste", rawText: "x" } });
    expect(c.expect).toEqual({
      mustAvoid: [], mustDetect: [], maxTotalMinutes: null, expectFailClosed: false,
      originalMustContain: [], originalMustNotContain: [],
    });
    const { profile, request } = resolveCase(c);
    expect(profile.equipment).toBeNull();
    expect(request.situation).toBe("");
  });

  it("passes a clean result that meets every expectation", () => {
    expect(gradeCase(baseCase, { kind: "result", result: result() })).toEqual({ passed: true, failures: [] });
  });

  it("fails on violations, forbidden movements, missed detections and overtime", () => {
    const bad = result({
      conditions: [],
      findings: [{ kind: "time_cap_exceeded", severity: "violation", blockIndex: null, movement: null, message: "over" }],
    });
    bad.tailored.blocks[0].components = [{ ...bad.tailored.blocks[0].components[0], movement: "Thruster", canonical: "Thruster" }];
    bad.tailored.blocks[0].timeDomainMinutes = 20;
    const g = gradeCase(baseCase, { kind: "result", result: bad });
    expect(g.passed).toBe(false);
    expect(g.failures).toEqual([
      "violation [time_cap_exceeded] over",
      "prescribed forbidden movement Thruster",
      "did not detect shoulder_impingement",
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

  it("treats an engine error as a failure unless fail-closed was expected", () => {
    expect(gradeCase(baseCase, { kind: "error", error: "engine_unsafe" }).failures).toEqual(["engine error: engine_unsafe"]);
    const closed = EvalCaseSchema.parse({ ...baseCase, expect: { expectFailClosed: true } });
    expect(gradeCase(closed, { kind: "error", error: "engine_unsafe" }).passed).toBe(true);
    expect(gradeCase(closed, { kind: "result", result: result() }).failures).toEqual(["expected the engine to fail closed"]);
  });
});
