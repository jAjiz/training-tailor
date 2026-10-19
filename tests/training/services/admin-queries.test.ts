import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import {
  enroll, makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock, makeResult, publishWeek,
} from "../../helpers/factories";
import {
  getAthleteDetail, getCoachDetail, getOverview, listAthletes, listCoaches, listPrograms,
} from "@/lib/training/services/admin-queries";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("getOverview", () => {
  it("counts the overview", async () => {
    const db = tdb.prisma;
    const now = new Date("2026-10-18T12:00:00Z");
    await makeCoach(db, "pending");
    await makeCoach(db, "pending");
    const coach = await makeCoach(db, "approved");
    const athlete = await makeAthlete(db);
    await makeAthlete(db);

    const withCoach = await makeContinuous(db, coach.id);
    await makeClosed(db, coach.id);
    const archived = await makeContinuous(db, coach.id);
    await db.program.update({ where: { id: archived.id }, data: { archivedAt: now } });
    // Programs without a coach count only with an active enrollment.
    const orphanActive = await makeContinuous(db, coach.id);
    const orphanIdle = await makeContinuous(db, coach.id);
    const orphanRemoved = await makeContinuous(db, coach.id);
    await db.program.updateMany({ where: { id: { in: [orphanActive.id, orphanIdle.id, orphanRemoved.id] } }, data: { coachId: null } });
    await enroll(db, orphanActive.id, athlete.id);
    const removed = await enroll(db, orphanRemoved.id, athlete.id);
    await db.enrollment.update({ where: { id: removed.id }, data: { removedAt: now } });

    const block = await makeCustomBlock(db, withCoach.id, 0);
    const recent = await makeResult(db, block.id, athlete.id);
    await db.result.update({ where: { id: recent.id }, data: { createdAt: new Date("2026-10-12T00:00:00Z") } });
    const block2 = await makeCustomBlock(db, withCoach.id, 1);
    const old = await makeResult(db, block2.id, athlete.id);
    await db.result.update({ where: { id: old.id }, data: { createdAt: new Date("2026-10-01T00:00:00Z") } });

    expect(await getOverview(db, now)).toEqual({
      pendingCoaches: 2, approvedCoaches: 1, athletes: 2, activePrograms: 3, resultsLast7Days: 1,
    });
  });
});

describe("listCoaches and listAthletes", () => {
  it("searches coaches and athletes by email or name", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    await makeCoach(db);
    await db.coachAccount.update({ where: { id: coach.id }, data: { displayName: "Marta Gomez" } });
    const athlete = await makeAthlete(db);
    await makeAthlete(db);
    const user = await db.user.findUniqueOrThrow({ where: { id: athlete.userId } });

    const byName = await listCoaches(db, { search: "marta gOMEZ", page: 0 });
    expect(byName.rows.map((r) => r.id)).toEqual([coach.id]);
    const coachUser = await db.user.findUniqueOrThrow({ where: { id: coach.userId } });
    const byEmail = await listCoaches(db, { search: coachUser.email.toUpperCase(), page: 0 });
    expect(byEmail.rows.map((r) => r.id)).toEqual([coach.id]);
    expect(byEmail.rows[0]).toMatchObject({ email: coachUser.email, status: "approved", programs: 0 });

    const found = await listAthletes(db, { search: user.email.toUpperCase(), page: 0 });
    expect(found.rows.map((r) => r.id)).toEqual([athlete.id]);
    expect(found.rows[0]).toMatchObject({ email: user.email, disabledAt: null, enrollments: 0 });
    expect((await listAthletes(db, { page: 0 })).rows).toHaveLength(2);
  });

  it("lists pending coaches first", async () => {
    const db = tdb.prisma;
    const first = await makeCoach(db, "approved");
    const pendingOld = await makeCoach(db, "pending");
    const second = await makeCoach(db, "approved");
    const pendingNew = await makeCoach(db, "pending");
    await db.coachAccount.update({ where: { id: first.id }, data: { createdAt: new Date("2026-01-01") } });
    await db.coachAccount.update({ where: { id: pendingOld.id }, data: { createdAt: new Date("2026-02-01") } });
    await db.coachAccount.update({ where: { id: second.id }, data: { createdAt: new Date("2026-03-01") } });
    await db.coachAccount.update({ where: { id: pendingNew.id }, data: { createdAt: new Date("2026-04-01") } });

    const { rows, hasMore } = await listCoaches(db, { page: 0 });
    expect(rows.map((r) => r.id)).toEqual([pendingNew.id, pendingOld.id, second.id, first.id]);
    expect(hasMore).toBe(false);
    expect((await listCoaches(db, { status: "approved", page: 0 })).rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it("paginates 50 per page", async () => {
    const db = tdb.prisma;
    for (let i = 0; i < 51; i++) await makeAthlete(db);
    const p0 = await listAthletes(db, { page: 0 });
    expect(p0.rows).toHaveLength(50);
    expect(p0.hasMore).toBe(true);
    const p1 = await listAthletes(db, { page: 1 });
    expect(p1.rows).toHaveLength(1);
    expect(p1.hasMore).toBe(false);
  });
});

describe("details", () => {
  it("links the other profile of the same person", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const athlete = await db.athleteAccount.create({
      data: { userId: coach.userId, displayName: "Same", timezone: "Europe/Madrid" },
    });
    const lone = await makeCoach(db);
    const program = await makeContinuous(db, coach.id);
    await publishWeek(db, program.id, 0);
    await publishWeek(db, program.id, 2);
    await enroll(db, program.id, athlete.id);

    const c = await getCoachDetail(db, coach.id);
    expect(c.athleteId).toBe(athlete.id);
    expect(c.programs).toHaveLength(1);
    expect(c.programs[0]).toMatchObject({ id: program.id, kind: "continuous", athletes: 1, lastPublishedWeek: 2 });
    expect((await getCoachDetail(db, lone.id)).athleteId).toBeNull();

    const a = await getAthleteDetail(db, athlete.id);
    expect(a.coachId).toBe(coach.id);
    expect(a.enrollments[0]).toMatchObject({ programId: program.id, coachName: coach.displayName, removedAt: null });
    expect(a.results).toBe(0);

    await expect(getCoachDetail(db, "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(getAthleteDetail(db, "nope")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("listPrograms", () => {
  it("shows programs of deleted coaches", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const athlete = await makeAthlete(db);
    const other = await makeAthlete(db);
    const gone = await makeContinuous(db, coach.id);
    await publishWeek(db, gone.id, 1);
    await publishWeek(db, gone.id, 3);
    await enroll(db, gone.id, athlete.id);
    const left = await enroll(db, gone.id, other.id);
    await db.enrollment.update({ where: { id: left.id }, data: { removedAt: new Date() } });
    await db.program.update({ where: { id: gone.id }, data: { coachId: null, coachName: "Old Coach", name: "Legacy" } });
    const closed = await makeClosed(db, coach.id);

    const { rows } = await listPrograms(db, { page: 0 });
    expect(rows).toHaveLength(2);
    const legacy = rows.find((r) => r.id === gone.id)!;
    expect(legacy).toMatchObject({
      name: "Legacy", coachName: "Old Coach", coachId: null, kind: "continuous", activeAthletes: 1,
      lastPublishedWeek: 3, archivedAt: null, inviteDisabledAt: null,
    });
    const c = rows.find((r) => r.id === closed.id)!;
    expect(c).toMatchObject({ coachId: coach.id, kind: "closed", lastPublishedWeek: null });
    expect(c.publishedAt).toBeInstanceOf(Date);
    expect((await listPrograms(db, { search: "legac", page: 0 })).rows.map((r) => r.id)).toEqual([gone.id]);
  });

  it("reports whether the coach can currently issue invitations", async () => {
    const db = tdb.prisma;
    const ok = await makeCoach(db);
    const suspended = await makeCoach(db, "suspended");
    const a = await makeClosed(db, ok.id);
    const b = await makeClosed(db, suspended.id);
    const { rows } = await listPrograms(db, { page: 0 });
    expect(rows.find((r) => r.id === a.id)!.coachAvailable).toBe(true);
    expect(rows.find((r) => r.id === b.id)!.coachAvailable).toBe(false);
  });
});
