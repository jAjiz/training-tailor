import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, leave, makeAnnouncement, makeAthlete, makeCoach, makeContinuous } from "../../helpers/factories";
import { TrainingError } from "@/lib/training/errors";
import { createAnnouncement, deleteAnnouncement, listBoard, updateAnnouncement } from "@/lib/training/services/announcements";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof TrainingError ? e.code : "other"));

describe("createAnnouncement", () => {
  it("refuses another coach's program and an archived one", async () => {
    const coach = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    expect(await code(createAnnouncement(tdb.prisma, other, p.id, "Hola"))).toBe("not_found");
    await tdb.prisma.program.update({ where: { id: p.id }, data: { archivedAt: new Date() } });
    expect(await code(createAnnouncement(tdb.prisma, coach, p.id, "Hola"))).toBe("program_archived");
  });

  it("notifies active athletes only", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const a1 = await makeAthlete(tdb.prisma);
    const a2 = await makeAthlete(tdb.prisma);
    const left = await makeAthlete(tdb.prisma);
    const removed = await makeAthlete(tdb.prisma);
    const disabled = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, p.id, a1.id);
    await enroll(tdb.prisma, p.id, a2.id);
    await leave(tdb.prisma, (await enroll(tdb.prisma, p.id, left.id)).id);
    const r = await enroll(tdb.prisma, p.id, removed.id);
    await tdb.prisma.enrollment.update({ where: { id: r.id }, data: { removedAt: new Date() } });
    await enroll(tdb.prisma, p.id, disabled.id);
    await tdb.prisma.athleteAccount.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
    const { announcement, intents } = await createAnnouncement(tdb.prisma, coach, p.id, "  El sábado no hay clase  ");
    expect(announcement.body).toBe("El sábado no hay clase");
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "announcement", entityId: announcement.id, programId: p.id, groupKey: null,
      data: { programId: p.id, programName: p.name, excerpt: "El sábado no hay clase" },
    });
    expect(intents[0].recipients.map((x) => x.userId).sort()).toEqual([a1.userId, a2.userId].sort());
  });

  it("does not notify the coach who is also an athlete of the program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const me = await tdb.prisma.athleteAccount.create({ data: { userId: coach.userId, displayName: "Me", timezone: "Europe/Madrid" } });
    const other = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, p.id, me.id);
    await enroll(tdb.prisma, p.id, other.id);
    const { intents } = await createAnnouncement(tdb.prisma, coach, p.id, "Hola");
    expect(intents[0].recipients.map((x) => x.userId)).toEqual([other.userId]);
  });

  it("returns no intent when nobody is left to notify", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const { intents } = await createAnnouncement(tdb.prisma, coach, p.id, "Hola");
    expect(intents).toEqual([]);
  });
});

describe("updateAnnouncement / deleteAnnouncement", () => {
  it("edits with editedAt, only for the owner and a live program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const a = await makeAnnouncement(tdb.prisma, p.id, "Antes");
    expect(a.editedAt).toBeNull();
    expect(await code(updateAnnouncement(tdb.prisma, other.id, a.id, "X"))).toBe("not_found");
    const updated = await updateAnnouncement(tdb.prisma, coach.id, a.id, "Después");
    expect(updated.body).toBe("Después");
    expect(updated.editedAt).not.toBeNull();
    await tdb.prisma.program.update({ where: { id: p.id }, data: { archivedAt: new Date() } });
    expect(await code(updateAnnouncement(tdb.prisma, coach.id, a.id, "Y"))).toBe("program_archived");
    expect(await code(deleteAnnouncement(tdb.prisma, coach.id, a.id))).toBe("program_archived");
  });

  it("delete removes its notification rows and leaves others alone", async () => {
    const coach = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const a = await makeAnnouncement(tdb.prisma, p.id);
    const b = await makeAnnouncement(tdb.prisma, p.id);
    const row = (entityId: string) => tdb.prisma.notification.create({
      data: { userId: athlete.userId, audience: "athlete", kind: "announcement", programId: p.id, entityId, data: {} },
    });
    await row(a.id); await row(b.id);
    expect(await code(deleteAnnouncement(tdb.prisma, other.id, a.id))).toBe("not_found");
    await deleteAnnouncement(tdb.prisma, coach.id, a.id);
    expect(await tdb.prisma.announcement.findUnique({ where: { id: a.id } })).toBeNull();
    const rest = await tdb.prisma.notification.findMany();
    expect(rest.map((n) => n.entityId)).toEqual([b.id]);
  });
});

describe("listBoard", () => {
  it("lists newest first, including announcements older than joinedAt", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const old = await tdb.prisma.announcement.create({ data: { programId: p.id, body: "old", createdAt: new Date("2020-01-01") } });
    const recent = await makeAnnouncement(tdb.prisma, p.id, "recent");
    const athlete = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, p.id, athlete.id);
    const asAthlete = await listBoard(tdb.prisma, { athleteId: athlete.id }, p.id);
    expect(asAthlete.announcements.map((a) => a.id)).toEqual([recent.id, old.id]);
    expect(asAthlete.writable).toBe(false);
    const asCoach = await listBoard(tdb.prisma, { coachId: coach.id }, p.id);
    expect(asCoach.writable).toBe(true);
    expect(asCoach.program.id).toBe(p.id);
  });

  it("hides the board from left, removed, outsider athletes and other coaches", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const left = await makeAthlete(tdb.prisma);
    const removed = await makeAthlete(tdb.prisma);
    const outsider = await makeAthlete(tdb.prisma);
    await leave(tdb.prisma, (await enroll(tdb.prisma, p.id, left.id)).id);
    const r = await enroll(tdb.prisma, p.id, removed.id);
    await tdb.prisma.enrollment.update({ where: { id: r.id }, data: { removedAt: new Date() } });
    for (const a of [left, removed, outsider]) expect(await code(listBoard(tdb.prisma, { athleteId: a.id }, p.id))).toBe("not_found");
    expect(await code(listBoard(tdb.prisma, { coachId: (await makeCoach(tdb.prisma)).id }, p.id))).toBe("not_found");
  });

  it("is read-only when archived or when the program has no coach", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const athlete = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, p.id, athlete.id);
    await tdb.prisma.program.update({ where: { id: p.id }, data: { coachId: null } });
    const board = await listBoard(tdb.prisma, { athleteId: athlete.id }, p.id);
    expect(board.writable).toBe(false);
    await tdb.prisma.program.update({ where: { id: p.id }, data: { coachId: coach.id, archivedAt: new Date() } });
    expect((await listBoard(tdb.prisma, { coachId: coach.id }, p.id)).writable).toBe(false);
  });
});
