import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAnnouncement, makeAthlete, makeCoach, makeContinuous, makeCustomBlock, makeSubscription, makeUser } from "../../helpers/factories";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("coaching schema", () => {
  it("allows one enrollment per athlete and program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, program.id, athlete.id);
    await expect(enroll(tdb.prisma, program.id, athlete.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades a program's deletion to its blocks, enrollments and results", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, program.id, athlete.id);
    const block = await makeCustomBlock(tdb.prisma, program.id, 0);
    await tdb.prisma.result.create({
      data: {
        blockId: block.id, athleteId: athlete.id, division: "rx", score: { seconds: 300 }, sortKey: -300,
        performedOn: new Date("2026-10-05T00:00:00Z"),
      },
    });
    await tdb.prisma.program.delete({ where: { id: program.id } });
    expect(await tdb.prisma.block.count()).toBe(0);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
    expect(await tdb.prisma.result.count()).toBe(0);
  });

  it("stores calendar dates without a time zone shift", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-26");
    const read = await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } });
    expect(read.startDate?.toISOString().slice(0, 10)).toBe("2026-10-26");
  });
});

describe("block tailoring schema", () => {
  it("keeps one adaptation per athlete and block", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const block = await makeCustomBlock(tdb.prisma, program.id, 0);
    await tdb.prisma.blockAdaptation.create({ data: { blockId: block.id, athleteId: athlete.id } });
    await expect(
      tdb.prisma.blockAdaptation.create({ data: { blockId: block.id, athleteId: athlete.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades a block's deletion to its analysis and adaptations", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const block = await makeCustomBlock(tdb.prisma, program.id, 0);
    await tdb.prisma.blockAnalysis.create({
      data: { blockId: block.id, contentHash: "h", libraryVersion: 1, workout: {}, analyzed: true, model: "test" },
    });
    await tdb.prisma.blockAdaptation.create({ data: { blockId: block.id, athleteId: athlete.id } });
    await tdb.prisma.block.delete({ where: { id: block.id } });
    expect(await tdb.prisma.blockAnalysis.count()).toBe(0);
    expect(await tdb.prisma.blockAdaptation.count()).toBe(0);
  });

  it("defaults tailoring switches to off", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    expect(coach.tailoringEnabled).toBe(false);
    expect(program.tailoringEnabled).toBe(false);
  });
});

describe("admin schema", () => {
  it("sets a program's coach to null when the coach is deleted", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.coachAccount.delete({ where: { id: coach.id } });
    expect((await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).coachId).toBeNull();
  });
});

describe("notifications schema", () => {
  it("deleting a user cascades to notifications, subscriptions and preferences", async () => {
    const user = await makeUser(tdb.prisma);
    await tdb.prisma.notification.create({ data: { userId: user.id, audience: "athlete", kind: "announcement", data: {} } });
    await makeSubscription(tdb.prisma, user.id);
    await tdb.prisma.notificationPreference.create({ data: { userId: user.id, kind: "announcement", enabled: false } });
    await tdb.prisma.user.delete({ where: { id: user.id } });
    expect(await tdb.prisma.notification.count()).toBe(0);
    expect(await tdb.prisma.pushSubscription.count()).toBe(0);
    expect(await tdb.prisma.notificationPreference.count()).toBe(0);
  });

  it("deleting a program cascades to its announcements", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await makeAnnouncement(tdb.prisma, program.id);
    await tdb.prisma.program.delete({ where: { id: program.id } });
    expect(await tdb.prisma.announcement.count()).toBe(0);
  });

  it("allows many notifications without a group key but one per user and key", async () => {
    const user = await makeUser(tdb.prisma);
    const row = (groupKey: string | null) =>
      tdb.prisma.notification.create({ data: { userId: user.id, audience: "athlete", kind: "fist_bump", groupKey, data: {} } });
    await row(null);
    await row(null);
    await row("k");
    await expect(row("k")).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("payments schema", () => {
  const purchase = (programId: string, athleteId: string, checkoutSessionId: string) =>
    tdb.prisma.programPurchase.create({
      data: {
        programId, athleteId, kind: "payment", stripeAccountId: "acct_1", checkoutSessionId,
        status: "pending", stripePriceId: "price_1", amount: 1000, currency: "eur",
      },
    });

  it("an enrollment defaults to free access", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const enrollment = await enroll(tdb.prisma, program.id, athlete.id);
    expect(enrollment.access).toBe("free");
    expect(enrollment.accessGrantedAt).toBeNull();
  });

  it("a purchase cascades with its program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await purchase(program.id, athlete.id, "cs_1");
    await tdb.prisma.program.delete({ where: { id: program.id } });
    expect(await tdb.prisma.programPurchase.count()).toBe(0);
  });

  it("a checkout session id is unique", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await purchase(program.id, athlete.id, "cs_1");
    await expect(purchase(program.id, athlete.id, "cs_1")).rejects.toMatchObject({ code: "P2002" });
  });
});
