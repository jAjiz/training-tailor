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

  it("the goblet squat has one row per implement, each scaling only to the air squat", () => {
    expect(byName("Dumbbell Goblet Squat").equipment).toEqual(["dumbbell"]);
    expect(byName("Kettlebell Goblet Squat").equipment).toEqual(["kettlebell"]);
    expect(byName("Dumbbell Goblet Squat").substitutes).toEqual(["Air Squat"]);
    expect(byName("Kettlebell Goblet Squat").substitutes).toEqual(["Air Squat"]);
    expect(byName("Kettlebell Goblet Squat").stresses).toEqual(byName("Dumbbell Goblet Squat").stresses);
  });

  it("removed the redundant dumbbell squat", () => {
    expect(movements.some((m) => m.name === "Dumbbell Squat")).toBe(false);
  });

  it("no dumbbell movement loads the wrist in extension", () => {
    for (const m of movements.filter((mv) => mv.equipment.includes("dumbbell"))) {
      expect(m.stresses.some((s) => s.site === "wrist"), m.name).toBe(false);
    }
  });

  it("lat stress only appears on movements that kip", () => {
    for (const m of movements.filter((mv) => mv.stresses.some((s) => s.site === "lats"))) {
      expect(m.stresses.some((s) => s.mechanisms.includes("kipping")), m.name).toBe(true);
    }
  });

  it("the rope climb pulls without kipping, and the legless variant scales from it", () => {
    const rc = byName("Rope Climb");
    expect(rc.equipment).toEqual(["rope"]);
    expect(rc.positions).toEqual(["hanging"]);
    expect(rc.patterns).toEqual(["vertical_pull"]);
    expect(rc.stresses.some((s) => s.mechanisms.includes("kipping"))).toBe(false);
    expect(rc.stresses.some((s) => s.site === "lats")).toBe(false);
    const legless = byName("Legless Rope Climb");
    expect(legless.skill).toBe("advanced");
    expect(legless.substitutes[0]).toBe("Rope Climb");
  });

  it("the toes-to-ring mirrors the toes-to-bar on rings", () => {
    const ttr = byName("Toes-to-Ring");
    expect(ttr.equipment).toEqual(["rings"]);
    expect(ttr.positions).toEqual(["hanging"]);
    expect(ttr.stresses).toEqual(byName("Toes-to-Bar").stresses);
    expect(ttr.substitutes[0]).toBe("Toes-to-Bar");
  });

  it("toes-to-bar scales through knees-to-elbows to the strict knee raise", () => {
    expect(byName("Toes-to-Bar").substitutes[0]).toBe("Knees-to-Elbows");
    expect(byName("Knees-to-Elbows").substitutes[0]).toBe("Hanging Knee Raise");
  });

  it("the farmer carry is a loaded carry with a per-implement row", () => {
    for (const name of ["Dumbbell Farmer Carry", "Kettlebell Farmer Carry"]) {
      const m = byName(name);
      expect(m.patterns).toEqual(["carry"]);
      expect(m.stresses).toEqual([{ site: "lumbar", mechanisms: ["compression"] }]);
    }
    expect(byName("Dumbbell Farmer Carry").equipment).toEqual(["dumbbell"]);
    expect(byName("Kettlebell Farmer Carry").equipment).toEqual(["kettlebell"]);
  });

  it("the GHD sit-up requires a GHD and scales to the V-up", () => {
    expect(byName("GHD Sit-up").equipment).toEqual(["ghd"]);
    expect(byName("GHD Sit-up").substitutes[0]).toBe("V-up");
    expect(byName("V-up").equipment).toEqual([]);
  });

  it("the air bike and the bike erg are distinct machines that cover for each other", () => {
    expect(byName("Air Bike").equipment).toEqual(["air_bike"]);
    expect(byName("Bike (Erg)").equipment).toEqual(["bike"]);
    expect(byName("Air Bike").substitutes).toContain("Bike (Erg)");
    expect(byName("Bike (Erg)").substitutes).toContain("Air Bike");
    expect(byName("Air Bike").aliases).toContain("Assault Bike");
    expect(byName("Bike (Erg)").aliases).not.toContain("Assault Bike");
  });

  it("the ski erg is a distinct ergometer that covers for the rower and bike", () => {
    expect(byName("Ski (Erg)").equipment).toEqual(["ski_erg"]);
    expect(byName("Ski (Erg)").patterns).toEqual(["monostructural"]);
    expect(byName("Ski (Erg)").substitutes).toEqual(["Row (Erg)", "Bike (Erg)"]);
  });

  it("the ring dip requires rings and scales to the push-up", () => {
    expect(byName("Ring Dip").equipment).toEqual(["rings"]);
    expect(byName("Ring Dip").substitutes[0]).toBe("Push-up");
    expect(byName("Push-up").stresses.some((s) => s.site === "triceps")).toBe(false);
  });

  it("the ramp variant requires a ramp, the plain handstand walk requires nothing", () => {
    expect(byName("Handstand Walk Ramp").equipment).toEqual(["ramp"]);
    expect(byName("Handstand Walk").equipment).toEqual([]);
  });

  it("each muscle-up variant is apparatus-specific", () => {
    expect(byName("Bar Muscle-up").equipment).toEqual(["pullup_bar"]);
    expect(byName("Ring Muscle-up").equipment).toEqual(["rings"]);
  });

  it("every muscle-up carries the triceps stress of the dip it finishes with", () => {
    const dipTriceps = byName("Ring Dip").stresses.find((s) => s.site === "triceps")!.mechanisms;
    for (const m of movements.filter((mv) => mv.name.endsWith("Muscle-up"))) {
      const triceps = m.stresses.find((s) => s.site === "triceps");
      expect(triceps, m.name).toBeDefined();
      for (const mech of dipTriceps) expect(triceps!.mechanisms, m.name).toContain(mech);
    }
  });

  it("each muscle-up variant substitutes for the other", () => {
    expect(byName("Bar Muscle-up").substitutes).toContain("Ring Muscle-up");
    expect(byName("Ring Muscle-up").substitutes).toContain("Bar Muscle-up");
  });

  it("aliases are unique and never collide with a canonical name", () => {
    const names = new Set(movements.map((m) => m.name));
    const seen = new Set<string>();
    for (const m of movements) {
      for (const a of m.aliases) {
        expect(names.has(a), `${a} collides with a movement name`).toBe(false);
        expect(seen.has(a), `${a} is used by more than one movement`).toBe(false);
        seen.add(a);
      }
    }
  });

  it("resolves common workout shorthand to the movement", () => {
    const byAlias = (a: string) => movements.find((m) => m.aliases.includes(a));
    expect(byAlias("T2B")?.name).toBe("Toes-to-Bar");
    expect(byAlias("HSPU")?.name).toBe("Handstand Push-up");
    expect(byAlias("KB Snatch")?.name).toBe("Kettlebell Snatch");
    expect(byAlias("DB Snatch")?.name).toBe("Dumbbell Snatch");
    expect(byAlias("C&J")?.name).toBe("Clean & Jerk");
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

  it("loaded deep knee flexion always travels with deep hip flexion", () => {
    for (const m of movements) {
      const deepKnee = m.stresses.some((s) => s.site === "knee" && s.mechanisms.includes("deep_flexion"));
      const deepHip = m.stresses.some((s) => s.site === "hip" && s.mechanisms.includes("deep_flexion"));
      expect(deepKnee, m.name).toBe(deepHip);
    }
  });

  it("no lunge reaches end-range flexion, loaded or not", () => {
    for (const m of movements.filter((mv) => mv.patterns[0] === "lunge")) {
      for (const s of m.stresses) expect(s.mechanisms.includes("deep_flexion"), m.name).toBe(false);
    }
  });

  it("every loaded lunge scales down to the bodyweight lunge", () => {
    expect(byName("Lunge").substitutes).toEqual(["Step-up"]);
    const loaded = movements.filter(
      (mv) => mv.patterns[0] === "lunge" && !["Lunge", "Step-up"].includes(mv.name)
    );
    expect(loaded.length).toBeGreaterThanOrEqual(7);
    for (const m of loaded) expect(m.substitutes, m.name).toContain("Lunge");
  });

  it("the lunge load position decides the wrist and shoulder stress", () => {
    const has = (name: string, site: string) => byName(name).stresses.some((s) => s.site === site);
    expect(has("Front Rack Lunge", "wrist")).toBe(true);
    expect(has("Dumbbell Front Rack Lunge", "wrist")).toBe(false);
    expect(has("Overhead Lunge", "shoulder")).toBe(true);
    expect(has("Back Rack Lunge", "shoulder")).toBe(false);
    expect(has("Dumbbell Lunge", "lumbar")).toBe(false);
    expect(has("Back Rack Lunge", "lumbar")).toBe(true);
  });

  it("each d-ball lift mirrors the stresses of its sandbag twin", () => {
    const names = new Set(movements.map((m) => m.name));
    const twins = movements.filter(
      (m) => m.name.startsWith("D-Ball ") && names.has("Sandbag " + m.name.slice("D-Ball ".length))
    );
    expect(twins.length).toBeGreaterThanOrEqual(5);
    for (const db of twins) {
      const sb = byName("Sandbag " + db.name.slice("D-Ball ".length));
      expect(db.equipment, db.name).toEqual(["d_ball"]);
      expect(db.patterns, db.name).toEqual(sb.patterns);
      expect(db.skill, db.name).toBe(sb.skill);
      expect(db.stresses, db.name).toEqual(sb.stresses);
    }
  });

  it("the d-ball is the only odd object that goes overhead, and carries no quads there", () => {
    expect(movements.some((m) => m.name === "Sandbag Ground-to-Overhead")).toBe(false);
    const g2o = byName("D-Ball Ground-to-Overhead");
    expect(g2o.equipment).toEqual(["d_ball"]);
    expect(g2o.patterns).toEqual(["hinge", "vertical_push"]);
    expect(g2o.stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("overhead"))).toBe(true);
    expect(g2o.stresses.some((s) => s.site === "quads")).toBe(false);
  });

  it("only barbell lifts carry the olympic pattern", () => {
    for (const m of movements.filter((mv) => mv.patterns.includes("olympic"))) {
      expect(m.equipment, m.name).toContain("barbell");
    }
  });

  it("each kettlebell lift mirrors the stresses of its dumbbell twin", () => {
    const names = new Set(movements.map((m) => m.name));
    const twins = movements.filter(
      (m) => m.name.startsWith("Kettlebell ") && names.has("Dumbbell " + m.name.slice("Kettlebell ".length))
    );
    expect(twins.length).toBeGreaterThanOrEqual(11);
    expect(names.has("Kettlebell Squat Snatch"), "dropped as non-standard").toBe(false);
    expect(names.has("Kettlebell Split Jerk"), "dropped as non-standard").toBe(false);
    for (const kb of twins) {
      const db = byName("Dumbbell " + kb.name.slice("Kettlebell ".length));
      expect(kb.equipment, kb.name).toEqual(["kettlebell"]);
      expect(kb.patterns, kb.name).toEqual(db.patterns);
      expect(kb.skill, kb.name).toBe(db.skill);
      expect(kb.stresses, kb.name).toEqual(db.stresses);
    }
  });

  it("the cluster is a clean into a thruster, driving the quads ballistically", () => {
    const c = byName("Cluster");
    expect(c.stresses.find((s) => s.site === "quads")?.mechanisms).toEqual(["eccentric", "ballistic"]);
    expect(c.stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("overhead"))).toBe(true);
    expect(c.stresses.some((s) => s.site === "hip_flexors" && s.mechanisms.includes("ballistic"))).toBe(true);
    expect(c.substitutes).toEqual(["Thruster", "Clean & Jerk"]);
  });

  it("only the jumping lunge carries impact", () => {
    for (const m of movements.filter((mv) => mv.patterns[0] === "lunge")) {
      const impact = m.stresses.some((s) => s.mechanisms.includes("impact"));
      expect(impact, m.name).toBe(m.name === "Jumping Lunge");
    }
    expect(byName("Jumping Lunge").patterns).toEqual(["lunge", "jump"]);
  });

  it("no site carries both a mid-range mechanism and its end-range grade", () => {
    const graded = [["flexion", "deep_flexion"], ["extension", "deep_extension"]] as const;
    for (const m of movements) {
      for (const s of m.stresses) {
        for (const [mid, end] of graded) {
          const both = s.mechanisms.includes(mid) && s.mechanisms.includes(end);
          expect(both, `${m.name} / ${s.site}`).toBe(false);
        }
      }
    }
  });

  it("the dip bottom loads the shoulder in end-range extension", () => {
    const deepExtension = (name: string) =>
      byName(name).stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("deep_extension"));
    expect(deepExtension("Ring Dip")).toBe(true);
    expect(deepExtension("Bar Muscle-up")).toBe(true);
    expect(deepExtension("Ring Muscle-up")).toBe(true);
    expect(deepExtension("Push-up")).toBe(false);
    expect(deepExtension("Shoulder Press")).toBe(false);
  });

  it("the devil press is a dumbbell burpee into an overhead snatch", () => {
    const dp = byName("Devil Press");
    expect(dp.equipment).toEqual(["dumbbell"]);
    expect(dp.stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("overhead"))).toBe(true);
    expect(dp.stresses.some((s) => s.site === "wrist")).toBe(false);
    expect(dp.substitutes).toEqual(["Dumbbell Snatch", "Burpee"]);
  });

  it("every site annotated on a movement is blocked by some contraindication", () => {
    const movementSites = new Set(movements.flatMap((m) => m.stresses.map((s) => s.site)));
    const blockedSites = new Set(injuries.flatMap((i) => i.avoidStresses.map((s) => s.site)));
    for (const site of movementSites) expect(blockedSites.has(site), site).toBe(true);
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
        "Squat Snatch", "Clean & Jerk", "Cluster", "D-Ball Ground-to-Overhead",
        "Devil Press", "Dumbbell Push Press", "Dumbbell Push Jerk",
        "Chest-to-Bar", "Handstand Hold", "Handstand Walk", "Wall Climb",
        "Box Handstand Hold", "Knees-to-Elbows", "Ring Dip",
        "Overhead Lunge", "Dumbbell Overhead Lunge",
        "Dumbbell Snatch", "Dumbbell Split Jerk", "Dumbbell Clean & Jerk",
        "Dumbbell Overhead Squat", "Dumbbell Squat Snatch",
      ],
      allowed: [
        "Bench Press", "Ring Row", "Banded Pull-up", "Squat Clean", "Dead Hang", "Plank",
        "Push-up", "Knee Push-up",
        "Dumbbell Clean", "Dumbbell Deadlift", "Dumbbell Front Squat",
        "Front Rack Lunge", "Back Rack Lunge",
      ],
    },
    {
      key: "lower_back_strain",
      blocked: [
        "Deadlift", "Kettlebell Swing", "Power Clean", "Power Snatch", "GHD Sit-up",
        "Dumbbell Deadlift", "Dumbbell Clean", "Dumbbell Snatch",
        "Back Rack Lunge", "Front Rack Lunge", "Overhead Lunge",
        "Sandbag Squat", "Sandbag Carry", "Sandbag Hold", "D-Ball Ground-to-Overhead",
      ],
      allowed: [
        "Romanian Deadlift", "Kettlebell Goblet Squat", "Bike (Erg)", "V-up", "Sit-up",
        "Lunge", "Dumbbell Lunge", "Kettlebell Lunge",
      ],
    },
    {
      key: "knee_pain",
      blocked: [
        "Back Squat", "Front Squat", "Thruster", "Wall Ball", "Run", "Box Jump",
        "Overhead Squat", "Squat Clean", "Squat Snatch", "Clean & Jerk", "Cluster",
        "Dumbbell Goblet Squat", "Dumbbell Front Squat", "Dumbbell Overhead Squat",
        "Dumbbell Squat Clean", "Dumbbell Squat Snatch", "Jumping Lunge",
        "Sandbag Squat", "D-Ball Squat",
      ],
      allowed: [
        "Box Squat", "Air Squat", "Bike (Erg)", "Step-up", "Power Clean",
        "Dumbbell Deadlift", "Dumbbell Clean",
        "Lunge", "Dumbbell Lunge", "Back Rack Lunge",
      ],
    },
    {
      key: "wrist_pain",
      blocked: [
        "Front Squat", "Thruster", "Handstand Push-up", "Push-up", "Power Clean",
        "Overhead Squat", "Push Jerk", "Bar Muscle-up",
        "Strict Handstand Push-up", "Wall-facing Handstand Push-up",
        "Handstand Hold", "Handstand Walk", "Wall Climb", "Box Handstand Hold",
        "Front Rack Lunge", "Overhead Lunge",
      ],
      allowed: [
        "Dumbbell Shoulder Press", "Dumbbell Bench Press", "Ring Row",
        "Ring Muscle-up", "Dumbbell Push Press", "Dumbbell Push Jerk",
        "Dumbbell Overhead Hold", "Plank",
        "Dumbbell Snatch", "Dumbbell Squat Clean", "Dumbbell Overhead Squat",
        "Dumbbell Front Rack Lunge", "Dumbbell Overhead Lunge", "Back Rack Lunge",
      ],
    },
    {
      key: "elbow_tendinopathy",
      blocked: [
        "Bar Muscle-up", "Ring Muscle-up", "Pull-up", "Toes-to-Bar",
        "Chest-to-Bar", "Knees-to-Elbows",
      ],
      allowed: ["Banded Pull-up", "Ring Row", "Dead Hang", "Hanging Knee Raise", "Rope Climb"],
    },
    {
      key: "ankle_sprain",
      blocked: ["Run", "Double-under", "Burpee", "Box Jump", "Jumping Lunge"],
      allowed: ["Row (Erg)", "Bike (Erg)", "Up-Down", "Lunge", "Step-up"],
    },
    {
      key: "neck_strain",
      blocked: ["Handstand Push-up", "Strict Handstand Push-up", "Wall-facing Handstand Push-up"],
      allowed: ["Handstand Hold", "Handstand Walk", "Wall Climb", "Shoulder Press", "Push-up", "Plank"],
    },
    {
      key: "hip_impingement",
      blocked: [
        "Back Squat", "Front Squat", "Kettlebell Goblet Squat", "Overhead Squat", "Thruster", "Wall Ball",
        "Squat Clean", "Squat Snatch", "Clean & Jerk",
        "Dumbbell Goblet Squat", "Dumbbell Front Squat", "Dumbbell Overhead Squat",
        "Dumbbell Squat Clean", "Dumbbell Squat Snatch",
      ],
      allowed: [
        "Air Squat", "Box Squat", "Step-up", "Deadlift", "Kettlebell Swing",
        "Power Clean", "Power Snatch", "Bike (Erg)", "Run",
        "Lunge", "Front Rack Lunge",
      ],
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
      blocked: [
        "Back Squat", "Thruster", "Wall Ball", "Box Jump", "Run", "Cluster",
        "Jumping Lunge", "Dumbbell Lunge", "Kettlebell Lunge", "Front Rack Lunge",
        "Back Rack Lunge", "Overhead Lunge", "Dumbbell Overhead Lunge",
        "Dumbbell Front Rack Lunge", "Sandbag Lunge", "D-Ball Squat",
      ],
      allowed: ["Air Squat", "Box Squat", "Step-up", "Bike (Erg)", "Row (Erg)", "Lunge"],
    },
    {
      key: "hamstring_strain",
      blocked: ["Deadlift", "Romanian Deadlift", "Dumbbell Deadlift", "Kettlebell Deadlift", "Kettlebell Swing", "Run", "Sandbag Clean", "D-Ball Ground-to-Overhead"],
      allowed: ["Bike (Erg)", "Air Squat", "Shoulder Press"],
    },
    {
      key: "calf_strain",
      blocked: ["Run", "Double-under", "Single-under", "Box Jump", "Jumping Lunge"],
      allowed: ["Bike (Erg)", "Row (Erg)", "Air Squat"],
    },
    {
      key: "pec_strain",
      blocked: ["Bench Press", "Dumbbell Bench Press", "Push-up", "Bar Muscle-up", "Ring Muscle-up", "Ring Dip"],
      allowed: ["Knee Push-up", "Ring Row", "Shoulder Press"],
    },
    {
      key: "biceps_strain",
      blocked: ["Pull-up", "Bar Muscle-up", "Ring Muscle-up", "Chest-to-Bar"],
      allowed: ["Ring Row", "Banded Pull-up", "Push-up"],
    },
    {
      key: "lat_strain",
      blocked: ["Pull-up", "Chest-to-Bar", "Bar Muscle-up", "Ring Muscle-up", "Toes-to-Bar", "Knees-to-Elbows"],
      allowed: ["Ring Row", "Banded Pull-up", "Dead Hang", "Hanging Knee Raise", "Bike (Erg)", "Plank"],
    },
    {
      key: "triceps_tendinopathy",
      blocked: [
        "Ring Dip", "Handstand Push-up", "Strict Handstand Push-up", "Wall-facing Handstand Push-up",
        "Bar Muscle-up", "Ring Muscle-up",
      ],
      allowed: ["Push-up", "Knee Push-up", "Shoulder Press", "Push Press", "Bench Press", "Ring Row", "Plank"],
    },
    {
      key: "no_hanging",
      blocked: [
        "Pull-up", "Banded Pull-up", "Bar Muscle-up", "Ring Muscle-up",
        "Toes-to-Bar", "Toes-to-Ring", "Hanging Knee Raise", "Chest-to-Bar", "Dead Hang",
        "Knees-to-Elbows", "Rope Climb", "Legless Rope Climb",
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

  it("running loads the quads and falls back to an erg that spares them", () => {
    expect(byName("Run").stresses.some((s) => s.site === "quads")).toBe(true);
    const usable = byName("Run")
      .substitutes.map(byName)
      .filter((m) => !matchesContraindication(m, injury("quad_strain")));
    expect(usable.map((m) => m.name)).toEqual(["Row (Erg)", "Bike (Erg)"]);
  });

  it("the bodyweight lunge survives every contraindication", () => {
    const lunge = byName("Lunge");
    for (const i of injuries) expect(matchesContraindication(lunge, i), i.injuryKey).toBe(false);
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
