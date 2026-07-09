import { z } from "zod";

export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);

// An AND-set, matched by subset against the athlete's equipment. Empty = needs nothing.
export const Equipment = z.enum([
  "barbell",
  "dumbbell",
  "kettlebell",
  "pullup_bar",
  "rings",
  "box",
  "bench",
  "band",
  "jump_rope",
  "rower",
  "bike",
  "wall_ball",
]);

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

export const Position = z.enum([
  "hanging",           // suspended from a bar or rings
  "inverted",          // bodyweight fully on the hands
  "partial_inversion", // head below the hips, load shared with the feet on a surface
]);

export const Site = z.enum([
  // joints & spine
  "shoulder", "elbow", "wrist", "neck", "lumbar", "hip", "knee", "ankle",
  // muscle groups
  "quads", "hamstrings", "calves", "hip_flexors", "chest", "biceps",
]);

// Clinically significant (loaded or forceful) stress only, so load is implied and
// a site merely participating in a movement is not listed.
export const StressMechanism = z.enum([
  "compression",
  "flexion",      // through mid-range
  "deep_flexion", // end-range (a site gets flexion OR deep_flexion, never both)
  "extension",    // held extended under load (front rack, push-up wrist)
  "overhead",
  "ballistic",    // explosive, high-velocity
  "impact",
  "traction",     // hanging/distraction
  "kipping",      // dynamic swinging while hanging
  "eccentric",    // forceful lengthening, or loading at long muscle length
]);

export const SiteStressSchema = z.object({
  site: Site,
  mechanisms: z.array(StressMechanism).min(1),
});
export type SiteStress = z.infer<typeof SiteStressSchema>;

export const MovementSchema = z.object({
  name: z.string().min(1),
  patterns: z.array(MovementPattern).min(1),
  positions: z.array(Position),
  stresses: z.array(SiteStressSchema),
  equipment: z.array(Equipment),
  skill: SkillLevel,
  substitutes: z.array(z.string()),
});
export type Movement = z.infer<typeof MovementSchema>;

export const InjuryContraindicationSchema = z.object({
  injuryKey: z.string().min(1),
  label: z.string().min(1),
  avoidStresses: z.array(SiteStressSchema),
  avoidPositions: z.array(Position),
  // Escape hatch: each use signals a mechanism the vocabulary is missing.
  avoidMovements: z.array(z.string()),
  notes: z.string().nullable().optional(),
});
export type InjuryContraindication = z.infer<typeof InjuryContraindicationSchema>;

export const StimulusDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});
export type StimulusDef = z.infer<typeof StimulusDefSchema>;
