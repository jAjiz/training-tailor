import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { fakeStripe } from "../../helpers/fake-stripe";
import { enroll, makeAthlete, makeClosed, makeCoach, makeContinuous } from "../../helpers/factories";
import {
  connectStripe, countLiveSubscriptions, createCoachAccountSession, getStripeAccount, setProgramPrice, syncStripeAccount,
} from "@/lib/training/services/payments";
import { archiveProgram } from "@/lib/training/services/programs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("coach Stripe account", () => {
  it("connectStripe creates the account with the given country once", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway, calls } = fakeStripe();
    const first = await connectStripe(tdb.prisma, gateway, coach.id, "ES");
    const second = await connectStripe(tdb.prisma, gateway, coach.id, "FR");
    expect(second).toBe(first);
    expect(calls.filter((c) => c.method === "createAccount")).toEqual([{ method: "createAccount", args: ["ES"] }]);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toMatchObject({ stripeAccountId: first, chargesEnabled: false });
  });

  it("createCoachAccountSession without an account is not_found", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway } = fakeStripe();
    await expect(createCoachAccountSession(tdb.prisma, gateway, coach.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("createCoachAccountSession returns the client secret of the coach's account", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway } = fakeStripe();
    const acct = await connectStripe(tdb.prisma, gateway, coach.id, "ES");
    expect(await createCoachAccountSession(tdb.prisma, gateway, coach.id)).toBe(`${acct}_secret`);
  });

  it("syncStripeAccount stores charges, payouts, details and currency", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway, state } = fakeStripe();
    const acct = await connectStripe(tdb.prisma, gateway, coach.id, "ES");
    state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur" });
    await syncStripeAccount(tdb.prisma, gateway, acct);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toMatchObject({
      chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur",
    });
  });

  it("getStripeAccount is null before connecting", async () => {
    const coach = await makeCoach(tdb.prisma);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toBeNull();
  });
});

describe("setProgramPrice", () => {
  async function chargingCoach(gw: ReturnType<typeof fakeStripe>) {
    const coach = await makeCoach(tdb.prisma);
    const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur" });
    await syncStripeAccount(tdb.prisma, gw.gateway, acct);
    return { coach, acct };
  }
  const subscribe = (programId: string, athleteId: string, acct: string, n: string, status = "active") =>
    tdb.prisma.programPurchase.create({
      data: {
        programId, athleteId, kind: "subscription", stripeAccountId: acct, checkoutSessionId: `cs_${n}`,
        stripeSubscriptionId: `sub_${n}`, status, stripePriceId: "price_x", amount: 1500, currency: "eur",
      },
    });

  it("making a program paid without charges enabled is stripe_not_ready", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const gw = fakeStripe();
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 }))
      .rejects.toMatchObject({ code: "stripe_not_ready" });
    await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 }))
      .rejects.toMatchObject({ code: "stripe_not_ready" });
    expect(gw.calls.filter((c) => c.method === "createProduct")).toEqual([]);
  });

  it("free → paid creates product and monthly price for continuous, one-time for closed, and sets paidSince", async () => {
    const gw = fakeStripe();
    const { coach, acct } = await chargingCoach(gw);
    const continuous = await makeContinuous(tdb.prisma, coach.id);
    const closed = await makeClosed(tdb.prisma, coach.id);
    const before = new Date();
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, continuous.id, { paid: true, amount: 1500 });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, closed.id, { paid: true, amount: 4000 });
    expect([...gw.state.prices.values()]).toEqual([
      { acct, productId: "prod_1", amount: 1500, currency: "eur", monthly: true },
      { acct, productId: "prod_2", amount: 4000, currency: "eur", monthly: false },
    ]);
    expect(gw.state.products.get("prod_1")).toEqual({ acct, name: "Daily" });
    const stored = await tdb.prisma.program.findUniqueOrThrow({ where: { id: continuous.id } });
    expect(stored).toMatchObject({
      priceAmount: 1500, currency: "eur", stripeProductId: "prod_1", stripePriceId: "price_1",
    });
    expect(stored.paidSince!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("free → paid blocks continuous athletes and keeps closed ones free", async () => {
    const gw = fakeStripe();
    const { coach } = await chargingCoach(gw);
    const continuous = await makeContinuous(tdb.prisma, coach.id);
    const closed = await makeClosed(tdb.prisma, coach.id);
    const athlete = await makeAthlete(tdb.prisma);
    const a = await enroll(tdb.prisma, continuous.id, athlete.id);
    const b = await enroll(tdb.prisma, closed.id, athlete.id);
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, continuous.id, { paid: true, amount: 1500 });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, closed.id, { paid: true, amount: 4000 });
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: a.id } })).access).toBe("blocked");
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: b.id } })).access).toBe("free");
  });

  it("rejects an out-of-range amount and a paid → paid change", async () => {
    const gw = fakeStripe();
    const { coach } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 10 }))
      .rejects.toMatchObject({ code: "price_invalid" });
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: null }))
      .rejects.toMatchObject({ code: "invalid_request" });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 });
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("paid → free cancels live subscriptions with made_free and frees everyone", async () => {
    const gw = fakeStripe();
    const { coach, acct } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 });
    const athletes = [await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma)];
    for (const athlete of athletes) await enroll(tdb.prisma, program.id, athlete.id);
    await subscribe(program.id, athletes[0].id, acct, "1");
    await subscribe(program.id, athletes[1].id, acct, "2", "past_due");
    await subscribe(program.id, athletes[2].id, acct, "3", "canceled");
    for (const n of ["1", "2", "3"]) gw.state.subscriptions.set(`sub_${n}`, { status: "active" } as never);
    expect(await countLiveSubscriptions(tdb.prisma, program.id)).toBe(2);

    const result = await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: false, amount: null });
    expect(result).toEqual({ cancelled: 2, failed: [] });
    expect(gw.calls.filter((c) => c.method === "cancelSubscription")).toEqual([
      { method: "cancelSubscription", args: [acct, "sub_1"] },
      { method: "cancelSubscription", args: [acct, "sub_2"] },
    ]);
    const purchases = await tdb.prisma.programPurchase.findMany({ orderBy: { checkoutSessionId: "asc" } });
    expect(purchases.map((p) => p.endedReason)).toEqual(["made_free", "made_free", null]);
    expect(await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({
      priceAmount: null, stripePriceId: null, paidSince: null,
    });
    expect((await tdb.prisma.enrollment.findMany()).map((e) => e.access)).toEqual(["free", "free", "free"]);
  });

  it("a failed cancellation is returned and the program still becomes free", async () => {
    const gw = fakeStripe();
    const { coach, acct } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 });
    const athlete = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, program.id, athlete.id);
    await subscribe(program.id, athlete.id, acct, "1");
    gw.state.failing.add("cancelSubscription");
    const result = await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: false, amount: null });
    expect(result).toEqual({ cancelled: 0, failed: ["sub_1"] });
    expect((await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).priceAmount).toBeNull();
    expect((await tdb.prisma.enrollment.findFirstOrThrow()).access).toBe("free");
  });

  it("an archived program is rejected", async () => {
    const gw = fakeStripe();
    const { coach } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await archiveProgram(tdb.prisma, coach.id, program.id);
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 }))
      .rejects.toMatchObject({ code: "program_archived" });
  });
});
