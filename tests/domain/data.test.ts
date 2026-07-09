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

  it("strict handstand variants carry no ballistic shoulder stress", () => {
    const ballistic = (name: string) =>
      byName(name).stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("ballistic"));
    expect(ballistic("Handstand Push-up")).toBe(true);
    expect(ballistic("Strict Handstand Push-up")).toBe(false);
    expect(ballistic("Wall-facing Handstand Push-up")).toBe(false);
  });

  it("the goblet and dumbbell squats differ by implement and cover for each other", () => {
    expect(byName("Goblet Squat").equipment).toEqual(["kettlebell"]);
    expect(byName("Dumbbell Squat").equipment).toEqual(["dumbbell"]);
    expect(byName("Goblet Squat").substitutes).toContain("Dumbbell Squat");
    expect(byName("Dumbbell Squat").substitutes).toContain("Goblet Squat");
  });

  it("no dumbbell movement loads the wrist in extension", () => {
    for (const m of movements.filter((mv) => mv.equipment.includes("dumbbell"))) {
      expect(m.stresses.some((s) => s.site === "wrist"), m.name).toBe(false);
    }
  });

  it("toes-to-bar scales through knees-to-elbows to the strict knee raise", () => {
    expect(byName("Toes-to-Bar").substitutes[0]).toBe("Knees-to-Elbows");
    expect(byName("Knees-to-Elbows").substitutes[0]).toBe("Hanging Knee Raise");
  });

  it("the GHD sit-up requires a GHD and scales to the V-up", () => {
    expect(byName("GHD Sit-up").equipment).toEqual(["ghd"]);
    expect(byName("GHD Sit-up").substitutes[0]).toBe("V-up");
    expect(byName("V-up").equipment).toEqual([]);
  });

  it("the ramp variant requires a ramp, the plain handstand walk requires nothing", () => {
    expect(byName("Handstand Walk Ramp").equipment).toEqual(["ramp"]);
    expect(byName("Handstand Walk").equipment).toEqual([]);
  });

  it("each muscle-up variant is apparatus-specific", () => {
    expect(byName("Bar Muscle-up").equipment).toEqual(["pullup_bar"]);
    expect(byName("Ring Muscle-up").equipment).toEqual(["rings"]);
  });

  it("each muscle-up variant substitutes for the other", () => {
    expect(byName("Bar Muscle-up").substitutes).toContain("Ring Muscle-up");
    expect(byName("Ring Muscle-up").substitutes).toContain("Bar Muscle-up");
  });

  it("no contraindication relies on an explicit movement override", () => {
    for (const i of injuries) expect(i.avoidMovements, i.injuryKey).toEqual([]);
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
      blocked: [
        "Shoulder Press", "Push Press", "Handstand Push-up", "Power Snatch",
        "Bar Muscle-up", "Ring Muscle-up", "Overhead Squat", "Push Jerk", "Split Jerk",
        "Squat Snatch", "Clean & Jerk", "Dumbbell Push Press", "Dumbbell Push Jerk",
        "Chest-to-Bar", "Handstand Hold", "Handstand Walk", "Wall Climb",
        "Box Handstand Hold", "Knees-to-Elbows",
        "Dumbbell Snatch", "Dumbbell Split Jerk", "Dumbbell Clean & Jerk",
        "Dumbbell Overhead Squat", "Dumbbell Squat Snatch",
      ],
      allowed: [
        "Bench Press", "Ring Row", "Banded Pull-up", "Squat Clean", "Dead Hang", "Plank",
        "Dumbbell Clean", "Dumbbell Deadlift", "Dumbbell Front Squat",
      ],
    },
    {
      key: "lower_back_strain",
      blocked: [
        "Deadlift", "Kettlebell Swing", "Power Clean", "Power Snatch", "GHD Sit-up",
        "Dumbbell Deadlift", "Dumbbell Clean", "Dumbbell Snatch",
      ],
      allowed: ["Romanian Deadlift", "Goblet Squat", "Bike (Erg)", "V-up", "Sit-up"],
    },
    {
      key: "knee_pain",
      blocked: [
        "Back Squat", "Front Squat", "Thruster", "Wall Ball", "Run", "Box Jump",
        "Overhead Squat", "Squat Clean", "Squat Snatch", "Clean & Jerk",
        "Dumbbell Squat", "Dumbbell Front Squat", "Dumbbell Overhead Squat",
        "Dumbbell Squat Clean", "Dumbbell Squat Snatch",
      ],
      allowed: [
        "Box Squat", "Air Squat", "Bike (Erg)", "Step-up", "Power Clean",
        "Dumbbell Deadlift", "Dumbbell Clean",
      ],
    },
    {
      key: "wrist_pain",
      blocked: [
        "Front Squat", "Thruster", "Handstand Push-up", "Push-up", "Power Clean",
        "Overhead Squat", "Push Jerk", "Bar Muscle-up",
        "Strict Handstand Push-up", "Wall-facing Handstand Push-up",
        "Handstand Hold", "Handstand Walk", "Wall Climb", "Box Handstand Hold",
      ],
      allowed: [
        "Dumbbell Shoulder Press", "Dumbbell Bench Press", "Ring Row",
        "Ring Muscle-up", "Dumbbell Push Press", "Dumbbell Push Jerk",
        "Dumbbell Overhead Hold", "Plank",
        "Dumbbell Snatch", "Dumbbell Squat Clean", "Dumbbell Overhead Squat",
      ],
    },
    {
      key: "elbow_tendinopathy",
      blocked: [
        "Bar Muscle-up", "Ring Muscle-up", "Pull-up", "Toes-to-Bar",
        "Chest-to-Bar", "Knees-to-Elbows",
      ],
      allowed: ["Banded Pull-up", "Ring Row", "Dead Hang", "Hanging Knee Raise"],
    },
    {
      key: "ankle_sprain",
      blocked: ["Run", "Double-under", "Burpee", "Box Jump"],
      allowed: ["Row (Erg)", "Bike (Erg)", "Up-Down"],
    },
    {
      key: "hip_flexor_strain",
      blocked: [
        "Toes-to-Bar", "Run", "Power Clean", "Power Snatch",
        "Squat Clean", "Squat Snatch", "Clean & Jerk", "GHD Sit-up", "V-up",
        "Knees-to-Elbows", "Dumbbell Squat Clean", "Dumbbell Squat Snatch",
      ],
      allowed: [
        "Kettlebell Swing", "Bike (Erg)", "Air Squat", "Deadlift",
        "Dumbbell Clean", "Dumbbell Snatch",
      ],
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
      blocked: ["Bench Press", "Dumbbell Bench Press", "Push-up", "Bar Muscle-up", "Ring Muscle-up"],
      allowed: ["Knee Push-up", "Ring Row", "Shoulder Press"],
    },
    {
      key: "biceps_strain",
      blocked: ["Pull-up", "Bar Muscle-up", "Ring Muscle-up", "Chest-to-Bar"],
      allowed: ["Ring Row", "Banded Pull-up", "Push-up"],
    },
    {
      key: "no_hanging",
      blocked: [
        "Pull-up", "Banded Pull-up", "Bar Muscle-up", "Ring Muscle-up",
        "Toes-to-Bar", "Hanging Knee Raise", "Chest-to-Bar", "Dead Hang",
        "Knees-to-Elbows",
      ],
      allowed: ["Ring Row", "Sit-up", "Shoulder Press", "Handstand Hold"],
    },
    {
      key: "no_inversion",
      blocked: [
        "Handstand Push-up", "Strict Handstand Push-up", "Wall-facing Handstand Push-up",
        "Handstand Hold", "Handstand Walk", "Handstand Walk Pirouette",
        "Handstand Walk Ramp", "Wall Climb", "Box Handstand Hold",
      ],
      allowed: [
        "Shoulder Press", "Push Press", "Push-up", "Wall Ball", "Dead Hang",
        "Plank", "Dumbbell Overhead Hold",
      ],
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
    const wallClimb = byName("Wall Climb");
    expect(wallClimb.positions).toEqual(["partial_inversion"]);
    expect(matchesContraindication(wallClimb, injury("no_inversion"))).toBe(true);
  });

  it("the handstand hold scales to a supported inverted hold before leaving inversion", () => {
    const first = byName("Handstand Hold").substitutes[0];
    expect(first).toBe("Box Handstand Hold");
    expect(byName(first).positions).toEqual(["partial_inversion"]);
    expect(byName(first).patterns).toEqual(["hold"]);
  });

  it("the handstand hold falls back to a hold that survives no_inversion", () => {
    const usable = byName("Handstand Hold")
      .substitutes.map(byName)
      .filter((m) => !matchesContraindication(m, injury("no_inversion")));
    expect(usable.map((m) => m.name)).toContain("Dumbbell Overhead Hold");
  });

  it("the plank survives every contraindication", () => {
    const plank = byName("Plank");
    for (const i of injuries) expect(matchesContraindication(plank, i), i.injuryKey).toBe(false);
  });

  it("every injury leaves at least five movements available", () => {
    for (const i of injuries) {
      const remaining = movements.filter((m) => !matchesContraindication(m, i));
      expect(remaining.length, i.injuryKey).toBeGreaterThanOrEqual(5);
    }
  });
});
