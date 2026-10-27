import { prisma } from "@/lib/db";
import type { DomainLibrary } from "@/lib/domain/library";
import { liveLibrary, readDraft, type Draft } from "@/lib/training/services/library";

export type LibraryView = { library: DomainLibrary; draft: Draft | null };

/** The draft when one is open, otherwise the live version (read-only). Never creates a draft. */
export async function loadLibraryView(): Promise<LibraryView> {
  const draft = await readDraft(prisma);
  return { draft, library: draft ? draft.library : await liveLibrary(prisma) };
}
