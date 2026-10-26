import type { ActiveCondition } from "@/lib/domain/assess";
import type { DomainData } from "@/lib/domain/repository";
import {
  ContraindicationSchema, MovementSchema,
  type Contraindication, type Movement, type Severity, type Side, type StimulusDef,
} from "@/lib/domain/types";
import { EnergySystem, LoadIntensity, Quality } from "@/lib/engine/types";

export function testMovement(name: string, over: Partial<Movement> = {}): Movement {
  return MovementSchema.parse({
    name,
    patterns: ["squat"],
    positions: [],
    stresses: [],
    equipment: [],
    skill: "beginner",
    substitutes: [],
    aliases: [],
    unilateral: null,
    ...over,
  });
}

export function testContraindication(key: string, over: Partial<Contraindication> = {}): Contraindication {
  return ContraindicationSchema.parse({
    key,
    label: key,
    kind: "injury",
    rules: [],
    positionRules: [],
    avoidMovements: [],
    notes: null,
    ...over,
  });
}

function defs(keys: readonly string[]): StimulusDef[] {
  return keys.map((key) => ({ key, label: key, description: key }));
}

export function testDomain(over: Partial<DomainData> = {}): DomainData {
  return {
    movements: [],
    contraindications: [],
    taxonomy: {
      qualities: defs(Quality.options),
      energySystems: defs(EnergySystem.options),
      loadIntensities: defs(LoadIntensity.options),
    },
    conversions: { effort: [], implementLoad: [] },
    ...over,
  };
}

export function active(
  contraindication: Contraindication, severity: Severity = "moderate", side: Side | null = null,
): ActiveCondition {
  return { contraindication, side, severity };
}
