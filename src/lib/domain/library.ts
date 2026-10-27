import { z } from "zod";
import { EvalCaseSchema } from "@/lib/eval/grade";
import {
  ContraindicationSchema, ConversionsSchema, Equipment, MovementSchema, Severity, Side, Site,
  StimulusDefSchema, StressMechanism,
  type Contraindication, type Conversions, type Movement, type StimulusTaxonomy,
} from "./types";

export interface DomainData {
  movements: Movement[];
  contraindications: Contraindication[];
  taxonomy: StimulusTaxonomy;
  conversions: Conversions;
}

const note = z.string().optional();

const VerdictExpectation = z.object({
  kind: z.literal("verdict"),
  contraindication: z.string().min(1),
  severity: Severity.default("moderate"),
  side: Side.nullable().default(null),
  movements: z.array(z.string().min(1)).min(1),
  is: z.enum(["ok", "caution", "avoid", "not_avoid"]),
  note,
});

const SubstitutesExpectation = z.object({
  kind: z.literal("substitutes"),
  movement: z.string().min(1),
  startsWith: z.array(z.string().min(1)).optional(),
  includes: z.array(z.string().min(1)).optional(),
  note,
}).refine((e) => e.startsWith !== undefined || e.includes !== undefined, {
  message: "needs startsWith or includes",
});

const StressExpectation = z.object({
  kind: z.literal("stress"),
  movement: z.string().min(1),
  site: Site,
  mechanism: StressMechanism.optional(),
  present: z.boolean(),
  note,
});

const FieldExpectation = z.object({
  kind: z.literal("field"),
  movement: z.string().min(1),
  field: z.enum(["equipment", "patterns", "positions"]),
  equals: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  note,
}).refine((e) => e.equals !== undefined || e.includes !== undefined, {
  message: "needs equals or includes",
});

const ResolvesExpectation = z.object({
  kind: z.literal("resolves"),
  text: z.string().min(1),
  movement: z.string().min(1),
  note,
});

const CandidatesExpectation = z.object({
  kind: z.literal("candidates"),
  movement: z.string().min(1),
  conditions: z.array(z.object({
    key: z.string().min(1),
    severity: Severity.default("moderate"),
    side: Side.nullable().default(null),
  })),
  // null is the full box.
  equipment: z.array(Equipment).nullable().default(null),
  first: z.string().min(1).optional(),
  includes: z.array(z.string().min(1)).optional(),
  excludes: z.array(z.string().min(1)).optional(),
  note,
}).refine((e) => e.first !== undefined || e.includes !== undefined || e.excludes !== undefined, {
  message: "needs first, includes or excludes",
});

export const LibraryExpectationSchema = z.discriminatedUnion("kind", [
  VerdictExpectation, SubstitutesExpectation, StressExpectation,
  FieldExpectation, ResolvesExpectation, CandidatesExpectation,
]);
export type LibraryExpectation = z.infer<typeof LibraryExpectationSchema>;

export const MovementRenameSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });
export type MovementRename = z.infer<typeof MovementRenameSchema>;

// A draft library may hold empty taxonomy lists; the validator decides what is publishable.
const LibraryTaxonomySchema = z.object({
  qualities: z.array(StimulusDefSchema),
  energySystems: z.array(StimulusDefSchema),
  loadIntensities: z.array(StimulusDefSchema),
});

export const DomainLibrarySchema = z.object({
  movements: z.array(MovementSchema),
  contraindications: z.array(ContraindicationSchema),
  taxonomy: LibraryTaxonomySchema,
  conversions: ConversionsSchema,
  expectations: z.array(LibraryExpectationSchema),
  evalCases: z.array(EvalCaseSchema),
});
export type DomainLibrary = z.infer<typeof DomainLibrarySchema>;

export const LibraryExportSchema = z.object({
  format: z.literal(1),
  number: z.number().int().positive().nullable(),
  exportedAt: z.iso.datetime(),
  library: DomainLibrarySchema,
});
export type LibraryExport = z.infer<typeof LibraryExportSchema>;

export const LIBRARY_DOCUMENTS = ["taxonomy", "conversions", "expectations", "evalCases"] as const;
export type LibraryDocument = (typeof LIBRARY_DOCUMENTS)[number];

export function toDomainData(library: DomainLibrary): DomainData {
  const { movements, contraindications, taxonomy, conversions } = library;
  return { movements, contraindications, taxonomy, conversions };
}

export function emptyLibrary(): DomainLibrary {
  return {
    movements: [],
    contraindications: [],
    taxonomy: { qualities: [], energySystems: [], loadIntensities: [] },
    conversions: { effort: [], implementLoad: [] },
    expectations: [],
    evalCases: [],
  };
}
