import { assessMovement, type ActiveCondition, type AssessmentReason } from "@/lib/domain/assess";
import { createMovementResolver, normalizeMovementName } from "@/lib/domain/resolve";
import type { Equipment, Movement } from "@/lib/domain/types";
import { missingEquipment } from "./plan";
import type { Finding, LoadIntensity, StructuredWorkout, TailoringResult } from "./types";

export interface ValidateArgs {
  original: StructuredWorkout;
  result: TailoringResult;
  movements: Movement[];
  active: ActiveCondition[];
  equipment: Equipment[] | null;
  timeCapMinutes: number | null;
}

export const isViolation = (f: Finding) => f.severity === "violation";

const describeReasons = (reasons: AssessmentReason[]) => reasons.map((r) => `${r.conditionKey}: ${r.detail}`).join("; ");
const LOAD_RANK: Record<LoadIntensity, number> = { light: 0, moderate: 1, heavy: 2 };

export function validateTailoring(a: ValidateArgs): Finding[] {
  const resolve = createMovementResolver(a.movements);
  const findings: Finding[] = [];
  const originalNames = new Set(
    a.original.blocks.flatMap((b) => b.components.map((c) => normalizeMovementName(c.movement))),
  );

  a.result.blocks.forEach((block, blockIndex) => {
    for (const c of block.components) {
      const m = c.canonical ? resolve(c.canonical) : null;
      if (!m) {
        const kept = originalNames.has(normalizeMovementName(c.movement));
        findings.push({
          kind: "unrecognized_movement", severity: kept ? "warning" : "violation", blockIndex, movement: c.movement,
          message: kept
            ? `"${c.movement}" is not in the movement library, so it could not be checked against your conditions.`
            : `"${c.movement}" is not in the movement library.`,
        });
        continue;
      }
      const assessment = assessMovement(m, a.active);
      if (assessment.verdict === "avoid") {
        findings.push({
          kind: "contraindicated_movement", severity: "violation", blockIndex, movement: m.name,
          message: `${m.name} is contraindicated (${describeReasons(assessment.reasons.filter((r) => r.verdict === "avoid"))}).`,
        });
      } else if (assessment.verdict === "caution") {
        const healthySide = assessment.reasons.some((r) => r.healthySideOnly);
        findings.push({
          kind: "caution_movement", severity: "warning", blockIndex, movement: m.name,
          message: `${m.name}: use caution (${describeReasons(assessment.reasons)})${healthySide ? "; healthy side only" : ""}.`,
        });
      }
      const missing = missingEquipment(m, a.equipment);
      if (missing.length > 0) {
        findings.push({
          kind: "equipment_unavailable", severity: "violation", blockIndex, movement: m.name,
          message: `${m.name} needs ${missing.join(", ")}, which is not available.`,
        });
      }
    }
  });

  if (a.timeCapMinutes !== null) {
    const total = a.result.blocks.reduce((sum, b) => sum + (b.timeDomainMinutes ?? 0), 0);
    if (total > a.timeCapMinutes * 1.1) {
      findings.push({
        kind: "time_cap_exceeded", severity: "violation", blockIndex: null, movement: null,
        message: `The session takes about ${total} min, over the ${a.timeCapMinutes} min cap.`,
      });
    }
  }

  a.result.blocks.forEach((block, blockIndex) => {
    if (block.sourceBlocks.length !== 1) return; // merged blocks are judged by the athlete, not by a 1:1 rule
    const source = a.original.blocks[block.sourceBlocks[0]];
    if (!source?.stimulus || !block.stimulus) return;
    const from = source.stimulus;
    const to = block.stimulus;
    if (from.quality !== to.quality) {
      findings.push({
        kind: "stimulus_drift", severity: "violation", blockIndex, movement: null,
        message: `Block ${blockIndex + 1} changed its training quality from ${from.quality} to ${to.quality}.`,
      });
      return;
    }
    if (from.energySystem && to.energySystem && from.energySystem !== to.energySystem) {
      findings.push({
        kind: "stimulus_drift", severity: "warning", blockIndex, movement: null,
        message: `Block ${blockIndex + 1} shifted its energy system from ${from.energySystem} to ${to.energySystem}.`,
      });
    }
    if (from.loadIntensity && to.loadIntensity && LOAD_RANK[to.loadIntensity] > LOAD_RANK[from.loadIntensity]) {
      findings.push({
        kind: "stimulus_drift", severity: "warning", blockIndex, movement: null,
        message: `Block ${blockIndex + 1} is heavier than programmed (${from.loadIntensity} → ${to.loadIntensity}).`,
      });
    }
  });

  const accounted = new Set([
    ...a.result.blocks.flatMap((b) => b.sourceBlocks),
    ...a.result.droppedBlocks.map((d) => d.index),
  ]);
  a.original.blocks.forEach((_, i) => {
    if (!accounted.has(i)) {
      findings.push({
        kind: "unaccounted_block", severity: "violation", blockIndex: i, movement: null,
        message: `Original block ${i + 1} was neither kept nor explicitly dropped.`,
      });
    }
  });

  return findings;
}
