import { z } from "zod";
import type { WorkoutInput } from "@/lib/engine/pipeline";
import {
  AthleteProfileSchema, ManualWorkoutSchema, TailorRequestSchema, emptyProfile, emptyRequest,
  type AthleteProfile, type PipelineResult, type TailorRequest,
} from "@/lib/engine/types";

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  input: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("paste"), rawText: z.string().min(1) }),
    z.object({ kind: z.literal("manual"), workout: ManualWorkoutSchema }),
  ]),
  profile: AthleteProfileSchema.partial().default({}),
  request: TailorRequestSchema.partial().default({}),
  // prefault (not default): the fallback object is parsed, so the inner defaults apply.
  expect: z.object({
    mustAvoid: z.array(z.string()).default([]),
    mustDetect: z.array(z.string()).default([]),
    maxTotalMinutes: z.number().positive().nullable().default(null),
    expectFailClosed: z.boolean().default(false),
  }).prefault({}),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export type EvalOutcome =
  | { kind: "result"; result: PipelineResult }
  | { kind: "error"; error: "engine_unsafe" | "engine_failed" };

export function resolveCase(c: EvalCase): { input: WorkoutInput; profile: AthleteProfile; request: TailorRequest } {
  return {
    input: c.input,
    profile: { ...emptyProfile(), ...c.profile },
    request: { ...emptyRequest(), ...c.request },
  };
}

export function gradeCase(c: EvalCase, outcome: EvalOutcome): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  if (outcome.kind === "error") {
    if (!(c.expect.expectFailClosed && outcome.error === "engine_unsafe")) failures.push(`engine error: ${outcome.error}`);
    return { passed: failures.length === 0, failures };
  }
  if (c.expect.expectFailClosed) failures.push("expected the engine to fail closed");
  const r = outcome.result;
  for (const f of r.findings.filter((x) => x.severity === "violation")) failures.push(`violation [${f.kind}] ${f.message}`);
  const prescribed = new Set(r.tailored.blocks.flatMap((b) => b.components.map((x) => x.canonical ?? x.movement)));
  for (const name of c.expect.mustAvoid) if (prescribed.has(name)) failures.push(`prescribed forbidden movement ${name}`);
  const detected = new Set(r.conditions.map((x) => x.key));
  for (const key of c.expect.mustDetect) if (!detected.has(key)) failures.push(`did not detect ${key}`);
  if (c.expect.maxTotalMinutes !== null) {
    const total = r.tailored.blocks.reduce((sum, b) => sum + (b.timeDomainMinutes ?? 0), 0);
    if (total > c.expect.maxTotalMinutes) failures.push(`total ${total} min > ${c.expect.maxTotalMinutes} min`);
  }
  return { passed: failures.length === 0, failures };
}
