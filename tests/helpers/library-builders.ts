import type { ActiveCondition } from "@/lib/domain/assess";
import type { DomainData, DomainLibrary } from "@/lib/domain/library";
import {
  ContraindicationSchema, MovementSchema, emptyRecordsCatalog,
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
    records: emptyRecordsCatalog(),
    ...over,
  };
}

export function active(
  contraindication: Contraindication, severity: Severity = "moderate", side: Side | null = null,
): ActiveCondition {
  return { contraindication, side, severity };
}

/** The library seeded for service tests: two barbell lifts, bodyweight, cardio and dumbbell movements. */
export function serviceLibrary(): DomainLibrary {
  return {
    ...testDomain({
      movements: [
        testMovement("Test Back Squat", { equipment: ["barbell"], substitutes: ["Test Air Squat"] }),
        testMovement("Test Deadlift", { patterns: ["hinge"], equipment: ["barbell"], substitutes: ["Test Air Squat"] }),
        testMovement("Test Air Squat", { substitutes: ["Test Back Squat"] }),
        testMovement("Test Pull-up", { patterns: ["vertical_pull"], equipment: ["pullup_bar"] }),
        testMovement("Test Row", { patterns: ["monostructural"], equipment: ["rower"] }),
        testMovement("Test DB Snatch", { patterns: ["olympic"], equipment: ["dumbbell"] }),
        testMovement("Test Walk", { patterns: ["carry"] }),
      ],
      contraindications: [testContraindication("test_injury")],
      records: {
        lift: [{ label: { en: "Test Lifts", es: "Test Levantamientos" }, entries: [{ movement: "Test Back Squat" }, { movement: "Test Deadlift" }] }],
        gymnastics: [
          { label: { en: "Test Weighted", es: "Test Con lastre" }, entries: [{ movement: "Test Pull-up", measure: "reps", weighted: true }] },
          { label: { en: "Test Max", es: "Test Máximo" }, entries: [
            { movement: "Test Air Squat", measure: "reps", weighted: false },
            { movement: "Test Walk", measure: "distance" },
          ] },
        ],
        cardio: [{ label: { en: "Test Cardio", es: "Test Cardio" }, entries: [
          { movement: "Test Row", targets: [{ distanceM: 500 }, { distanceM: 2000 }, { calories: 50 }] },
        ] }],
      },
    }),
    expectations: [],
    evalCases: [],
  };
}
