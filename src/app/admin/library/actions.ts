"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { LIBRARY_DOCUMENTS } from "@/lib/domain/library";
import {
  deleteContraindication, deleteMovement, discardDraft, importLibrary, openDraft, renameMovement, restoreVersion,
  saveContraindication, saveDocument, saveMovement,
} from "@/lib/training/services/library";
import { publishDraft, type PublishOutcome } from "@/lib/training/services/library-publish";

const Revision = z.number().int().nonnegative();
const Note = z.string().max(500);
const Version = z.number().int().positive();
const ImportFile = z.string().max(2_000_000);
const EntryJson = z.string().max(200_000);
const EntryName = z.string().min(1).max(200);
const Document = z.enum(LIBRARY_DOCUMENTS);

const revalidateLibrary = () => revalidatePath("/admin/library", "layout");

export async function publishLibraryAction(revision: unknown, note: unknown, acceptWarnings: unknown): Promise<ActionResult<PublishOutcome>> {
  return runAction("publishLibraryAction", async () => {
    const admin = await requireAdmin();
    const outcome = await publishDraft(prisma, admin.id, {
      revision: parse(Revision, revision), note: parse(Note, note), acceptWarnings: parse(z.boolean(), acceptWarnings),
    });
    if (outcome.ok) revalidateLibrary();
    return outcome;
  });
}

export async function discardLibraryDraftAction(): Promise<ActionResult> {
  return runAction("discardLibraryDraftAction", async () => {
    const admin = await requireAdmin();
    await discardDraft(prisma, admin.id);
    revalidateLibrary();
  });
}

export async function importLibraryAction(json: unknown): Promise<ActionResult> {
  return runAction("importLibraryAction", async () => {
    const admin = await requireAdmin();
    const text = parse(ImportFile, json);
    let file: unknown;
    try {
      file = JSON.parse(text);
    } catch {
      throw new TrainingError("library_invalid");
    }
    await importLibrary(prisma, admin.id, file);
    revalidateLibrary();
  });
}

export async function restoreLibraryVersionAction(number: unknown): Promise<ActionResult> {
  return runAction("restoreLibraryVersionAction", async () => {
    const admin = await requireAdmin();
    await restoreVersion(prisma, admin.id, parse(Version, number));
    revalidateLibrary();
  });
}

function parseJson(json: unknown): unknown {
  const text = parse(EntryJson, json);
  try {
    return JSON.parse(text);
  } catch {
    throw new TrainingError("library_invalid");
  }
}

/** Runs one edit of the draft and reports the draft's new revision. */
function editDraft(name: string, edit: (adminId: string) => Promise<number>): Promise<ActionResult<{ revision: number }>> {
  return runAction(name, async () => {
    const admin = await requireAdmin();
    const revision = await edit(admin.id);
    revalidateLibrary();
    return { revision };
  });
}

export async function openLibraryDraftAction(): Promise<ActionResult> {
  return runAction("openLibraryDraftAction", async () => {
    const admin = await requireAdmin();
    await openDraft(prisma, admin.id);
    revalidateLibrary();
  });
}

export async function saveMovementAction(revision: unknown, originalName: unknown, json: unknown) {
  return editDraft("saveMovementAction", (id) => saveMovement(prisma, id, {
    revision: parse(Revision, revision), originalName: parse(EntryName.nullable(), originalName), movement: parseJson(json),
  }));
}

export async function deleteMovementAction(revision: unknown, name: unknown) {
  return editDraft("deleteMovementAction", (id) => deleteMovement(prisma, id, {
    revision: parse(Revision, revision), name: parse(EntryName, name),
  }));
}

export async function renameMovementAction(revision: unknown, from: unknown, to: unknown) {
  return editDraft("renameMovementAction", (id) => renameMovement(prisma, id, {
    revision: parse(Revision, revision), from: parse(EntryName, from), to: parse(EntryName, to),
  }));
}

export async function saveContraindicationAction(revision: unknown, originalKey: unknown, json: unknown) {
  return editDraft("saveContraindicationAction", (id) => saveContraindication(prisma, id, {
    revision: parse(Revision, revision), originalKey: parse(EntryName.nullable(), originalKey), contraindication: parseJson(json),
  }));
}

export async function deleteContraindicationAction(revision: unknown, key: unknown) {
  return editDraft("deleteContraindicationAction", (id) => deleteContraindication(prisma, id, {
    revision: parse(Revision, revision), key: parse(EntryName, key),
  }));
}

export async function saveDocumentAction(revision: unknown, document: unknown, json: unknown) {
  return editDraft("saveDocumentAction", (id) => saveDocument(prisma, id, {
    revision: parse(Revision, revision), document: parse(Document, document), value: parseJson(json),
  }));
}
