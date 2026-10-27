import { cache } from "react";
import { prisma } from "@/lib/db";
import { libraryOf } from "@/lib/training/services/library";
import type { DbOrTx } from "@/lib/training/services/types";
import { createLibraryReader } from "./library-reader";
import type { DomainData } from "./library";

export type { DomainData };

const readLibrary = createLibraryReader({
  async publishedId(db) {
    const state = await db.domainLibraryState.findUnique({ where: { id: 1 } });
    return state?.publishedVersionId ?? null;
  },
  async load(db, id) {
    const row = await db.domainLibraryVersion.findUniqueOrThrow({ where: { id } });
    return { number: row.number, library: libraryOf(row) };
  },
});

// Reads the published pointer once per request; the reader itself keeps the library across requests.
const readForRequest = cache(readLibrary);

export async function getDomainData(db: DbOrTx = prisma): Promise<DomainData> {
  return (await readForRequest(db)).domain;
}

export async function getPublishedLibraryVersion(db: DbOrTx = prisma): Promise<number> {
  return (await readForRequest(db)).version;
}
