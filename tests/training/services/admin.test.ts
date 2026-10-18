import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createTestDb, type TestDb } from "../../helpers/db";
import {
  enroll, makeAdmin, makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock, makeResult, makeUser,
  publishWeek,
} from "../../helpers/factories";
import { ensureCoachAccount, getCoachByUserId } from "@/lib/training/services/accounts";
import {
  approveCoach, changeCoachStatus, deleteAthlete, deleteCoach, grantAdmin, previewAthleteDeletion, previewCoachDeletion, setAthleteDisabled,
  type CoachTransition,
} from "@/lib/training/services/admin";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

async function makeSession(db: PrismaClient, userId: string) {
  return db.session.create({
    data: { id: `s-${userId}`, token: `t-${userId}`, userId, expiresAt: new Date(Date.now() + 3_600_000) },
  });
}

describe("grantAdmin", () => {
  it("grants the admin role by email", async () => {
    const user = await makeUser(tdb.prisma);
    expect(await grantAdmin(tdb.prisma, user.email)).toBe("granted");
    expect((await tdb.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("admin");
    expect(await grantAdmin(tdb.prisma, "nobody@test.local")).toBe("not_found");
  });
});

describe("approveCoach", () => {
  it("approves a coach by email and audits it with no actor", async () => {
    const user = await makeUser(tdb.prisma);
    const coach = await ensureCoachAccount(tdb.prisma, { id: user.id, name: user.name }, { locale: "es" });
    expect(await approveCoach(tdb.prisma, user.email)).toBe("approved");
    expect((await getCoachByUserId(tdb.prisma, user.id))?.status).toBe("approved");
    expect(await approveCoach(tdb.prisma, "nobody@test.local")).toBe("not_found");
    const rows = await tdb.prisma.adminAuditLog.findMany();
    expect(rows).toMatchObject([{ actorUserId: null, action: "coach.approve", targetId: coach.id, targetUserId: user.id }]);
  });
});

describe("changeCoachStatus", () => {
  it("follows the coach status transitions", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const allowed: [string, CoachTransition, string][] = [
      ["pending", "approve", "approved"],
      ["pending", "reject", "rejected"],
      ["rejected", "approve", "approved"],
      ["approved", "suspend", "suspended"],
      ["suspended", "enable", "approved"],
    ];
    for (const [from, to, status] of allowed) {
      const coach = await makeCoach(tdb.prisma, from as "pending");
      await changeCoachStatus(tdb.prisma, admin.id, coach.id, to);
      expect((await tdb.prisma.coachAccount.findUniqueOrThrow({ where: { id: coach.id } })).status).toBe(status);
      const row = await tdb.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: coach.id } });
      expect(row).toMatchObject({ actorUserId: admin.id, action: `coach.${to}`, targetType: "coach", targetUserId: coach.userId });
    }
    const pending = await makeCoach(tdb.prisma, "pending");
    await expect(changeCoachStatus(tdb.prisma, admin.id, pending.id, "suspend"))
      .rejects.toMatchObject({ code: "invalid_status_change" });
    const approved = await makeCoach(tdb.prisma, "approved");
    await expect(changeCoachStatus(tdb.prisma, admin.id, approved.id, "reject"))
      .rejects.toMatchObject({ code: "invalid_status_change" });
    expect(await tdb.prisma.adminAuditLog.count()).toBe(allowed.length);
  });

  it("refuses a missing profile", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await expect(changeCoachStatus(tdb.prisma, admin.id, "nope", "approve")).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteCoach(tdb.prisma, admin.id, "nope", "x@test.local")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleteCoach", () => {
  it("deletes unpublished content with its results and nothing else", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const coach = await makeCoach(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: coach.userId } });
    const a = await makeAthlete(db);

    const draft = await makeClosed(db, coach.id, 4, false);
    await enroll(db, draft.id, a.id, "2026-10-05");
    const draftBlock = await makeCustomBlock(db, draft.id, 0);
    await makeResult(db, draftBlock.id, a.id);

    const daily = await makeContinuous(db, coach.id);
    await publishWeek(db, daily.id, 0);
    await enroll(db, daily.id, a.id);
    const week0 = await makeCustomBlock(db, daily.id, 3);
    const week0Result = await makeResult(db, week0.id, a.id, "2026-10-08");
    const week1 = await makeCustomBlock(db, daily.id, 7);
    await makeResult(db, week1.id, a.id, "2026-10-12");

    const published = await makeClosed(db, coach.id, 4, true);

    const other = await makeCoach(db);
    const otherProgram = await makeContinuous(db, other.id);
    const otherBlock = await makeCustomBlock(db, otherProgram.id, 0);
    const otherResult = await makeResult(db, otherBlock.id, a.id);

    const before = await previewCoachDeletion(db, coach.id);
    const result = await deleteCoach(db, admin.id, coach.id, user.email.toUpperCase());
    const expected = { programsKept: 2, programsDeleted: 1, athletesEnrolled: 1, resultsDeleted: 2 };
    expect(before).toEqual(expected);
    expect(result).toEqual(expected);

    expect(await db.program.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await db.block.findUnique({ where: { id: week0.id } })).not.toBeNull();
    expect(await db.result.findUnique({ where: { id: week0Result.id } })).not.toBeNull();
    expect(await db.block.findUnique({ where: { id: week1.id } })).toBeNull();
    expect(await db.result.count({ where: { blockId: week1.id } })).toBe(0);
    for (const id of [daily.id, published.id]) {
      expect(await db.program.findUniqueOrThrow({ where: { id } })).toMatchObject({ coachId: null, coachName: coach.displayName });
    }
    expect(await db.result.findUnique({ where: { id: otherResult.id } })).not.toBeNull();
    expect(await db.coachAccount.findUnique({ where: { id: coach.id } })).toBeNull();
    expect(await db.enrollment.count({ where: { programId: daily.id, athleteId: a.id } })).toBe(1);

    const row = await db.adminAuditLog.findFirstOrThrow({ where: { action: "coach.delete" } });
    expect(row).toMatchObject({
      actorUserId: admin.id, targetType: "coach", targetId: coach.id, targetUserId: user.id, targetLabel: user.email,
      details: expected,
    });
  });

  it("keeps the user and athlete data when a coach who is also an athlete is deleted", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const coach = await makeCoach(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: coach.userId } });
    const athlete = await db.athleteAccount.create({ data: { userId: user.id, displayName: user.name, timezone: "UTC" } });
    const session = await makeSession(db, user.id);
    await deleteCoach(db, admin.id, coach.id, user.email);
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await db.session.findUnique({ where: { id: session.id } })).not.toBeNull();
    expect(await db.athleteAccount.findUnique({ where: { id: athlete.id } })).not.toBeNull();
    expect(await db.coachAccount.findUnique({ where: { id: coach.id } })).toBeNull();
  });

  it("deletes the user when the coach was their only profile", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const coach = await makeCoach(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: coach.userId } });
    await makeSession(db, user.id);
    await deleteCoach(db, admin.id, coach.id, user.email);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    await db.user.create({ data: { id: "user-again", name: "Again", email: user.email } });
  });

  it("requires the coach's email to confirm", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const coach = await makeCoach(db);
    const program = await makeClosed(db, coach.id, 4, false);
    await expect(deleteCoach(db, admin.id, coach.id, "someone@test.local")).rejects.toMatchObject({ code: "invalid_request" });
    expect(await db.coachAccount.findUnique({ where: { id: coach.id } })).not.toBeNull();
    expect(await db.program.findUnique({ where: { id: program.id } })).not.toBeNull();
    expect(await db.adminAuditLog.count()).toBe(0);
  });
});

describe("athlete administration", () => {
  it("disables and enables an athlete", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const athlete = await makeAthlete(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: athlete.userId } });
    await setAthleteDisabled(db, admin.id, athlete.id, true);
    expect((await db.athleteAccount.findUniqueOrThrow({ where: { id: athlete.id } })).disabledAt).not.toBeNull();
    await expect(setAthleteDisabled(db, admin.id, athlete.id, true)).rejects.toMatchObject({ code: "invalid_status_change" });
    await setAthleteDisabled(db, admin.id, athlete.id, false);
    expect((await db.athleteAccount.findUniqueOrThrow({ where: { id: athlete.id } })).disabledAt).toBeNull();
    await expect(setAthleteDisabled(db, admin.id, athlete.id, false)).rejects.toMatchObject({ code: "invalid_status_change" });
    const rows = await db.adminAuditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["athlete.disable", "athlete.enable"]);
    expect(rows[0]).toMatchObject({
      actorUserId: admin.id, targetType: "athlete", targetId: athlete.id, targetUserId: user.id, targetLabel: user.email,
    });
  });

  it("refuses a missing profile", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await expect(setAthleteDisabled(tdb.prisma, admin.id, "nope", true)).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteAthlete(tdb.prisma, admin.id, "nope", "x@test.local")).rejects.toMatchObject({ code: "not_found" });
    await expect(previewAthleteDeletion(tdb.prisma, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("deletes an athlete with their results, fist bumps and 1RMs, keeping their coach profile", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const coach = await makeCoach(db);
    const program = await makeContinuous(db, coach.id);
    await publishWeek(db, program.id, 0);
    const block = await makeCustomBlock(db, program.id, 1, { scoring: "for_time", timeCapSeconds: 900 });
    const athlete = await makeAthlete(db);
    const other = await makeAthlete(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: athlete.userId } });
    await db.coachAccount.create({ data: { userId: user.id, displayName: "Both", status: "approved" } });
    await enroll(db, program.id, athlete.id);
    await enroll(db, program.id, other.id);
    const mine = await makeResult(db, block.id, athlete.id);
    const theirs = await makeResult(db, block.id, other.id);
    await db.fistBump.create({ data: { resultId: theirs.id, athleteId: athlete.id } });
    await db.fistBump.create({ data: { resultId: mine.id, athleteId: other.id } });
    await db.personalRecord.create({ data: { athleteId: athlete.id, movement: "Back Squat", kg: 100, achievedOn: new Date("2026-10-05T00:00:00Z") } });

    expect(await previewAthleteDeletion(db, athlete.id)).toEqual({ enrollments: 1, results: 1, prs: 1 });
    await expect(deleteAthlete(db, admin.id, athlete.id, "wrong@test.local")).rejects.toMatchObject({ code: "invalid_request" });
    expect(await db.adminAuditLog.count()).toBe(0);

    const preview = await deleteAthlete(db, admin.id, athlete.id, ` ${user.email.toUpperCase()} `);
    expect(preview).toEqual({ enrollments: 1, results: 1, prs: 1 });
    expect(await db.athleteAccount.findUnique({ where: { id: athlete.id } })).toBeNull();
    expect(await db.enrollment.count({ where: { athleteId: athlete.id } })).toBe(0);
    expect(await db.result.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await db.fistBump.count()).toBe(0);
    expect(await db.personalRecord.count()).toBe(0);
    expect(await db.result.findUnique({ where: { id: theirs.id } })).not.toBeNull();
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await db.coachAccount.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.adminAuditLog.findFirstOrThrow()).toMatchObject({
      action: "athlete.delete", actorUserId: admin.id, targetType: "athlete", targetId: athlete.id,
      targetUserId: user.id, targetLabel: user.email, details: preview,
    });
  });

  it("deletes the user when the athlete was their only profile", async () => {
    const db = tdb.prisma;
    const admin = await makeAdmin(db);
    const athlete = await makeAthlete(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: athlete.userId } });
    await makeSession(db, user.id);
    await deleteAthlete(db, admin.id, athlete.id, user.email);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
