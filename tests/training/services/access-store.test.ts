import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAthlete, makeCoach, makeContinuous } from "../../helpers/factories";
import { refreshAccess, refreshProgramAccess } from "@/lib/training/services/access-store";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

async function paidContinuous() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id);
  return tdb.prisma.program.update({
    where: { id: program.id }, data: { priceAmount: 2000, currency: "eur", paidSince: new Date() },
  });
}

const subscription = (programId: string, athleteId: string, status: string) =>
  tdb.prisma.programPurchase.create({
    data: {
      programId, athleteId, kind: "subscription", stripeAccountId: "acct_1", checkoutSessionId: `cs_${athleteId}`,
      stripeSubscriptionId: `sub_${athleteId}`, status, stripePriceId: "price_1", amount: 2000, currency: "eur",
    },
  });

const accessOf = async (programId: string, athleteId: string) =>
  (await tdb.prisma.enrollment.findUniqueOrThrow({ where: { programId_athleteId: { programId, athleteId } } })).access;

describe("access store", () => {
  it("refreshAccess stores blocked for a paid continuous program without purchase, paid after an active subscription purchase", async () => {
    const program = await paidContinuous();
    const athlete = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, program.id, athlete.id);
    expect(await refreshAccess(tdb.prisma, program.id, athlete.id)).toBe("blocked");
    expect(await accessOf(program.id, athlete.id)).toBe("blocked");
    await subscription(program.id, athlete.id, "active");
    expect(await refreshAccess(tdb.prisma, program.id, athlete.id)).toBe("paid");
    expect(await accessOf(program.id, athlete.id)).toBe("paid");
  });

  it("refreshAccess writes nothing without an enrollment", async () => {
    const program = await paidContinuous();
    const athlete = await makeAthlete(tdb.prisma);
    await refreshAccess(tdb.prisma, program.id, athlete.id);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
  });

  it("refreshProgramAccess updates every enrollment", async () => {
    const program = await paidContinuous();
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => makeAthlete(tdb.prisma)));
    for (const x of [a, b, c]) await enroll(tdb.prisma, program.id, x.id);
    await subscription(program.id, a.id, "active");
    await tdb.prisma.enrollment.update({
      where: { programId_athleteId: { programId: program.id, athleteId: b.id } }, data: { accessGrantedAt: new Date() },
    });
    await refreshProgramAccess(tdb.prisma, program.id);
    expect([await accessOf(program.id, a.id), await accessOf(program.id, b.id), await accessOf(program.id, c.id)])
      .toEqual(["paid", "granted", "blocked"]);
  });
});
