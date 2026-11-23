import { intent, type NotificationIntent } from "@/lib/notifications/notify";
import type { StripeGateway } from "@/lib/stripe/gateway";
import { TrainingError } from "../errors";
import { refreshProgramAccess } from "./access-store";
import { writeAudit } from "./audit";
import { activeAthleteRecipients, deleteAudienceData } from "./notifications";
import { endSubscriptions } from "./payments";
import { newInviteCode } from "./programs";
import type { Db, DbOrTx } from "./types";

/** For the admin:grant script, so the actor is `null`. */
export async function grantAdmin(db: Db, email: string): Promise<"granted" | "not_found"> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user) return "not_found";
    await tx.user.update({ where: { id: user.id }, data: { role: "admin" } });
    await writeAudit(tx, {
      actorUserId: null, action: "admin.grant", targetUserId: user.id, targetType: "user", targetId: user.id, targetLabel: user.email,
    });
    return "granted";
  });
}

export type CoachTransition = "approve" | "reject" | "suspend" | "enable";

const TRANSITIONS: Record<CoachTransition, { from: string[]; to: string }> = {
  approve: { from: ["pending", "rejected"], to: "approved" },
  reject: { from: ["pending"], to: "rejected" },
  suspend: { from: ["approved"], to: "suspended" },
  enable: { from: ["suspended"], to: "approved" },
};

/** `actor` is the admin's user id, `null` for the coach:approve script. */
export async function changeCoachStatus(
  db: Db, actor: string | null, coachId: string, to: CoachTransition,
): Promise<NotificationIntent[]> {
  const { from, to: status } = TRANSITIONS[to];
  return db.$transaction(async (tx) => {
    const coach = await tx.coachAccount.findUnique({ where: { id: coachId }, include: { user: true } });
    if (!coach) throw new TrainingError("not_found");
    if (!from.includes(coach.status)) throw new TrainingError("invalid_status_change");
    await tx.coachAccount.update({ where: { id: coachId }, data: { status } });
    await writeAudit(tx, {
      actorUserId: actor, action: `coach.${to}`, targetUserId: coach.userId, targetType: "coach",
      targetId: coach.id, targetLabel: coach.user.email,
    });
    // The coach is not approved yet when this goes out, so the recipient is built directly.
    return to === "approve" ? [intent("coach_approved", [{ userId: coach.userId, locale: coach.locale }], {})] : [];
  });
}

/** The coach-level switch for AI tailoring; programs can only turn it on under an enabled coach. */
export async function setCoachTailoring(db: Db, actor: string, coachId: string, enabled: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const coach = await tx.coachAccount.findUnique({ where: { id: coachId }, include: { user: true } });
    if (!coach) throw new TrainingError("not_found");
    await tx.coachAccount.update({ where: { id: coachId }, data: { tailoringEnabled: enabled } });
    await writeAudit(tx, {
      actorUserId: actor, action: enabled ? "coach.tailoring_on" : "coach.tailoring_off", targetUserId: coach.userId,
      targetType: "coach", targetId: coach.id, targetLabel: coach.user.email,
    });
  });
}

export async function approveCoach(
  db: Db, email: string,
): Promise<{ outcome: "approved" | "not_found"; intents: NotificationIntent[] }> {
  const user = await db.user.findUnique({ where: { email }, include: { coachAccount: true } });
  if (!user?.coachAccount) return { outcome: "not_found", intents: [] };
  if (user.coachAccount.status === "approved") return { outcome: "approved", intents: [] };
  return { outcome: "approved", intents: await changeCoachStatus(db, null, user.coachAccount.id, "approve") };
}

export type CoachDeletionPreview = {
  programsKept: number; programsDeleted: number; athletesEnrolled: number; resultsDeleted: number;
};

/** What deleting the coach would remove, and the ids to remove. */
async function planCoachDeletion(db: DbOrTx, coachId: string) {
  const programs = await db.program.findMany({
    where: { coachId },
    select: {
      id: true, kind: true, publishedAt: true,
      weeksPublished: { select: { weekIndex: true } },
      blocks: { select: { id: true, dayIndex: true } },
    },
  });
  const deletedProgramIds = programs.filter((p) => p.kind === "closed" && !p.publishedAt).map((p) => p.id);
  // Continuous programs: a block is on week floor(dayIndex / 7), a draft when that week has no ProgramWeek row.
  const draftBlockIds = programs.filter((p) => p.kind === "continuous").flatMap((p) => {
    const published = new Set(p.weeksPublished.map((w) => w.weekIndex));
    return p.blocks.filter((b) => !published.has(Math.floor(b.dayIndex / 7))).map((b) => b.id);
  });
  const [resultsDeleted, enrolled] = await Promise.all([
    db.result.count({
      where: { OR: [{ block: { programId: { in: deletedProgramIds } } }, { blockId: { in: draftBlockIds } }] },
    }),
    db.enrollment.findMany({
      where: { programId: { in: programs.map((p) => p.id) } }, distinct: ["athleteId"], select: { athleteId: true },
    }),
  ]);
  const preview: CoachDeletionPreview = {
    programsKept: programs.length - deletedProgramIds.length,
    programsDeleted: deletedProgramIds.length,
    athletesEnrolled: enrolled.length,
    resultsDeleted,
  };
  return { preview, deletedProgramIds, draftBlockIds };
}

export async function previewCoachDeletion(db: Db, coachId: string): Promise<CoachDeletionPreview> {
  if (!(await db.coachAccount.findUnique({ where: { id: coachId } }))) throw new TrainingError("not_found");
  return (await planCoachDeletion(db, coachId)).preview;
}

/** Deletes the `User` (sessions, Google link, engine data) when it has neither a coach nor an athlete profile. An admin's `User` is always kept. */
export async function deleteUserIfNoProfiles(tx: DbOrTx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { coachAccount: true, athleteAccount: true } });
  if (!user || user.role === "admin" || user.coachAccount || user.athleteAccount) return false;
  await tx.user.delete({ where: { id: userId } });
  return true;
}

async function confirmedCoach(db: DbOrTx, coachId: string, confirmEmail: string) {
  const coach = await db.coachAccount.findUnique({ where: { id: coachId }, include: { user: true } });
  if (!coach) throw new TrainingError("not_found");
  if (confirmEmail.trim().toLowerCase() !== coach.user.email.toLowerCase()) throw new TrainingError("invalid_request");
  return coach;
}

/**
 * The spec's "Deleting a coach", steps 1–6, in one transaction. First, the live subscriptions of the coach's programs
 * are cancelled (`coach_deleted`); a Stripe failure does not stop the deletion and is returned in `failed`. The
 * programs that stay become free: there is no account left to charge.
 */
export async function deleteCoach(
  db: Db, gw: StripeGateway | null, actor: string, coachId: string, confirmEmail: string,
): Promise<{ preview: CoachDeletionPreview; intents: NotificationIntent[]; failed: string[] }> {
  await confirmedCoach(db, coachId, confirmEmail);
  const { failed } = await endSubscriptions(db, gw, { program: { coachId } }, "coach_deleted");
  const deleted = await db.$transaction(async (tx) => {
    const coach = await confirmedCoach(tx, coachId, confirmEmail);

    const { preview, deletedProgramIds, draftBlockIds } = await planCoachDeletion(tx, coachId);
    // Inbox entries pointing at programs about to disappear.
    await tx.notification.deleteMany({ where: { programId: { in: deletedProgramIds } } });
    // Fist-bump entries have no programId: remove those of every result that cascades away (deleted programs and draft blocks).
    const doomed = await tx.result.findMany({
      where: { OR: [{ block: { programId: { in: deletedProgramIds } } }, { blockId: { in: draftBlockIds } }] },
      select: { id: true },
    });
    await tx.notification.deleteMany({ where: { kind: "fist_bump", entityId: { in: doomed.map((r) => r.id) } } });
    // 1. Unpublished closed programs, with their enrollments and results (cascade).
    await tx.program.deleteMany({ where: { id: { in: deletedProgramIds } } });
    // 2. Draft-week blocks of continuous programs, with their results (cascade). 3. Published closed programs stay.
    await tx.block.deleteMany({ where: { id: { in: draftBlockIds } } });
    // The athletes of the programs that stay (archived ones are no longer visible to them) hear about it.
    const kept = await tx.program.findMany({ where: { coachId, archivedAt: null }, select: { id: true, name: true } });
    const intents: NotificationIntent[] = [];
    for (const program of kept) {
      const recipients = await activeAthleteRecipients(tx, program.id, coach.userId);
      if (recipients.length === 0) continue;
      intents.push(intent("coach_deleted", recipients, { programId: program.id, programName: program.name }, { programId: program.id }));
    }
    // 4. The remaining programs lose their coach (`coachName` already holds the name) and their price.
    const remaining = await tx.program.findMany({ where: { coachId }, select: { id: true } });
    await tx.program.updateMany({
      where: { coachId }, data: { coachId: null, priceAmount: null, stripePriceId: null, paidSince: null },
    });
    for (const program of remaining) await refreshProgramAccess(tx, program.id);
    // 5. The profile, and the User when it was the last one.
    await tx.coachAccount.delete({ where: { id: coachId } });
    if (!(await deleteUserIfNoProfiles(tx, coach.userId))) await deleteAudienceData(tx, coach.userId, "coach");
    // 6. The audit row.
    await writeAudit(tx, {
      actorUserId: actor, action: "coach.delete", targetUserId: coach.userId, targetType: "coach",
      targetId: coach.id, targetLabel: coach.user.email, details: preview,
    });
    return { preview, intents };
  });
  return { ...deleted, failed };
}

export async function setAthleteDisabled(db: Db, actor: string, athleteId: string, disabled: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const athlete = await tx.athleteAccount.findUnique({ where: { id: athleteId }, include: { user: true } });
    if (!athlete) throw new TrainingError("not_found");
    if ((athlete.disabledAt !== null) === disabled) throw new TrainingError("invalid_status_change");
    await tx.athleteAccount.update({ where: { id: athleteId }, data: { disabledAt: disabled ? new Date() : null } });
    await writeAudit(tx, {
      actorUserId: actor, action: disabled ? "athlete.disable" : "athlete.enable", targetUserId: athlete.userId,
      targetType: "athlete", targetId: athlete.id, targetLabel: athlete.user.email,
    });
  });
}

export async function setInviteDisabled(db: Db, actor: string, programId: string, disabled: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const program = await tx.program.findUnique({ where: { id: programId } });
    if (!program) throw new TrainingError("not_found");
    if ((program.inviteDisabledAt !== null) === disabled) throw new TrainingError("invalid_status_change");
    await tx.program.update({ where: { id: programId }, data: { inviteDisabledAt: disabled ? new Date() : null } });
    await writeAudit(tx, {
      actorUserId: actor, action: disabled ? "program.invite_disable" : "program.invite_enable",
      targetType: "program", targetId: program.id, targetLabel: program.name,
    });
  });
}

/** Allowed while the link is disabled; the link stays disabled. */
export async function adminRegenerateInvite(db: Db, actor: string, programId: string): Promise<string> {
  return db.$transaction(async (tx) => {
    const program = await tx.program.findUnique({ where: { id: programId } });
    if (!program) throw new TrainingError("not_found");
    const code = newInviteCode();
    await tx.program.update({ where: { id: programId }, data: { inviteCode: code } });
    await writeAudit(tx, {
      actorUserId: actor, action: "program.regenerate_invite", targetType: "program", targetId: program.id,
      targetLabel: program.name,
    });
    return code;
  });
}

export type AthleteDeletionPreview = { enrollments: number; results: number; prs: number };

async function countAthleteData(db: DbOrTx, athleteId: string): Promise<AthleteDeletionPreview> {
  const [enrollments, results, prs] = await Promise.all([
    db.enrollment.count({ where: { athleteId } }),
    db.result.count({ where: { athleteId } }),
    db.personalRecord.count({ where: { athleteId } }),
  ]);
  return { enrollments, results, prs };
}

export async function previewAthleteDeletion(db: Db, athleteId: string): Promise<AthleteDeletionPreview> {
  if (!(await db.athleteAccount.findUnique({ where: { id: athleteId } }))) throw new TrainingError("not_found");
  return countAthleteData(db, athleteId);
}

async function confirmedAthlete(db: DbOrTx, athleteId: string, confirmEmail: string) {
  const athlete = await db.athleteAccount.findUnique({ where: { id: athleteId }, include: { user: true } });
  if (!athlete) throw new TrainingError("not_found");
  if (confirmEmail.trim().toLowerCase() !== athlete.user.email.toLowerCase()) throw new TrainingError("invalid_request");
  return athlete;
}

/**
 * Deletes the athlete profile (enrollments, results, fist bumps, 1RMs and purchases cascade) and the User when it was
 * the last profile. First, every subscription Stripe could still charge is cancelled (`athlete_deleted`, no refund);
 * a Stripe failure does not stop the deletion and is returned in `failed`.
 */
export async function deleteAthlete(
  db: Db, gw: StripeGateway | null, actor: string, athleteId: string, confirmEmail: string,
): Promise<{ preview: AthleteDeletionPreview; failed: string[] }> {
  await confirmedAthlete(db, athleteId, confirmEmail);
  const { failed } = await endSubscriptions(db, gw, { athleteId }, "athlete_deleted");
  const preview = await db.$transaction(async (tx) => {
    const athlete = await confirmedAthlete(tx, athleteId, confirmEmail);

    const preview = await countAthleteData(tx, athleteId);
    await tx.athleteAccount.delete({ where: { id: athleteId } });
    if (!(await deleteUserIfNoProfiles(tx, athlete.userId))) await deleteAudienceData(tx, athlete.userId, "athlete");
    await writeAudit(tx, {
      actorUserId: actor, action: "athlete.delete", targetUserId: athlete.userId, targetType: "athlete",
      targetId: athlete.id, targetLabel: athlete.user.email, details: preview,
    });
    return preview;
  });
  return { preview, failed };
}
