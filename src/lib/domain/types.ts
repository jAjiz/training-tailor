import { z } from "zod";

export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);

// Equipment a movement requires — an AND-set matched by subset against the
// athlete's available equipment (empty = needs nothing). Drives availability
// filtering, NOT contraindication: a missing item filters substitution
// candidates, it does not hard-block like an injury. Values are added lazily,
// only when availability-relevant (don't model the floor or the wall).
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

// Functional movement pattern. Drives substitution and programming balance.
// Ordered primary-first on a movement (e.g. Thruster = ["squat", "vertical_push"]).
export const MovementPattern = z.enum([
  "squat",
  "hinge",
  "lunge",
  "vertical_push",
  "horizontal_push",
  "vertical_pull",
  "horizontal_pull",
  "core",
  "carry",
  "olympic",
  "jump",
  "monostructural",
]);

// Whole-body positional demand — a body position the movement requires, which
// an athlete can be categorically unable to adopt (cast, grip issue, vertigo,
// pregnancy) regardless of any specific injured tissue. Orthogonal to both
// patterns (what the movement trains) and stresses (what tissue it loads).
export const Position = z.enum([
  "hanging",  // suspended from a bar or rings
  "inverted", // upside down (handstand family)
]);

// Anatomical site: joints/spine regions plus muscle groups. Muscle sites are
// added as the injury catalog needs them.
export const Site = z.enum([
  // joints & spine
  "shoulder", "elbow", "wrist", "neck", "lumbar", "hip", "knee", "ankle",
  // muscle groups
  "quads", "hamstrings", "calves", "hip_flexors", "chest", "biceps",
]);

// How a site is stressed. Mechanisms describe clinically significant (loaded or
// forceful) stress — a site merely participating in a movement is not listed.
// Load is implied by that convention, so names don't repeat it.
export const StressMechanism = z.enum([
  "compression",  // axial/compressive loading
  "flexion",      // forceful or repetitive flexion through mid-range
  "deep_flexion", // end-range flexion (a site gets flexion OR deep_flexion, never both)
  "extension",    // held extended under load (front rack, push-up wrist)
  "overhead",     // loaded overhead
  "ballistic",    // explosive, high-velocity loading
  "impact",       // ground-reaction impact
  "traction",     // hanging/distraction
  "kipping",      // dynamic swinging while hanging
  "eccentric",    // forceful lengthening or loading at long muscle length
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
  // Site+mechanism rules matched against Movement.stresses (see matching.ts).
  avoidStresses: z.array(SiteStressSchema),
  // Positional restrictions matched against Movement.positions. Used by
  // limitation entries (e.g. no_hanging, no_inversion) that the LLM activates
  // from the athlete's situation; injuries may use them too where relevant.
  avoidPositions: z.array(Position),
  // Manual override for cases the stress vocabulary cannot capture; each use is
  // a signal a mechanism may be missing.
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
