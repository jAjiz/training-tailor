import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete, makeClosed, makeCoach, makeContinuous } from "../../helpers/factories";
import {
  findProgramByCode, getEnrollmentStatus, joinByCode, listAthletePrograms, listRoster, setEnrollmentRemoved,
} from "@/lib/training/services/enrollments";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("enrollments", () => {
  it("joins a continuous program once, without a start date", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    expect(await joinByCode(tdb.prisma, athlete, p.inviteCode)).toEqual({ programId: p.id, status: "joined" });
    expect(await joinByCode(tdb.prisma, athlete, p.inviteCode)).toEqual({ programId: p.id, status: "already" });
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(e.startDate).toBeNull();
  });

  it("starts a closed program on the athlete's local today", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma, "Europe/Madrid");
    const p = await makeClosed(tdb.prisma, coach.id, 4, true);
    await joinByCode(tdb.prisma, athlete, p.inviteCode, new Date("2026-10-07T23:30:00Z"));
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(e.startDate?.toISOString().slice(0, 10)).toBe("2026-10-08");
  });

  it("rejects unknown, archived and unpublished-closed invitations", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const draft = await makeClosed(tdb.prisma, coach.id, 4, false);
    const archived = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    for (const code of ["nope", draft.inviteCode, archived.inviteCode]) {
      await expect(joinByCode(tdb.prisma, athlete, code)).rejects.toMatchObject({ code: "invite_invalid" });
      expect(await findProgramByCode(tdb.prisma, code)).toBeNull();
    }
  });

  it("keeps removed athletes out until the coach restores them", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, p.inviteCode);
    const [row] = await listRoster(tdb.prisma, coach.id, p.id);
    await setEnrollmentRemoved(tdb.prisma, coach.id, row.id, true);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("removed");
    await expect(joinByCode(tdb.prisma, athlete, p.inviteCode)).rejects.toMatchObject({ code: "enrollment_removed" });
    expect(await listAthletePrograms(tdb.prisma, athlete.id)).toHaveLength(0);
    await setEnrollmentRemoved(tdb.prisma, coach.id, row.id, false);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("active");
    expect(await listAthletePrograms(tdb.prisma, athlete.id)).toHaveLength(1);
  });

  it("hides the roster from other coaches", async () => {
    const coach = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, p.inviteCode);
    const [row] = await listRoster(tdb.prisma, coach.id, p.id);
    await expect(listRoster(tdb.prisma, other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(setEnrollmentRemoved(tdb.prisma, other.id, row.id, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the athlete's programs newest first, without archived ones", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const a = await makeContinuous(tdb.prisma, coach.id);
    const b = await makeClosed(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, a.inviteCode);
    await joinByCode(tdb.prisma, athlete, b.inviteCode);
    expect((await listAthletePrograms(tdb.prisma, athlete.id)).map((e) => e.programId)).toEqual([b.id, a.id]);
    await tdb.prisma.program.update({ where: { id: b.id }, data: { archivedAt: new Date() } });
    expect((await listAthletePrograms(tdb.prisma, athlete.id)).map((e) => e.programId)).toEqual([a.id]);
  });
});
