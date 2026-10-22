import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, leave, makeAthlete, makeClosed, makeCoach, makeContinuous, publishWeek } from "../../helpers/factories";
import { runWeeklyJob, weekReminderIntents } from "@/lib/training/services/reminders";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const SUNDAY = new Date("2026-10-25T17:00:00Z"); // coming Monday 2026-10-26 = week 3 of a 2026-10-05 start

async function setup(start = "2026-10-05", status: "approved" | "suspended" = "approved") {
  const coach = await makeCoach(tdb.prisma, status);
  const program = await makeContinuous(tdb.prisma, coach.id, start);
  const athlete = await makeAthlete(tdb.prisma);
  await enroll(tdb.prisma, program.id, athlete.id);
  return { coach, program, athlete };
}

describe("weekReminderIntents", () => {
  it("reminds the coach when the coming week is unpublished", async () => {
    const { coach, program } = await setup();
    const intents = await weekReminderIntents(tdb.prisma, SUNDAY);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "week_reminder", programId: program.id, groupKey: `week_reminder:${program.id}:3`,
      data: { programId: program.id, programName: "Daily", monday: "2026-10-26", weekIndex: 3 },
    });
    expect(intents[0].recipients.map((r) => r.userId)).toEqual([coach.userId]);
  });

  it("is silent once the week is published", async () => {
    const { program } = await setup();
    await publishWeek(tdb.prisma, program.id, 3);
    expect(await weekReminderIntents(tdb.prisma, SUNDAY)).toEqual([]);
  });

  it("skips archived programs, suspended coaches, empty programs, future starts and closed programs", async () => {
    const a = await setup();
    await tdb.prisma.program.update({ where: { id: a.program.id }, data: { archivedAt: new Date() } });
    await setup("2026-10-05", "suspended");
    const noAthletes = await makeCoach(tdb.prisma);
    await makeContinuous(tdb.prisma, noAthletes.id);
    const gone = await setup();
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { programId: gone.program.id } });
    await leave(tdb.prisma, e.id);
    const disabled = await setup();
    await tdb.prisma.athleteAccount.update({ where: { id: disabled.athlete.id }, data: { disabledAt: new Date() } });
    await setup("2026-11-02");
    const closed = await makeClosed(tdb.prisma, (await makeCoach(tdb.prisma)).id, 6, false);
    await enroll(tdb.prisma, closed.id, (await makeAthlete(tdb.prisma)).id);
    expect(await weekReminderIntents(tdb.prisma, SUNDAY)).toEqual([]);
  });
});

describe("runWeeklyJob", () => {
  it("creates the reminder once; a second run creates nothing", async () => {
    const { program } = await setup();
    expect(await runWeeklyJob(tdb.prisma, SUNDAY, null)).toMatchObject({ reminders: 1 });
    expect(await runWeeklyJob(tdb.prisma, SUNDAY, null)).toMatchObject({ reminders: 0 });
    expect(await tdb.prisma.notification.count({ where: { kind: "week_reminder", programId: program.id } })).toBe(1);
  });

  it("still deletes old rows when delivering the reminders throws", async () => {
    await setup();
    const coach = await makeCoach(tdb.prisma);
    await tdb.prisma.notification.create({
      data: { userId: coach.userId, kind: "athlete_joined", audience: "coach", data: {}, updatedAt: new Date(SUNDAY.getTime() - 91 * 86_400_000) },
    });
    const broken = new Proxy(tdb.prisma, {
      get(target, prop, receiver) {
        if (prop === "notificationPreference") throw new Error("db down");
        return Reflect.get(target, prop, receiver);
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runWeeklyJob(broken, SUNDAY, null);
    spy.mockRestore();
    expect(r).toEqual({ reminders: 0, deleted: 1 });
    expect(await tdb.prisma.notification.count({ where: { kind: "athlete_joined" } })).toBe(0);
  });

  it("deletes rows older than 90 days and keeps newer ones", async () => {
    const coach = await makeCoach(tdb.prisma);
    const at = (days: number) => new Date(SUNDAY.getTime() - days * 86_400_000);
    const mk = (days: number) => tdb.prisma.notification.create({
      data: { userId: coach.userId, kind: "athlete_joined", audience: "coach", data: {}, updatedAt: at(days) },
    });
    await mk(91);
    const keep = await mk(89);
    const r = await runWeeklyJob(tdb.prisma, SUNDAY, null);
    expect(r.deleted).toBe(1);
    expect((await tdb.prisma.notification.findMany()).map((n) => n.id)).toEqual([keep.id]);
  });
});
