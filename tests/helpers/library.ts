import sampleJson from "../../data/sample/library.json";
import { LibraryExportSchema, type DomainLibrary } from "@/lib/domain/library";
import { importLibrary } from "@/lib/training/services/library";
import { publishDraft } from "@/lib/training/services/library-publish";
import type { Db } from "@/lib/training/services/types";

const sample = LibraryExportSchema.parse(sampleJson).library;

export function sampleLibrary(): DomainLibrary {
  return structuredClone(sample);
}

// Version rows keep no foreign key to the user, so seeding needs no admin row.
const SEED_ADMIN = "test-seed";

/** Imports and publishes `library` through the services, as an admin would. */
export async function seedLibrary(db: Db, library: DomainLibrary): Promise<void> {
  const draft = await importLibrary(db, SEED_ADMIN, {
    format: 1, number: null, exportedAt: new Date().toISOString(), library,
  });
  const outcome = await publishDraft(db, SEED_ADMIN, { revision: draft.revision, note: "Test seed", acceptWarnings: true });
  if (!outcome.ok) throw new Error(`seedLibrary: ${outcome.findings.map((f) => f.message).join("; ")}`);
}
