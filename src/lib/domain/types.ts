import { z } from "zod";

export const LoadType = z.enum(["barbell", "bodyweight", "dumbbell", "machine", "kettlebell", "other"]);
export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);

export const MovementSchema = z.object({
  name: z.string().min(1),
  plane: z.string().min(1),
  jointStress: z.array(z.string()),
  loadType: LoadType,
  skill: SkillLevel,
  substitutes: z.array(z.string()),
});
export type Movement = z.infer<typeof MovementSchema>;

export const InjuryContraindicationSchema = z.object({
  injuryKey: z.string().min(1),
  label: z.string().min(1),
  avoidPatterns: z.array(z.string()),
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
