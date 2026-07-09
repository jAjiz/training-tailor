import { describe, it, expect } from "vitest";
import movementsJson from "../../data/movements.json";
import injuriesJson from "../../data/injury-contraindications.json";
import stimuli from "../../data/stimulus-taxonomy.json";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import type { Movement } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/matching";

const movements = movementsJson.map((m) => MovementSchema.parse(m));
const injuries = injuriesJson.map((i) => InjuryContraindicationSchema.parse(i));

function byName(name: string): Movement {
  const m = movements.find((mv) => mv.name === name);
  if (!m) throw new Error(`movement not found: ${name}`);
  return m;
}

describe("domain data integrity", () => {
  it("every movement is valid and has a unique name", () => {
    const names = new Set<string>();
    for (const m of movements) {
      expect(names.has(m.name)).toBe(false);
      names.add(m.name);
    }
    expect(movements.length).toBeGreaterThanOrEqual(25);
  });

  it("every substitute references a real movement", () => {
    const names = new Set(movements.map((m) => m.name));
    for (const m of movements) for (const s of m.substitutes) expect(names.has(s)).toBe(true);
  });

  it("injuries are valid and reference real movements", () => {
    const names = new Set(movements.map((m) => m.name));
    for (const i of injuries) for (const mv of i.avoidMovements) expect(names.has(mv)).toBe(true);
    expect(injuries.length).toBeGreaterThanOrEqual(10);
  });

  it("stimulus taxonomy is valid with unique keys", () => {
    const keys = new Set<string>();
    for (const s of stimuli) {
      StimulusDefSchema.parse(s);
      expect(keys.has(s.key)).toBe(false);
      keys.add(s.key);
    }
    expect(keys.has("aerobic_capacity")).toBe(true);
  });
});

describe("contraindication matching over real data", () => {
  function injury(key: string) {
    const i = injuries.find((x) => x.injuryKey === key);
    if (!i) throw new Error(`injury not found: ${key}`);
    return i;
  }

  const cases: Array<{ key: string; blocked: string[]; allowed: string[] }> = [
    {
      key: "shoulder_impingement",
      blocked: ["Shoulder Press", "Push Press", "Handstand Push-up", "Power Snatch", "Muscle-up"],
      allowed: ["Bench Press", "Ring Row", "Banded Pull-up"],
    },
    {
      key: "lower_back_strain",
      blocked: ["Deadlift", "Kettlebell Swing", "Power Clean", "Power Snatch"],
      allowed: ["Romanian Deadlift", "Goblet Squat", "Bike (Erg)"],
    },
    {
      key: "knee_pain",
      blocked: ["Back Squat", "Front Squat", "Thruster", "Wall Ball", "Run", "Box Jump"],
      allowed: ["Box Squat", "Air Squat", "Bike (Erg)", "Step-up"],
    },
    {
      key: "wrist_pain",
      blocked: ["Front Squat", "Thruster", "Handstand Push-up", "Push-up", "Power Clean"],
      allowed: ["Dumbbell Shoulder Press", "Dumbbell Bench Press", "Ring Row"],
    },
    {
      key: "elbow_tendinopathy",
      blocked: ["Muscle-up", "Pull-up", "Toes-to-Bar"],
      allowed: ["Banded Pull-up", "Ring Row"],
    },
    {
      key: "ankle_sprain",
      blocked: ["Run", "Double-under", "Burpee", "Box Jump"],
      allowed: ["Row (Erg)", "Bike (Erg)", "Up-Down"],
    },
    {
      key: "hip_flexor_strain",
      blocked: ["Toes-to-Bar", "Run", "Power Clean"],
      allowed: ["Kettlebell Swing", "Bike (Erg)", "Air Squat"],
    },
    {
      key: "quad_strain",
      blocked: ["Back Squat", "Thruster", "Wall Ball", "Box Jump"],
      allowed: ["Air Squat", "Box Squat", "Step-up", "Bike (Erg)"],
    },
    {
      key: "hamstring_strain",
      blocked: ["Deadlift", "Romanian Deadlift", "Kettlebell Swing", "Run"],
      allowed: ["Bike (Erg)", "Air Squat", "Shoulder Press"],
    },
    {
      key: "calf_strain",
      blocked: ["Run", "Double-under", "Single-under", "Box Jump"],
      allowed: ["Bike (Erg)", "Row (Erg)", "Air Squat"],
    },
    {
      key: "pec_strain",
      blocked: ["Bench Press", "Dumbbell Bench Press", "Push-up", "Muscle-up"],
      allowed: ["Knee Push-up", "Ring Row", "Shoulder Press"],
    },
    {
      key: "biceps_strain",
      blocked: ["Pull-up", "Muscle-up"],
      allowed: ["Ring Row", "Banded Pull-up", "Push-up"],
    },
    {
      key: "no_hanging",
      blocked: ["Pull-up", "Banded Pull-up", "Muscle-up", "Toes-to-Bar", "Hanging Knee Raise"],
      allowed: ["Ring Row", "Sit-up", "Shoulder Press"],
    },
    {
      key: "no_inversion",
      blocked: ["Handstand Push-up"],
      allowed: ["Shoulder Press", "Push Press", "Push-up", "Wall Ball"],
    },
  ];

  for (const c of cases) {
    it(`${c.key}: blocks the contraindicated movements and spares safe substitutes`, () => {
      const i = injury(c.key);
      for (const name of c.blocked) {
        expect(matchesContraindication(byName(name), i), `${name} should be blocked`).toBe(true);
      }
      for (const name of c.allowed) {
        expect(matchesContraindication(byName(name), i), `${name} should be allowed`).toBe(false);
      }
    });
  }

  it("no_inversion blocks partially inverted movements, not only full inversion", () => {
    const wallSupported = MovementSchema.parse({
      name: "Wall-supported fixture", patterns: ["vertical_push"], positions: ["partial_inversion"],
      stresses: [], equipment: [], skill: "intermediate", substitutes: [],
    });
    expect(matchesContraindication(wallSupported, injury("no_inversion"))).toBe(true);
  });

  it("every injury leaves at least five movements available", () => {
    for (const i of injuries) {
      const remaining = movements.filter((m) => !matchesContraindication(m, i));
      expect(remaining.length, i.injuryKey).toBeGreaterThanOrEqual(5);
    }
  });
});
