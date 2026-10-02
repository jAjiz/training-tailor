import { z } from "zod";

export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);
export type SkillLevel = z.infer<typeof SkillLevel>;

// An AND-set, matched by subset against the athlete's equipment. Empty = needs nothing.
export const Equipment = z.enum([
  "barbell",
  "dumbbell",
  "kettlebell",
  "pullup_bar",
  "rings",
  "box",
  "ramp",
  "bench",
  "ghd",
  "band",
  "rope",      // climbing rope
  "jump_rope",
  "rower",
  "ski_erg",   // upper-body pull ergometer (e.g. SkiErg)
  "bike",      // heavy flywheel cycle-ergometer, legs only (e.g. BikeErg)
  "air_bike",  // fan bike, arms and legs (e.g. Assault/Echo Bike)
  "wall_ball",
  "sandbag",
  "d_ball",    // dead ball: heavy non-bouncing ball, distinct from the light wall_ball
]);
export type Equipment = z.infer<typeof Equipment>;

// Ordered primary-first (e.g. Thruster = ["squat", "vertical_push"]).
export const MovementPattern = z.enum([
  "squat",
  "hinge",
  "lunge",
  "vertical_push",
  "horizontal_push",
  "vertical_pull",
  "horizontal_pull",
  "core",
  "carry", // locomotion while holding a loaded position
  "hold",  // isometric maintenance of a loaded position
  "olympic",
  "jump",
  "monostructural",
]);
export type MovementPattern = z.infer<typeof MovementPattern>;

export const Position = z.enum([
  "hanging",           // suspended from a bar or rings
  "inverted",          // bodyweight fully on the hands
  "partial_inversion", // head below the hips, load shared with the feet on a surface
  "supine",            // lying on the back under load or effort (bench, sit-up)
  "prone",             // chest/belly to the floor (burpee family, wall walk start)
]);
export type Position = z.infer<typeof Position>;

export const Site = z.enum([
  // joints & spine
  "shoulder", "elbow", "wrist", "neck", "lumbar", "hip", "knee", "ankle",
  // muscle groups
  "quads", "hamstrings", "calves", "hip_flexors", "chest", "biceps", "lats", "triceps", "abdominals",
  // hands & forearms: hanging traction, kipping friction, heavy carries
  "grip",
]);
export type Site = z.infer<typeof Site>;

// Limb groups for the laterality exemption; axial sites (neck, lumbar, abdominals) belong to neither.
export const UPPER_LIMB_SITES = ["shoulder", "elbow", "wrist", "grip", "chest", "biceps", "lats", "triceps"] as const satisfies readonly Site[];
export const LOWER_LIMB_SITES = ["hip", "knee", "ankle", "quads", "hamstrings", "calves", "hip_flexors"] as const satisfies readonly Site[];

// Clinically significant (loaded or forceful) stress only, so load is implied and
// a site merely participating in a movement is not listed.
export const StressMechanism = z.enum([
  "compression",
  "flexion",        // through mid-range
  "deep_flexion",   // end-range (a site gets flexion OR deep_flexion, never both)
  "extension",      // held extended under load (front rack, push-up wrist)
  "deep_extension", // end-range (a site gets extension OR deep_extension, never both)
  "overhead",
  "ballistic",      // explosive, high-velocity
  "impact",
  "traction",       // hanging/distraction
  "kipping",        // dynamic swinging while hanging
  "eccentric",      // forceful lengthening, or loading at long muscle length
]);
export type StressMechanism = z.infer<typeof StressMechanism>;

// "high" = clinically significant; "low" = the same mechanism at bodyweight/unloaded.
export const StressLoad = z.enum(["high", "low"]);
export type StressLoad = z.infer<typeof StressLoad>;

export const SiteStressSchema = z.object({
  site: Site,
  mechanisms: z.array(StressMechanism).min(1),
  load: StressLoad.default("high"),
});
export type SiteStress = z.infer<typeof SiteStressSchema>;

export const Limb = z.enum(["upper", "lower"]);
export type Limb = z.infer<typeof Limb>;

export const MovementSchema = z.object({
  name: z.string().min(1),
  patterns: z.array(MovementPattern).min(1),
  positions: z.array(Position),
  stresses: z.array(SiteStressSchema),
  equipment: z.array(Equipment),
  skill: SkillLevel,
  substitutes: z.array(z.string()),
  // Ingestion synonyms: shorthand a pasted workout may use for this movement.
  aliases: z.array(z.string()).default([]),
  // A standard single-limb variant keeps the stresses on the working side only.
  unilateral: Limb.nullable().default(null),
});
export type Movement = z.infer<typeof MovementSchema>;

export const Tier = z.enum(["avoid", "caution"]);
export type Tier = z.infer<typeof Tier>;

// injury: severity-scaled; limitation/condition: tiers apply as written.
export const ContraindicationKind = z.enum(["injury", "limitation", "condition"]);
export type ContraindicationKind = z.infer<typeof ContraindicationKind>;

export const StressRuleSchema = z.object({
  site: Site,
  mechanisms: z.array(StressMechanism).min(1),
  tier: Tier,
});
export type StressRule = z.infer<typeof StressRuleSchema>;

export const PositionRuleSchema = z.object({ position: Position, tier: Tier });
export type PositionRule = z.infer<typeof PositionRuleSchema>;

export const ContraindicationSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: ContraindicationKind,
  rules: z.array(StressRuleSchema),
  positionRules: z.array(PositionRuleSchema),
  // Escape hatch: each use signals a mechanism the vocabulary is missing.
  avoidMovements: z.array(z.string()),
  notes: z.string().nullable().optional(),
});
export type Contraindication = z.infer<typeof ContraindicationSchema>;

export const Side = z.enum(["left", "right", "both"]);
export type Side = z.infer<typeof Side>;

export const Severity = z.enum(["mild", "moderate", "acute"]);
export type Severity = z.infer<typeof Severity>;

export const StimulusDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});
export type StimulusDef = z.infer<typeof StimulusDefSchema>;

export const StimulusTaxonomySchema = z.object({
  qualities: z.array(StimulusDefSchema).min(1),
  energySystems: z.array(StimulusDefSchema).min(1),
  loadIntensities: z.array(StimulusDefSchema).min(1),
});
export type StimulusTaxonomy = z.infer<typeof StimulusTaxonomySchema>;

export const EffortUnit = z.enum(["meters", "calories", "reps"]);
export type EffortUnit = z.infer<typeof EffortUnit>;

export const EffortEquivalentSchema = z.object({
  movement: z.string().min(1),
  unit: EffortUnit,
  male: z.number().positive(),
  female: z.number().positive(),
});

export const EffortEquivalenceSchema = z.object({
  key: z.string().min(1),
  note: z.string().min(1),
  equivalents: z.array(EffortEquivalentSchema).min(2),
});

export const ImplementLoadSchema = z.object({
  from: Equipment,
  to: Equipment,
  perHandFraction: z.object({ low: z.number().positive(), high: z.number().positive() }),
  note: z.string().min(1),
});

export const ConversionsSchema = z.object({
  effort: z.array(EffortEquivalenceSchema),
  implementLoad: z.array(ImplementLoadSchema),
});
export type Conversions = z.infer<typeof ConversionsSchema>;
