import { z } from "zod";
import { createMovementResolver, normalizeMovementName } from "@/lib/domain/resolve";
import { MovementPattern, Site, type Movement } from "@/lib/domain/types";
import {
  AthleteProfileSchema, TailorRequestSchema, emptyProfile, emptyRequest,
  type AthleteProfile, type PipelineResult, type TailorRequest,
} from "@/lib/engine/types";

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  rawText: z.string().min(1), // the session as the coach wrote it
  profile: AthleteProfileSchema.partial().default({}),
  request: TailorRequestSchema.partial().default({}),
  // prefault (not default): the fallback object is parsed, so the inner defaults apply.
  expect: z.object({
    mustAvoid: z.array(z.string()).default([]),
    // Original movements the tailored session must still prescribe: a snatch ban keeps the toes-to-bar.
    mustKeep: z.array(z.string()).default([]),
    mustDetect: z.array(z.string()).default([]), // today's non-pain catalog conditions
    mustRestrict: z.array(Site).default([]), // sites today's restrictions must name
    maxTotalMinutes: z.number().positive().nullable().default(null),
    expectFailClosed: z.boolean().default(false),
    // Canonical names the analysis of the ORIGINAL must (not) produce: pins recognition, e.g. a
    // "snatch pull" must not be read as a Hang Power Snatch.
    originalMustContain: z.array(z.string()).default([]),
    originalMustNotContain: z.array(z.string()).default([]),
    // Patterns some tailored movement must still train: a Thruster with a bad shoulder keeps "squat".
    mustKeepPatterns: z.array(MovementPattern).default([]),
  }).prefault({}),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export type EvalOutcome =
  | { kind: "result"; result: PipelineResult }
  | { kind: "error"; error: "engine_unsafe" | "engine_failed" };

export function resolveCase(c: EvalCase): {
  rawText: string; profile: AthleteProfile; request: TailorRequest;
} {
  return {
    rawText: c.rawText,
    profile: { ...emptyProfile(), ...c.profile },
    request: { ...emptyRequest(), ...c.request },
  };
}

export function gradeCase(
  c: EvalCase, outcome: EvalOutcome, movements: Movement[] = [],
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  if (outcome.kind === "error") {
    if (!(c.expect.expectFailClosed && outcome.error === "engine_unsafe")) failures.push(`engine error: ${outcome.error}`);
    return { passed: failures.length === 0, failures };
  }
  if (c.expect.expectFailClosed) failures.push("expected the engine to fail closed");
  const r = outcome.result;
  const recognized = new Set(r.original.blocks.flatMap((b) => b.components.map((x) => normalizeMovementName(x.canonical ?? x.movement))));
  for (const name of c.expect.originalMustContain) if (!recognized.has(normalizeMovementName(name))) failures.push(`original is missing ${name}`);
  for (const name of c.expect.originalMustNotContain) if (recognized.has(normalizeMovementName(name))) failures.push(`original contains ${name}`);
  for (const f of r.findings.filter((x) => x.severity === "violation")) failures.push(`violation [${f.kind}] ${f.message}`);
  const prescribed = new Set(r.tailored.blocks.flatMap((b) => b.components.map((x) => x.canonical ?? x.movement)));
  for (const name of c.expect.mustAvoid) if (prescribed.has(name)) failures.push(`prescribed forbidden movement ${name}`);
  for (const name of c.expect.mustKeep) if (!prescribed.has(name)) failures.push(`dropped ${name}, which nothing restricted`);
  const resolve = createMovementResolver(movements);
  const patterns = new Set([...prescribed].flatMap((name) => resolve(name)?.patterns ?? []));
  for (const p of c.expect.mustKeepPatterns) if (!patterns.has(p)) failures.push(`no tailored movement keeps the ${p} pattern`);
  const detected = new Set(r.conditions.map((x) => x.key));
  for (const key of c.expect.mustDetect) if (!detected.has(key)) failures.push(`did not detect ${key}`);
  const restricted = new Set(r.restrictions.map((x) => x.site));
  for (const site of c.expect.mustRestrict) if (!restricted.has(site)) failures.push(`no restriction on the ${site}`);
  if (c.expect.maxTotalMinutes !== null) {
    const total = r.tailored.blocks.reduce((sum, b) => sum + (b.timeDomainMinutes ?? 0), 0);
    if (total > c.expect.maxTotalMinutes) failures.push(`total ${total} min > ${c.expect.maxTotalMinutes} min`);
  }
  return { passed: failures.length === 0, failures };
}
