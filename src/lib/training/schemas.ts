import { z } from "zod";
import { isIsoDate, isMonday, isValidTimeZone } from "./dates";
import { TrainingError } from "./errors";

export const Scoring = z.enum(["none", "for_time", "amrap", "reps", "load", "calories", "distance", "max_time"]);
export type Scoring = z.infer<typeof Scoring>;
export const Division = z.enum(["rx", "scaled"]);
export type Division = z.infer<typeof Division>;
export const BLOCK_COLORS = ["neutral", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export const BlockColor = z.enum(BLOCK_COLORS);
export type BlockColor = z.infer<typeof BlockColor>;
export const Locale = z.enum(["es", "en"]);

/** Optional free text: trimmed, blank becomes null. */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
const Name = (max: number) => z.string().trim().min(1).max(max);
const IsoDateString = z.string().refine(isIsoDate, "invalid date");
const MondayDate = IsoDateString.refine(isMonday, "not a Monday");
const Weeks = z.number().int().min(1).max(52);

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
const VideoUrl = z.string().trim().nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isHttpsUrl(v), "https only");

export const ProgramCreateInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("continuous"), name: Name(80), description: optionalText(500), startDate: MondayDate }),
  z.object({ kind: z.literal("closed"), name: Name(80), description: optionalText(500), weeks: Weeks }),
]);
export type ProgramCreate = z.output<typeof ProgramCreateInput>;

export const ProgramUpdateInput = z.object({
  name: Name(80),
  description: optionalText(500),
  startDate: MondayDate.optional(),
  weeks: Weeks.optional(),
});
export type ProgramUpdate = z.output<typeof ProgramUpdateInput>;

export const BarbellSetSchema = z.object({
  reps: z.number().int().min(1).max(100),
  percent: z.number().positive().max(150).nullable(),
  kg: z.number().positive().max(500).nullable(),
}).refine((s) => (s.percent === null) !== (s.kg === null), "exactly one of percent or kg");
export type BarbellSet = z.output<typeof BarbellSetSchema>;

const blockCommon = {
  title: optionalText(120),
  color: BlockColor,
  coachingTips: optionalText(2000),
  videoUrl: VideoUrl,
};

export const BlockInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("custom"),
    ...blockCommon,
    description: z.string().trim().min(1).max(5000),
    scoring: Scoring,
    timeCapSeconds: z.number().int().min(1).max(7200).nullable(),
  }),
  z.object({
    kind: z.literal("barbell"),
    ...blockCommon,
    movement: z.string().trim().min(1).max(80),
    sets: z.array(BarbellSetSchema).min(1).max(20),
    instructions: optionalText(2000),
  }),
]).superRefine((b, ctx) => {
  if (b.kind === "custom" && b.scoring !== "for_time" && b.timeCapSeconds !== null) {
    ctx.addIssue({ code: "custom", message: "time cap only for for_time", path: ["timeCapSeconds"] });
  }
});
export type BlockInputValue = z.output<typeof BlockInput>;

export const OnboardingInput = z.object({ timezone: z.string().max(64) });

export const AthleteSettingsInput = z.object({
  displayName: Name(60),
  timezone: z.string().refine(isValidTimeZone, "invalid time zone"),
  locale: Locale,
});
export type AthleteSettings = z.output<typeof AthleteSettingsInput>;

/** Parses action input; any mismatch is an `invalid_request`, never a Zod message. */
export function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new TrainingError("invalid_request");
  return result.data;
}
