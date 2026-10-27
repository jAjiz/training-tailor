import type { Prisma } from "@/generated/prisma/client";
import type { DomainLibrary, MovementRename } from "@/lib/domain/library";
import { hasErrors, validateLibrary, type LibraryFinding } from "@/lib/domain/validate-library";
import { AthleteProfileSchema, type AthleteProfile } from "@/lib/engine/types";
import { toJson } from "@/lib/json";
import { isLiftMovement } from "../barbell";
import { TrainingError } from "../errors";
import { writeAudit } from "./audit";
import { ensureState, lockState, readDraft } from "./library";
import type { Db, DbOrTx } from "./types";

export type PublishOutcome = { ok: true; number: number } | { ok: false; findings: LibraryFinding[] };

const referenceError = (code: string, ref: string, message: string): LibraryFinding =>
  ({ level: "error", code, entity: "reference", ref, message });

const rows = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

function renamed(name: string, renames: readonly MovementRename[]): string {
  return renames.reduce((current, r) => (current === r.from ? r.to : current), name);
}

function add(counts: Map<string, number>, name: string | null | undefined) {
  if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
}

async function storedProfiles(db: DbOrTx): Promise<{ id: string; profile: AthleteProfile }[]> {
  const all = await db.athleteProfile.findMany({ select: { id: true, data: true } });
  return all.flatMap(({ id, data }) => {
    const parsed = AthleteProfileSchema.safeParse(data);
    return parsed.success ? [{ id, profile: parsed.data }] : [];
  });
}

async function movementCounts(db: DbOrTx, profiles: { profile: AthleteProfile }[]) {
  const [prs, blocks] = await Promise.all([
    db.personalRecord.groupBy({ by: ["movement"], _count: { _all: true } }),
    db.block.groupBy({ by: ["movement"], where: { kind: "barbell" }, _count: { _all: true } }),
  ]);
  const lifts = new Map<string, number>();
  for (const row of [...prs, ...blocks]) {
    if (row.movement) lifts.set(row.movement, (lifts.get(row.movement) ?? 0) + row._count._all);
  }
  const all = new Map(lifts);
  for (const { profile } of profiles) {
    for (const b of profile.benchmarks) add(all, b.movement);
    for (const g of profile.goals) add(all, g.movement);
  }
  return { lifts, all };
}

/** Errors for stored rows (profiles, PRs, barbell blocks) the library would leave dangling. */
export async function referenceFindings(
  db: DbOrTx, library: DomainLibrary, renames: readonly MovementRename[],
): Promise<LibraryFinding[]> {
  const profiles = await storedProfiles(db);
  const { lifts, all } = await movementCounts(db, profiles);
  const findings: LibraryFinding[] = [];

  const keys = new Set(library.contraindications.map((c) => c.key));
  const injuries = new Map<string, number>();
  for (const { profile } of profiles) {
    for (const injury of profile.injuries) if (!keys.has(injury.key)) add(injuries, injury.key);
  }
  for (const [key, n] of injuries) {
    findings.push(referenceError(
      "contraindication_in_use", key, `"${key}" is used by ${rows(n)} in athlete profiles.`,
    ));
  }

  const names = new Set(library.movements.map((m) => m.name));
  for (const [name, n] of all) {
    if (names.has(renamed(name, renames))) continue;
    findings.push(referenceError(
      "movement_in_use", name, `"${name}" is used by ${rows(n)} (PRs, barbell blocks, profiles).`,
    ));
  }

  for (const [name, n] of lifts) {
    const target = renamed(name, renames);
    if (names.has(target) && !isLiftMovement(target, library.movements)) {
      findings.push(referenceError(
        "lift_in_use", target, `"${target}" has ${rows(n)} (PRs, barbell blocks) but is no longer a barbell movement.`,
      ));
    }
  }
  return findings;
}

async function applyRenames(tx: Prisma.TransactionClient, renames: readonly MovementRename[]) {
  for (const { from, to } of renames) {
    await tx.personalRecord.updateMany({ where: { movement: from }, data: { movement: to } });
    await tx.block.updateMany({ where: { kind: "barbell", movement: from }, data: { movement: to } });
  }
  for (const { id, profile } of await storedProfiles(tx)) {
    const benchmarks = profile.benchmarks.map((b) => ({ ...b, movement: renamed(b.movement, renames) }));
    const goals = profile.goals.map((g) => ({ ...g, movement: g.movement && renamed(g.movement, renames) }));
    const changed = benchmarks.some((b, i) => b.movement !== profile.benchmarks[i].movement)
      || goals.some((g, i) => g.movement !== profile.goals[i].movement);
    if (changed) {
      await tx.athleteProfile.update({ where: { id }, data: { data: toJson({ ...profile, benchmarks, goals }) } });
    }
  }
}

export async function publishDraft(
  db: Db, adminId: string, input: { revision: number; note: string; acceptWarnings: boolean },
): Promise<PublishOutcome> {
  return db.$transaction(async (tx) => {
    await ensureState(tx);
    await lockState(tx);
    const state = await tx.domainLibraryState.findUniqueOrThrow({ where: { id: 1 } });
    const draft = await readDraft(tx);
    if (!draft) throw new TrainingError("library_no_draft");
    if (draft.revision !== input.revision) throw new TrainingError("library_conflict");
    const row = await tx.domainLibraryVersion.findUniqueOrThrow({ where: { id: draft.id } });
    if (row.basedOnVersionId !== state.publishedVersionId) throw new TrainingError("library_conflict");
    const note = input.note.trim();
    if (!note) throw new TrainingError("invalid_request");

    const findings = [
      ...validateLibrary(draft.library),
      ...await referenceFindings(tx, draft.library, draft.renames),
    ];
    if (hasErrors(findings) || (findings.length > 0 && !input.acceptWarnings)) return { ok: false, findings };

    await applyRenames(tx, draft.renames);
    const { count } = await tx.domainLibraryVersion.updateMany({
      where: { id: draft.id, revision: input.revision },
      data: {
        publishedAt: new Date(), publishedByUserId: adminId, note, renames: [], revision: { increment: 1 },
      },
    });
    if (count === 0) throw new TrainingError("library_conflict");
    await tx.domainLibraryState.update({
      where: { id: 1 }, data: { publishedVersionId: draft.id, draftVersionId: null },
    });
    await writeAudit(tx, {
      actorUserId: adminId, action: "library.publish", targetType: "library", targetId: draft.id,
      targetLabel: `v${draft.number}`, details: { number: draft.number, note },
    });
    return { ok: true, number: draft.number };
  });
}
