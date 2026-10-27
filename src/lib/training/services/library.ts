import { z } from "zod";
import type { DomainLibraryVersion, Prisma } from "@/generated/prisma/client";
import {
  DomainLibrarySchema, LibraryExportSchema, MovementRenameSchema, emptyLibrary,
  type DomainLibrary, type LibraryDocument, type LibraryExport, type LibraryExpectation, type MovementRename,
} from "@/lib/domain/library";
import { ContraindicationSchema, MovementSchema } from "@/lib/domain/types";
import { toJson } from "@/lib/json";
import { TrainingError } from "../errors";
import { writeAudit } from "./audit";
import type { Db, DbOrTx } from "./types";

export interface VersionSummary {
  id: string;
  number: number;
  note: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  state: "live" | "draft" | "archived";
}

export interface Draft {
  id: string;
  number: number;
  revision: number;
  basedOnNumber: number | null;
  library: DomainLibrary;
  renames: MovementRename[];
}

const RenamesSchema = z.array(MovementRenameSchema);

export async function ensureState(db: DbOrTx): Promise<void> {
  await db.domainLibraryState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

/** Serialises writers of the state row (publish, discard) until the transaction ends. */
export async function lockState(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DomainLibraryState" WHERE id = 1 FOR UPDATE`;
}

export function libraryOf(row: DomainLibraryVersion): DomainLibrary {
  return DomainLibrarySchema.parse({
    movements: row.movements,
    contraindications: row.contraindications,
    taxonomy: row.taxonomy,
    conversions: row.conversions,
    expectations: row.expectations,
    evalCases: row.evalCases,
  });
}

function libraryColumns(library: DomainLibrary) {
  return {
    movements: toJson(library.movements),
    contraindications: toJson(library.contraindications),
    taxonomy: toJson(library.taxonomy),
    conversions: toJson(library.conversions),
    expectations: toJson(library.expectations),
    evalCases: toJson(library.evalCases),
  };
}

function summary(row: DomainLibraryVersion, state: VersionSummary["state"]): VersionSummary {
  return {
    id: row.id,
    number: row.number,
    note: row.note,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    publishedByUserId: row.publishedByUserId,
    state,
  };
}

export async function libraryOverview(db: Db): Promise<{
  live: VersionSummary | null; draft: VersionSummary | null; lastExportedAt: Date | null;
}> {
  const state = await db.domainLibraryState.findUnique({ where: { id: 1 } });
  const [live, draft] = await Promise.all([
    state?.publishedVersionId ? db.domainLibraryVersion.findUnique({ where: { id: state.publishedVersionId } }) : null,
    state?.draftVersionId ? db.domainLibraryVersion.findUnique({ where: { id: state.draftVersionId } }) : null,
  ]);
  return {
    live: live && summary(live, "live"),
    draft: draft && summary(draft, "draft"),
    lastExportedAt: state?.lastExportedAt ?? null,
  };
}

export async function listVersions(db: Db): Promise<VersionSummary[]> {
  const [state, rows] = await Promise.all([
    db.domainLibraryState.findUnique({ where: { id: 1 } }),
    db.domainLibraryVersion.findMany({ orderBy: { number: "desc" } }),
  ]);
  return rows.map((row) => summary(
    row,
    row.id === state?.publishedVersionId ? "live" : row.id === state?.draftVersionId ? "draft" : "archived",
  ));
}

export async function readDraft(db: DbOrTx): Promise<Draft | null> {
  const state = await db.domainLibraryState.findUnique({ where: { id: 1 } });
  if (!state?.draftVersionId) return null;
  const row = await db.domainLibraryVersion.findUnique({ where: { id: state.draftVersionId } });
  if (!row) return null;
  const based = row.basedOnVersionId
    ? await db.domainLibraryVersion.findUnique({ where: { id: row.basedOnVersionId }, select: { number: true } })
    : null;
  return {
    id: row.id,
    number: row.number,
    revision: row.revision,
    basedOnNumber: based?.number ?? null,
    library: libraryOf(row),
    renames: RenamesSchema.parse(row.renames),
  };
}

async function createDraft(
  tx: Prisma.TransactionClient, adminId: string, library: DomainLibrary,
): Promise<Draft> {
  const state = await tx.domainLibraryState.findUniqueOrThrow({ where: { id: 1 } });
  const top = await tx.domainLibraryVersion.aggregate({ _max: { number: true } });
  const row = await tx.domainLibraryVersion.create({
    data: {
      number: (top._max.number ?? 0) + 1,
      basedOnVersionId: state.publishedVersionId,
      createdByUserId: adminId,
      ...libraryColumns(library),
    },
  });
  await tx.domainLibraryState.update({ where: { id: 1 }, data: { draftVersionId: row.id } });
  const draft = await readDraft(tx);
  if (!draft) throw new TrainingError("internal");
  return draft;
}

/** Runs a draft-creating step once it is known that no draft is open. */
async function withNewDraft(
  db: Db, adminId: string, action: string,
  build: (tx: Prisma.TransactionClient) => Promise<DomainLibrary>,
  extra: Record<string, string | number> = {},
): Promise<Draft> {
  return db.$transaction(async (tx) => {
    await ensureState(tx);
    if (await readDraft(tx)) throw new TrainingError("library_draft_exists");
    const draft = await createDraft(tx, adminId, await build(tx));
    await writeAudit(tx, {
      actorUserId: adminId, action, targetType: "library", targetId: draft.id,
      targetLabel: `v${draft.number}`, details: { number: draft.number, ...extra },
    });
    return draft;
  });
}

/** The published library, or an empty one while nothing is published. */
export async function liveLibrary(tx: DbOrTx): Promise<DomainLibrary> {
  const state = await tx.domainLibraryState.findUnique({ where: { id: 1 } });
  const live = state?.publishedVersionId
    ? await tx.domainLibraryVersion.findUnique({ where: { id: state.publishedVersionId } })
    : null;
  return live ? libraryOf(live) : emptyLibrary();
}

export async function openDraft(db: Db, adminId: string): Promise<Draft> {
  return db.$transaction(async (tx) => {
    await ensureState(tx);
    return (await readDraft(tx)) ?? createDraft(tx, adminId, await liveLibrary(tx));
  });
}

async function updateDraft(
  db: DbOrTx, revision: number,
  fn: (draft: Draft) => { library: DomainLibrary; renames?: MovementRename[] },
): Promise<number> {
  const draft = await readDraft(db);
  if (!draft) throw new TrainingError("library_no_draft");
  if (draft.revision !== revision) throw new TrainingError("library_conflict");
  const next = fn(draft);
  const { count } = await db.domainLibraryVersion.updateMany({
    where: { id: draft.id, revision, publishedAt: null },
    data: {
      ...libraryColumns(next.library),
      ...(next.renames ? { renames: toJson(next.renames) } : {}),
      revision: { increment: 1 },
    },
  });
  if (count === 0) throw new TrainingError("library_conflict");
  return revision + 1;
}

const MAX_ISSUES = 5;

/** The first few schema issues as "path: message". */
function issuesOf(error: z.ZodError): string[] {
  return error.issues.slice(0, MAX_ISSUES).map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

function parseEntry<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new TrainingError("library_invalid", issuesOf(parsed.error));
  return parsed.data;
}

export async function saveMovement(
  db: Db, _adminId: string, input: { revision: number; originalName: string | null; movement: unknown },
): Promise<number> {
  const movement = parseEntry(MovementSchema, input.movement);
  return updateDraft(db, input.revision, ({ library }) => {
    if (input.originalName === null) {
      return { library: { ...library, movements: [...library.movements, movement] } };
    }
    if (movement.name !== input.originalName) throw new TrainingError("invalid_request");
    const at = library.movements.findIndex((m) => m.name === input.originalName);
    if (at < 0) throw new TrainingError("not_found");
    const movements = library.movements.map((m, i) => (i === at ? movement : m));
    return { library: { ...library, movements } };
  });
}

export async function deleteMovement(
  db: Db, _adminId: string, input: { revision: number; name: string },
): Promise<number> {
  return updateDraft(db, input.revision, ({ library }) => {
    if (!library.movements.some((m) => m.name === input.name)) throw new TrainingError("not_found");
    return { library: { ...library, movements: library.movements.filter((m) => m.name !== input.name) } };
  });
}

function renameIn(names: string[], from: string, to: string): string[] {
  return names.map((n) => (n === from ? to : n));
}

function renameInExpectation(e: LibraryExpectation, from: string, to: string): LibraryExpectation {
  const list = (names: string[] | undefined) => names && renameIn(names, from, to);
  if (e.kind === "verdict") return { ...e, movements: renameIn(e.movements, from, to) };
  const moved = e.movement === from ? { ...e, movement: to } : e;
  if (moved.kind === "substitutes") {
    return { ...moved, startsWith: list(moved.startsWith), includes: list(moved.includes) };
  }
  if (moved.kind === "candidates") {
    return {
      ...moved,
      first: moved.first === from ? to : moved.first,
      includes: list(moved.includes),
      excludes: list(moved.excludes),
    };
  }
  return moved;
}

export async function renameMovement(
  db: Db, adminId: string, input: { revision: number; from: string; to: string },
): Promise<number> {
  const { from, to } = parseEntry(MovementRenameSchema, { from: input.from, to: input.to });
  if (from === to) throw new TrainingError("invalid_request");
  return db.$transaction(async (tx) => {
    let number = 0;
    const revision = await updateDraft(tx, input.revision, (draft) => {
      const { library } = draft;
      if (!library.movements.some((m) => m.name === from)) throw new TrainingError("not_found");
      number = draft.number;
      const movements = library.movements.map((m) => {
        const substitutes = renameIn(m.substitutes, from, to);
        if (m.name !== from) return { ...m, substitutes };
        return { ...m, name: to, substitutes, aliases: m.aliases.includes(from) ? m.aliases : [...m.aliases, from] };
      });
      return {
        library: {
          ...library,
          movements,
          contraindications: library.contraindications.map((c) => ({
            ...c, avoidMovements: renameIn(c.avoidMovements, from, to),
          })),
          conversions: {
            ...library.conversions,
            effort: library.conversions.effort.map((c) => ({
              ...c,
              equivalents: c.equivalents.map((q) => (q.movement === from ? { ...q, movement: to } : q)),
            })),
          },
          expectations: library.expectations.map((e) => renameInExpectation(e, from, to)),
        },
        renames: [...draft.renames, { from, to }],
      };
    });
    await writeAudit(tx, {
      actorUserId: adminId, action: "library.rename", targetType: "library",
      targetLabel: `v${number}`, details: { number, from, to },
    });
    return revision;
  });
}

export async function saveContraindication(
  db: Db, _adminId: string,
  input: { revision: number; originalKey: string | null; contraindication: unknown },
): Promise<number> {
  const contraindication = parseEntry(ContraindicationSchema, input.contraindication);
  return updateDraft(db, input.revision, ({ library }) => {
    if (input.originalKey === null) {
      return { library: { ...library, contraindications: [...library.contraindications, contraindication] } };
    }
    const at = library.contraindications.findIndex((c) => c.key === input.originalKey);
    if (at < 0) throw new TrainingError("not_found");
    const contraindications = library.contraindications.map((c, i) => (i === at ? contraindication : c));
    return { library: { ...library, contraindications } };
  });
}

export async function deleteContraindication(
  db: Db, _adminId: string, input: { revision: number; key: string },
): Promise<number> {
  return updateDraft(db, input.revision, ({ library }) => {
    if (!library.contraindications.some((c) => c.key === input.key)) throw new TrainingError("not_found");
    return {
      library: { ...library, contraindications: library.contraindications.filter((c) => c.key !== input.key) },
    };
  });
}

export async function saveDocument(
  db: Db, _adminId: string, input: { revision: number; document: LibraryDocument; value: unknown },
): Promise<number> {
  const value = parseEntry(DomainLibrarySchema.shape[input.document] as z.ZodType<unknown>, input.value);
  return updateDraft(db, input.revision, ({ library }) => ({
    library: { ...library, [input.document]: value },
  }));
}

export async function discardDraft(db: Db, adminId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockState(tx);
    const draft = await readDraft(tx);
    if (!draft) throw new TrainingError("library_no_draft");
    await tx.domainLibraryState.update({ where: { id: 1 }, data: { draftVersionId: null } });
    const { count } = await tx.domainLibraryVersion.deleteMany({ where: { id: draft.id, publishedAt: null } });
    if (count === 0) throw new TrainingError("library_no_draft");
    await writeAudit(tx, {
      actorUserId: adminId, action: "library.discard", targetType: "library",
      targetLabel: `v${draft.number}`, details: { number: draft.number },
    });
  });
}

export async function restoreVersion(db: Db, adminId: string, number: number): Promise<Draft> {
  return withNewDraft(db, adminId, "library.restore", async (tx) => {
    const row = await tx.domainLibraryVersion.findUnique({ where: { number } });
    if (!row) throw new TrainingError("not_found");
    return libraryOf(row);
  }, { restoredFrom: number });
}

export async function importLibrary(db: Db, adminId: string, file: unknown): Promise<Draft> {
  const parsed = LibraryExportSchema.safeParse(file);
  return withNewDraft(db, adminId, "library.import", async () => {
    if (!parsed.success) throw new TrainingError("library_invalid", issuesOf(parsed.error));
    return parsed.data.library;
  });
}

export async function exportVersion(db: Db, number: number): Promise<LibraryExport> {
  const row = await db.domainLibraryVersion.findUnique({ where: { number } });
  if (!row) throw new TrainingError("not_found");
  await ensureState(db);
  const exportedAt = new Date();
  await db.domainLibraryState.update({ where: { id: 1 }, data: { lastExportedAt: exportedAt } });
  return { format: 1, number: row.number, exportedAt: exportedAt.toISOString(), library: libraryOf(row) };
}
