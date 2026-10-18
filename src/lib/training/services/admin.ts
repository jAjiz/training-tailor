import { TrainingError } from "../errors";
import { writeAudit } from "./audit";
import { newInviteCode } from "./programs";
import type { Db, DbOrTx } from "./types";

export async function grantAdmin(db: Db, email: string): Promise<"granted" | "not_found"> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return "not_found";
  await db.user.update({ where: { id: user.id }, data: { role: "admin" } });
  return "granted";
}

export type CoachTransition = "approve" | "reject" | "suspend" | "enable";

const TRANSITIONS: Record<CoachTransition, { from: string[]; to: string }> = {
  approve: { from: ["pending", "rejected"], to: "approved" },
  reject: { from: ["pending"], to: "rejected" },
  suspend: { from: ["approved"], to: "suspended" },
  enable: { from: ["suspended"], to: "approved" },
};

/** `actor` is the admin's user id, `null` for the coach:approve script. */
export async function changeCoachStatus(db: Db, actor: string | null, coachId: string, to: CoachTransition): Promise<void> {
  const { from, to: status } = TRANSITIONS[to];
  await db.$transaction(async (tx) => {
    const coach = await tx.coachAccount.findUnique({ where: { id: coachId }, include: { user: true } });
    if (!coach) throw new TrainingError("not_found");
    if (!from.includes(coach.status)) throw new TrainingError("invalid_status_change");
    await tx.coachAccount.update({ where: { id: coachId }, data: { status } });
    await writeAudit(tx, {
      actorUserId: actor, action: `coach.${to}`, targetUserId: coach.userId, targetType: "coach",
      targetId: coach.id, targetLabel: coach.user.email,
    });
  });
}

export async function approveCoach(db: Db, email: string): Promise<"approved" | "not_found"> {
  const user = await db.user.findUnique({ where: { email }, include: { coachAccount: true } });
  if (!user?.coachAccount) return "not_found";
  if (user.coachAccount.status === "approved") return "approved";
  await changeCoachStatus(db, null, user.coachAccount.id, "approve");
  return "approved";
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

/** The spec's "Deleting a coach", steps 1–6, in one transaction. */
export async function deleteCoach(db: Db, actor: string, coachId: string, confirmEmail: string): Promise<CoachDeletionPreview> {
  return db.$transaction(async (tx) => {
    const coach = await tx.coachAccount.findUnique({ where: { id: coachId }, include: { user: true } });
    if (!coach) throw new TrainingError("not_found");
    if (confirmEmail.trim().toLowerCase() !== coach.user.email.toLowerCase()) throw new TrainingError("invalid_request");

    const { preview, deletedProgramIds, draftBlockIds } = await planCoachDeletion(tx, coachId);
    // 1. Unpublished closed programs, with their enrollments and results (cascade).
    await tx.program.deleteMany({ where: { id: { in: deletedProgramIds } } });
    // 2. Draft-week blocks of continuous programs, with their results (cascade). 3. Published closed programs stay.
    await tx.block.deleteMany({ where: { id: { in: draftBlockIds } } });
    // 4. The remaining programs lose their coach and keep the name as text.
    await tx.program.updateMany({ where: { coachId }, data: { coachId: null, coachName: coach.displayName } });
    // 5. The profile, and the User when it was the last one.
    await tx.coachAccount.delete({ where: { id: coachId } });
    await deleteUserIfNoProfiles(tx, coach.userId);
    // 6. The audit row.
    await writeAudit(tx, {
      actorUserId: actor, action: "coach.delete", targetUserId: coach.userId, targetType: "coach",
      targetId: coach.id, targetLabel: coach.user.email, details: preview,
    });
    return preview;
  });
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

/** Deletes the athlete profile (enrollments, results, fist bumps and 1RMs cascade) and the User when it was the last profile. */
export async function deleteAthlete(db: Db, actor: string, athleteId: string, confirmEmail: string): Promise<AthleteDeletionPreview> {
  return db.$transaction(async (tx) => {
    const athlete = await tx.athleteAccount.findUnique({ where: { id: athleteId }, include: { user: true } });
    if (!athlete) throw new TrainingError("not_found");
    if (confirmEmail.trim().toLowerCase() !== athlete.user.email.toLowerCase()) throw new TrainingError("invalid_request");

    const preview = await countAthleteData(tx, athleteId);
    await tx.athleteAccount.delete({ where: { id: athleteId } });
    await deleteUserIfNoProfiles(tx, athlete.userId);
    await writeAudit(tx, {
      actorUserId: actor, action: "athlete.delete", targetUserId: athlete.userId, targetType: "athlete",
      targetId: athlete.id, targetLabel: athlete.user.email, details: preview,
    });
    return preview;
  });
}
