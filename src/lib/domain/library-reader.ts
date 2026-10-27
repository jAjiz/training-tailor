import type { DbOrTx } from "@/lib/training/services/types";
import type { DomainData, DomainLibrary } from "./library";
import { toDomainData } from "./library";

export class LibraryUnavailableError extends Error {
  constructor() {
    super("No published domain library: publish one in /admin/library");
    this.name = "LibraryUnavailableError";
  }
}

export interface LibrarySource {
  publishedId(db: DbOrTx): Promise<string | null>;
  load(db: DbOrTx, id: string): Promise<{ number: number; library: DomainLibrary }>;
}

export interface LoadedDomain {
  domain: DomainData;
  version: number;
}

/**
 * Reads the published library, keeping the latest one in memory by version id.
 * Concurrent callers share one load; a failed load is dropped so the next call retries.
 */
export function createLibraryReader(source: LibrarySource): (db: DbOrTx) => Promise<LoadedDomain> {
  let cached: { id: string; promise: Promise<LoadedDomain> } | null = null;

  return async (db) => {
    const id = await source.publishedId(db);
    if (id === null) throw new LibraryUnavailableError();
    if (cached?.id === id) return cached.promise;
    const promise = source.load(db, id).then(({ number, library }) => ({ domain: toDomainData(library), version: number }));
    const entry = { id, promise };
    cached = entry;
    promise.catch(() => {
      if (cached === entry) cached = null;
    });
    return promise;
  };
}
