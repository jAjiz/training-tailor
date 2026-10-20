import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAthlete, makeBarbellBlock, makeClosed, makeCoach, makeContinuous, makeCustomBlock, publishWeek } from "../../helpers/factories";
import {
  archiveProgram, createProgram, getOwnedProgram, listCoachPrograms, publishedWeeks, regenerateInvite,
  setProgramPublished, setWeekPublished, updateProgram,
} from "@/lib/training/services/programs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const continuous = { kind: "continuous" as const, name: "Daily", description: null, startDate: "2026-10-05" };
const closed = { kind: "closed" as const, name: "Cycle", description: null, weeks: 4 };

describe("programs", () => {
  it("creates both kinds with their own timing fields and a unique invite code", async () => {
    const coach = await makeCoach(tdb.prisma);
    const a = await createProgram(tdb.prisma, coach.id, continuous);
    const b = await createProgram(tdb.prisma, coach.id, closed);
    expect(a.startDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(a.weeks).toBeNull();
    expect(b.weeks).toBe(4);
    expect(b.startDate).toBeNull();
    expect(a.inviteCode).not.toBe(b.inviteCode);
    expect(a.inviteCode).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  it("hides another coach's program", async () => {
    const owner = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, owner.id, continuous);
    await expect(getOwnedProgram(tdb.prisma, other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listCoachPrograms(tdb.prisma, other.id)).toHaveLength(0);
    expect(await listCoachPrograms(tdb.prisma, owner.id)).toHaveLength(1);
  });

  it("drops the week notices when the start date changes", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    const other = await createProgram(tdb.prisma, coach.id, continuous);
    await tdb.prisma.weekNotice.createMany({ data: [{ programId: p.id, weekIndex: 0 }, { programId: other.id, weekIndex: 0 }] });
    await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily RX", description: null, startDate: "2026-10-05" });
    expect(await tdb.prisma.weekNotice.count({ where: { programId: p.id } })).toBe(1);
    await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-12" });
    expect(await tdb.prisma.weekNotice.count({ where: { programId: p.id } })).toBe(0);
    expect(await tdb.prisma.weekNotice.count({ where: { programId: other.id } })).toBe(1);
  });

  it("locks the start date once a week is published", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-12" });
    await setWeekPublished(tdb.prisma, coach.id, p.id, 0, true);
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-19" }))
      .rejects.toMatchObject({ code: "start_date_locked" });
    // Same date and other fields still change.
    const renamed = await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily RX", description: "x", startDate: "2026-10-12" });
    expect(renamed.name).toBe("Daily RX");
  });

  it("refuses to shorten a closed program below its blocks", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, closed);
    await makeBarbellBlock(tdb.prisma, p.id, 20); // week 3
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "Cycle", description: null, weeks: 2 }))
      .rejects.toMatchObject({ code: "weeks_out_of_range" });
    expect((await updateProgram(tdb.prisma, coach.id, p.id, { name: "Cycle", description: null, weeks: 3 })).weeks).toBe(3);
  });

  it("publishes weeks of continuous programs and whole closed programs", async () => {
    const coach = await makeCoach(tdb.prisma);
    const c = await createProgram(tdb.prisma, coach.id, continuous);
    const k = await createProgram(tdb.prisma, coach.id, closed);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 0, true);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 2, true);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 2, true); // idempotent
    await setWeekPublished(tdb.prisma, coach.id, c.id, 0, false);
    expect([...await publishedWeeks(tdb.prisma, c.id)]).toEqual([2]);
    await expect(setWeekPublished(tdb.prisma, coach.id, k.id, 0, true)).rejects.toMatchObject({ code: "invalid_request" });
    await setProgramPublished(tdb.prisma, coach.id, k.id, true);
    expect((await getOwnedProgram(tdb.prisma, coach.id, k.id)).publishedAt).not.toBeNull();
    await expect(setProgramPublished(tdb.prisma, coach.id, c.id, true)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("regenerates the invite code", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    const code = await regenerateInvite(tdb.prisma, coach.id, p.id);
    expect(code).not.toBe(p.inviteCode);
    expect((await getOwnedProgram(tdb.prisma, coach.id, p.id)).inviteCode).toBe(code);
  });

  it("refuses to regenerate a link the admin disabled", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await tdb.prisma.program.update({ where: { id: p.id }, data: { inviteDisabledAt: new Date() } });
    await expect(regenerateInvite(tdb.prisma, coach.id, p.id)).rejects.toMatchObject({ code: "invite_disabled" });
    expect((await getOwnedProgram(tdb.prisma, coach.id, p.id)).inviteCode).toBe(p.inviteCode);
  });

  it("makes archived programs read-only", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await makeCustomBlock(tdb.prisma, p.id, 0);
    await archiveProgram(tdb.prisma, coach.id, p.id);
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "X", description: null }))
      .rejects.toMatchObject({ code: "program_archived" });
    await expect(regenerateInvite(tdb.prisma, coach.id, p.id)).rejects.toMatchObject({ code: "program_archived" });
    await expect(setWeekPublished(tdb.prisma, coach.id, p.id, 0, true)).rejects.toMatchObject({ code: "program_archived" });
  });
});

describe("setWeekPublished notifications", () => {
  async function setup() {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
    const athlete = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, p.id, athlete.id);
    return { coach, p, athlete };
  }
  const publish = (coachId: string, programId: string, week: number, on = true) =>
    setWeekPublished(tdb.prisma, coachId, programId, week, on);

  it("returns one week_published intent the first time a week with blocks is published", async () => {
    const { coach, p, athlete } = await setup();
    const me = await tdb.prisma.athleteAccount.create({ data: { userId: coach.userId, displayName: "Me", timezone: "UTC" } });
    await enroll(tdb.prisma, p.id, me.id);
    await makeCustomBlock(tdb.prisma, p.id, 21);
    const intents = await publish(coach.id, p.id, 3);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "week_published", programId: p.id, entityId: null, groupKey: null,
      data: { programId: p.id, programName: p.name, monday: "2026-10-26" },
    });
    expect(intents[0].recipients.map((r) => r.userId)).toEqual([athlete.userId]);
  });

  it("does not notify again after unpublishing and publishing", async () => {
    const { coach, p } = await setup();
    await makeCustomBlock(tdb.prisma, p.id, 21);
    expect(await publish(coach.id, p.id, 3)).toHaveLength(1);
    expect(await publish(coach.id, p.id, 3, false)).toEqual([]);
    expect(await publish(coach.id, p.id, 3)).toEqual([]);
  });

  it("a week without blocks notifies nobody and does not count as the first time", async () => {
    const { coach, p } = await setup();
    expect(await publish(coach.id, p.id, 3)).toEqual([]);
    expect(await tdb.prisma.weekNotice.count()).toBe(0);
    await publish(coach.id, p.id, 3, false);
    await makeCustomBlock(tdb.prisma, p.id, 22);
    expect(await publish(coach.id, p.id, 3)).toHaveLength(1);
  });

  it("does not notify for a week already notified before (backfilled notice)", async () => {
    const { coach, p } = await setup();
    await makeCustomBlock(tdb.prisma, p.id, 0);
    await publishWeek(tdb.prisma, p.id, 0);
    await tdb.prisma.weekNotice.create({ data: { programId: p.id, weekIndex: 0 } });
    expect(await publish(coach.id, p.id, 0)).toEqual([]);
  });

  it("returns no intent when nobody is enrolled", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await makeCustomBlock(tdb.prisma, p.id, 0);
    expect(await publish(coach.id, p.id, 0)).toEqual([]);
  });

  it("never produces a notice or an intent for a closed program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const k = await makeClosed(tdb.prisma, coach.id, 4, false);
    await makeCustomBlock(tdb.prisma, k.id, 0);
    await expect(publish(coach.id, k.id, 0)).rejects.toMatchObject({ code: "invalid_request" });
    expect(await tdb.prisma.weekNotice.count()).toBe(0);
  });
});
