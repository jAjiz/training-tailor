import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { fakeStripe } from "../../helpers/fake-stripe";
import {
  enroll, leave, makeAthlete, makeClosed, makeCoach, makeContinuous, makePaidContinuous, makeSubscriptionPurchase,
} from "../../helpers/factories";
import {
  cancellableSubscribers, connectStripe, countLiveSubscriptions, countPendingCancellations, createCoachAccountSession,
  createDiscount, deactivateDiscount, listDiscounts, athleteSubscriptions, latestSubscriptionPurchase, openPortal,
  countPendingPriceSync, getStripeAccount, retryCancellations, setAccessGranted, setProgramPrice, startCheckout, syncStripeAccount, syncSubscriptionPrices,
} from "@/lib/training/services/payments";
import type { DiscountCreate } from "@/lib/training/schemas";
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

  it("rejects an out-of-range amount and a missing one", async () => {
    const gw = fakeStripe();
    const { coach } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 10 }))
      .rejects.toMatchObject({ code: "price_invalid" });
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: null }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  describe("price changes", () => {
    async function subscribed(gw: ReturnType<typeof fakeStripe>, kind: "continuous" | "closed" = "continuous") {
      const { coach, acct } = await chargingCoach(gw);
      const program = kind === "continuous" ? await makeContinuous(tdb.prisma, coach.id) : await makeClosed(tdb.prisma, coach.id);
      await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 });
      const oldPrice = (await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).stripePriceId!;
      const athletes = [await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma)];
      for (const [i, athlete] of athletes.entries()) {
        await enroll(tdb.prisma, program.id, athlete.id);
        await tdb.prisma.programPurchase.create({
          data: {
            programId: program.id, athleteId: athlete.id, kind: kind === "continuous" ? "subscription" : "payment",
            stripeAccountId: acct, checkoutSessionId: `cs_${i + 1}`, stripeSubscriptionId: `sub_${i + 1}`,
            status: i === 2 ? "canceled" : i === 1 ? "past_due" : "active", stripePriceId: oldPrice, amount: 1500, currency: "eur",
          },
        });
        gw.addSubscription(`sub_${i + 1}`, { priceId: oldPrice, itemId: `si_${i + 1}` });
      }
      return { coach, acct, program };
    }
    const updates = (gw: ReturnType<typeof fakeStripe>) => gw.calls.filter((c) => c.method === "updateSubscriptionPrice");
    const storedPrices = async () =>
      (await tdb.prisma.programPurchase.findMany({ orderBy: { checkoutSessionId: "asc" } })).map((p) => p.stripePriceId);

    it("a new amount creates a new price and calls updateSubscriptionPrice once per live subscription", async () => {
      const gw = fakeStripe();
      const { coach, acct, program } = await subscribed(gw);
      const result = await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 });
      expect(result).toEqual({ cancelled: 0, moved: 2, failed: [] });
      expect(gw.state.prices.get("price_2")).toMatchObject({ amount: 2000, monthly: true, currency: "eur" });
      expect(await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({
        priceAmount: 2000, stripePriceId: "price_2",
      });
      expect(updates(gw)).toEqual([
        { method: "updateSubscriptionPrice", args: [acct, "sub_1", "si_1", "price_2"] },
        { method: "updateSubscriptionPrice", args: [acct, "sub_2", "si_2", "price_2"] },
      ]);
      expect(await storedPrices()).toEqual(["price_2", "price_2", "price_1"]);
    });

    it("uses the subscription item Stripe has now, not a stored one", async () => {
      const gw = fakeStripe();
      const { coach, acct, program } = await subscribed(gw);
      gw.state.subscriptions.get("sub_1")!.itemId = "si_new";
      await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 });
      expect(updates(gw)[0].args).toEqual([acct, "sub_1", "si_new", "price_2"]);
    });

    it("a second run moves nothing", async () => {
      const gw = fakeStripe();
      const { coach, program } = await subscribed(gw);
      await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 });
      expect(await syncSubscriptionPrices(tdb.prisma, gw.gateway, program.id)).toEqual({ moved: 0, failed: [] });
      expect(updates(gw)).toHaveLength(2);
    });

    it("a failure is reported and a retry moves it", async () => {
      const gw = fakeStripe();
      const { coach, program } = await subscribed(gw);
      gw.state.failing.add("updateSubscriptionPrice");
      const result = await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 });
      expect(result).toEqual({ cancelled: 0, moved: 0, failed: ["sub_1", "sub_2"] });
      expect(await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({ priceAmount: 2000 });
      expect(await countPendingPriceSync(tdb.prisma, program.id)).toBe(2);
      gw.state.failing.delete("updateSubscriptionPrice");
      expect(await syncSubscriptionPrices(tdb.prisma, gw.gateway, program.id)).toEqual({ moved: 2, failed: [] });
      expect(await countPendingPriceSync(tdb.prisma, program.id)).toBe(0);
    });

    it("a closed program's price change touches no purchase", async () => {
      const gw = fakeStripe();
      const { coach, program } = await subscribed(gw, "closed");
      const result = await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 5000 });
      expect(result).toEqual({ cancelled: 0, moved: 0, failed: [] });
      expect(await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({ priceAmount: 5000 });
      expect(updates(gw)).toEqual([]);
      expect(await storedPrices()).toEqual(["price_1", "price_1", "price_1"]);
    });

    it("the same amount is a no-op", async () => {
      const gw = fakeStripe();
      const { coach, program } = await subscribed(gw);
      expect(await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 }))
        .toEqual({ cancelled: 0, moved: 0, failed: [] });
      expect(gw.state.prices.size).toBe(1);
      expect(updates(gw)).toEqual([]);
    });
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
    expect(result).toEqual({ cancelled: 2, moved: 0, failed: [] });
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
    expect(result).toEqual({ cancelled: 0, moved: 0, failed: ["sub_1"] });
    expect((await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).priceAmount).toBeNull();
    expect((await tdb.prisma.enrollment.findFirstOrThrow()).access).toBe("free");
  });

  it("the currency stays fixed once set", async () => {
    const gw = fakeStripe();
    const { coach, acct } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: false, amount: null });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 });
    expect(await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({ currency: "eur", priceAmount: 2000 });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: false, amount: null });
    gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "usd" });
    await syncStripeAccount(tdb.prisma, gw.gateway, acct);
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 2000 }))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect((await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).currency).toBe("eur");
  });

  it("a failed createPrice keeps the product, and a retry reuses it", async () => {
    const gw = fakeStripe();
    const { coach } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    gw.state.failing.add("createPrice");
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 })).rejects.toThrow();
    expect(await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toMatchObject({
      stripeProductId: "prod_1", priceAmount: null,
    });
    gw.state.failing.delete("createPrice");
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 });
    expect(gw.calls.filter((c) => c.method === "createProduct")).toHaveLength(1);
    expect([...gw.state.prices.values()][0].productId).toBe("prod_1");
  });

  it("an archived program is rejected", async () => {
    const gw = fakeStripe();
    const { coach } = await chargingCoach(gw);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await archiveProgram(tdb.prisma, null, coach.id, program.id);
    await expect(setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 1500 }))
      .rejects.toMatchObject({ code: "program_archived" });
  });
});

describe("startCheckout", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  const urls = { success: "https://app.test/join/x/confirm?session={CHECKOUT_SESSION_ID}", cancel: "https://app.test/join/x" };
  const buyer = async () => {
    const athlete = await makeAthlete(tdb.prisma);
    return { id: athlete.id, userId: athlete.userId, displayName: athlete.displayName, email: "buyer@test.local" };
  };
  async function paidProgram(gw: ReturnType<typeof fakeStripe>, kind: "continuous" | "closed" = "continuous") {
    const coach = await makeCoach(tdb.prisma);
    const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur" });
    await syncStripeAccount(tdb.prisma, gw.gateway, acct);
    const program = kind === "continuous" ? await makeContinuous(tdb.prisma, coach.id) : await makeClosed(tdb.prisma, coach.id);
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: kind === "continuous" ? 1500 : 4000 });
    return { coach, acct, program: await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } }) };
  }
  const sessions = (gw: ReturnType<typeof fakeStripe>) =>
    gw.calls.filter((c) => c.method === "createCheckoutSession").map((c) => c.args);

  it("startCheckout creates a subscription session with the program's price, customer and metadata", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await buyer();
    const url = await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    expect(url).toBe("https://checkout.stripe.test/cs_1");
    expect(gw.state.customers.get("cus_1")).toEqual({
      acct, email: "buyer@test.local", name: athlete.displayName, athleteId: athlete.id,
    });
    expect(sessions(gw)).toEqual([[acct, {
      mode: "subscription", priceId: program.stripePriceId, customerId: "cus_1", successUrl: urls.success,
      cancelUrl: urls.cancel, clientReferenceId: athlete.id, metadata: { programId: program.id, athleteId: athlete.id },
      feePercent: 0, amount: 1500,
    }]]);
  });

  it("a closed program opens a one-time payment session", async () => {
    const gw = fakeStripe();
    const { program } = await paidProgram(gw, "closed");
    await startCheckout(tdb.prisma, gw.gateway, await buyer(), program.id, urls);
    expect(sessions(gw)[0][1]).toMatchObject({ mode: "payment", amount: 4000 });
  });

  it("it reuses the athlete's customer on the same coach account", async () => {
    const gw = fakeStripe();
    const { acct, coach, program } = await paidProgram(gw);
    const other = await makeContinuous(tdb.prisma, coach.id);
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, other.id, { paid: true, amount: 2000 });
    const athlete = await buyer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await startCheckout(tdb.prisma, gw.gateway, athlete, other.id, urls);
    expect(gw.calls.filter((c) => c.method === "createCustomer")).toHaveLength(1);
    expect(sessions(gw).map(([, input]) => (input as { customerId: string }).customerId)).toEqual(["cus_1", "cus_1", "cus_1"]);
    expect(await tdb.prisma.stripeCustomer.findMany()).toEqual([
      { athleteId: athlete.id, stripeAccountId: acct, stripeCustomerId: "cus_1" },
    ]);
  });

  it("it refuses a removed athlete, a paid athlete and a coach without charges", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const removed = await buyer();
    const e = await enroll(tdb.prisma, program.id, removed.id);
    await tdb.prisma.enrollment.update({ where: { id: e.id }, data: { removedAt: new Date() } });
    await expect(startCheckout(tdb.prisma, gw.gateway, removed, program.id, urls))
      .rejects.toMatchObject({ code: "enrollment_removed" });

    const paid = await buyer();
    await enroll(tdb.prisma, program.id, paid.id);
    await tdb.prisma.programPurchase.create({
      data: {
        programId: program.id, athleteId: paid.id, kind: "subscription", stripeAccountId: acct, checkoutSessionId: "cs_paid",
        stripeSubscriptionId: "sub_paid", status: "active", stripePriceId: program.stripePriceId!, amount: 1500, currency: "eur",
      },
    });
    await expect(startCheckout(tdb.prisma, gw.gateway, paid, program.id, urls)).rejects.toMatchObject({ code: "already_paid" });

    await tdb.prisma.stripeAccount.update({ where: { stripeAccountId: acct }, data: { chargesEnabled: false } });
    await expect(startCheckout(tdb.prisma, gw.gateway, await buyer(), program.id, urls))
      .rejects.toMatchObject({ code: "stripe_not_ready" });
    expect(sessions(gw)).toEqual([]);
  });

  it("it refuses a free, an archived and an unjoinable program the athlete is not enrolled in", async () => {
    const gw = fakeStripe();
    const { coach, program } = await paidProgram(gw);
    const free = await makeContinuous(tdb.prisma, coach.id);
    await expect(startCheckout(tdb.prisma, gw.gateway, await buyer(), free.id, urls))
      .rejects.toMatchObject({ code: "invalid_request" });

    await tdb.prisma.program.update({ where: { id: program.id }, data: { inviteDisabledAt: new Date() } });
    await expect(startCheckout(tdb.prisma, gw.gateway, await buyer(), program.id, urls))
      .rejects.toMatchObject({ code: "invalid_request" });
    const enrolled = await buyer();
    const e = await enroll(tdb.prisma, program.id, enrolled.id);
    await leave(tdb.prisma, e.id);
    await expect(startCheckout(tdb.prisma, gw.gateway, enrolled, program.id, urls)).resolves.toMatch(/^https:/);

    await tdb.prisma.program.update({ where: { id: program.id }, data: { archivedAt: new Date() } });
    await expect(startCheckout(tdb.prisma, gw.gateway, enrolled, program.id, urls))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("fee is omitted at 0 and sent at 10 %", async () => {
    const gw = fakeStripe();
    const { program } = await paidProgram(gw);
    vi.stubEnv("PLATFORM_FEE_PERCENT", "0");
    await startCheckout(tdb.prisma, gw.gateway, await buyer(), program.id, urls);
    vi.stubEnv("PLATFORM_FEE_PERCENT", "10");
    await startCheckout(tdb.prisma, gw.gateway, await buyer(), program.id, urls);
    expect(sessions(gw).map(([, input]) => (input as { feePercent: number }).feePercent)).toEqual([0, 10]);
  });

  it("it stores a pending purchase", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await buyer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    expect(await tdb.prisma.programPurchase.findMany()).toMatchObject([{
      programId: program.id, athleteId: athlete.id, kind: "subscription", status: "pending", stripeAccountId: acct,
      checkoutSessionId: "cs_1", stripePriceId: program.stripePriceId, amount: 1500, currency: "eur",
      stripeSubscriptionId: null,
    }]);
  });

  it("a pending purchase does not count as paid: a blocked athlete can start again", async () => {
    const gw = fakeStripe();
    const { program } = await paidProgram(gw);
    const athlete = await buyer();
    await enroll(tdb.prisma, program.id, athlete.id);
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await expect(startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls)).resolves.toMatch(/^https:/);
  });
});

describe("setAccessGranted", () => {
  const acct = "acct_test";

  async function paidProgram() {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const program = await makePaidContinuous(db, coach.id);
    const athlete = await makeAthlete(db);
    const enrollment = await enroll(db, program.id, athlete.id);
    return { coach, program, athlete, enrollment };
  }
  const enrollmentOf = (id: string) => tdb.prisma.enrollment.findUniqueOrThrow({ where: { id } });

  it("granting gives access without a purchase", async () => {
    const { gateway, calls } = fakeStripe();
    const { coach, enrollment } = await paidProgram();
    expect(await setAccessGranted(tdb.prisma, gateway, coach.id, enrollment.id, true))
      .toEqual({ cancelledSubscription: false, failed: [] });
    expect(await enrollmentOf(enrollment.id)).toMatchObject({ access: "granted" });
    expect((await enrollmentOf(enrollment.id)).accessGrantedAt).not.toBeNull();
    expect(calls).toEqual([]);
  });

  it("granting cancels a live subscription with granted", async () => {
    const gw = fakeStripe();
    const { coach, program, athlete, enrollment } = await paidProgram();
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1");
    gw.addSubscription("sub_1");
    expect(await setAccessGranted(tdb.prisma, gw.gateway, coach.id, enrollment.id, true))
      .toEqual({ cancelledSubscription: true, failed: [] });
    expect(gw.calls.filter((c) => c.method === "cancelSubscription")).toEqual([
      { method: "cancelSubscription", args: [acct, "sub_1"] },
    ]);
    expect(await tdb.prisma.programPurchase.findUniqueOrThrow({ where: { checkoutSessionId: "cs_1" } }))
      .toMatchObject({ endedReason: "granted", status: "canceled" });
    expect(await enrollmentOf(enrollment.id)).toMatchObject({ access: "granted" });
  });

  it("a failed cancellation still grants and is retried with the granted reason", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const gw = fakeStripe();
    const { coach, program, athlete, enrollment } = await paidProgram();
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1");
    gw.addSubscription("sub_1");
    gw.state.failing.add("cancelSubscription");
    expect(await setAccessGranted(tdb.prisma, gw.gateway, coach.id, enrollment.id, true))
      .toEqual({ cancelledSubscription: false, failed: ["sub_1"] });
    expect(await enrollmentOf(enrollment.id)).toMatchObject({ access: "granted" });
    expect(await countPendingCancellations(tdb.prisma, program.id, ["granted"])).toBe(1);
    gw.state.failing.delete("cancelSubscription");
    expect(await retryCancellations(tdb.prisma, gw.gateway, program.id)).toEqual([]);
    expect(await countPendingCancellations(tdb.prisma, program.id)).toBe(0);
    error.mockRestore();
  });

  it("cancellableSubscribers lists the athletes with a subscription Stripe could still charge", async () => {
    const { program, athlete } = await paidProgram();
    expect(await cancellableSubscribers(tdb.prisma, program.id)).toEqual(new Set());
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1");
    expect(await cancellableSubscribers(tdb.prisma, program.id)).toEqual(new Set([athlete.id]));
  });

  it("revoking without a purchase blocks", async () => {
    const { gateway } = fakeStripe();
    const { coach, enrollment } = await paidProgram();
    await setAccessGranted(tdb.prisma, gateway, coach.id, enrollment.id, true);
    expect(await setAccessGranted(tdb.prisma, gateway, coach.id, enrollment.id, false))
      .toEqual({ cancelledSubscription: false, failed: [] });
    expect(await enrollmentOf(enrollment.id)).toMatchObject({ access: "blocked", accessGrantedAt: null });
  });

  it("granting on a free program is invalid_request", async () => {
    const { gateway } = fakeStripe();
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const athlete = await makeAthlete(tdb.prisma);
    const enrollment = await enroll(tdb.prisma, program.id, athlete.id);
    await expect(setAccessGranted(tdb.prisma, gateway, coach.id, enrollment.id, true))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("granting a removed enrollment is invalid_request", async () => {
    const { gateway } = fakeStripe();
    const { coach, enrollment } = await paidProgram();
    await tdb.prisma.enrollment.update({ where: { id: enrollment.id }, data: { removedAt: new Date() } });
    await expect(setAccessGranted(tdb.prisma, gateway, coach.id, enrollment.id, true))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("another coach's enrollment is not_found", async () => {
    const { gateway } = fakeStripe();
    const { enrollment } = await paidProgram();
    const other = await makeCoach(tdb.prisma);
    await expect(setAccessGranted(tdb.prisma, gateway, other.id, enrollment.id, true))
      .rejects.toMatchObject({ code: "not_found" });
  });
});

describe("discount codes", () => {
  const input = (over: Partial<DiscountCreate> = {}): DiscountCreate => ({
    code: "SPRING20", percentOff: 20, amount: null, duration: "once", durationInMonths: null, programIds: [],
    maxRedemptions: null, expiresAt: null, ...over,
  });

  async function setup(currency: string | null = "eur", gw = fakeStripe()) {
    const coach = await makeCoach(tdb.prisma);
    const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: currency });
    await syncStripeAccount(tdb.prisma, gw.gateway, acct);
    const paid = await makePaidContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: paid.id }, data: { stripeProductId: "prod_paid" } });
    return { gw, coach, acct, paid };
  }

  it("maps programs to product ids and creates the discount on the coach's account", async () => {
    const { gw, coach, acct, paid } = await setup();
    await createDiscount(tdb.prisma, gw.gateway, coach.id, input({ programIds: [paid.id], maxRedemptions: 5 }));
    expect(gw.calls.filter((c) => c.method === "createDiscount")).toEqual([{
      method: "createDiscount",
      args: [acct, {
        code: "SPRING20", percentOff: 20, amountOff: null, currency: "eur", duration: "once", durationInMonths: null,
        productIds: ["prod_paid"], maxRedemptions: 5, expiresAt: null,
      }],
    }]);
  });

  it("a fixed amount uses the account currency and needs it", async () => {
    const { gw, coach } = await setup();
    await createDiscount(tdb.prisma, gw.gateway, coach.id, input({ percentOff: null, amount: 500 }));
    expect([...gw.state.discounts.values()][0].view).toMatchObject({ percentOff: null, amountOff: 500, currency: "eur" });
    const none = await setup(null, gw);
    await expect(createDiscount(tdb.prisma, gw.gateway, none.coach.id, input({ percentOff: null, amount: 500 })))
      .rejects.toMatchObject({ code: "stripe_not_ready" });
  });

  it("without a connected account is stripe_not_ready", async () => {
    const coach = await makeCoach(tdb.prisma);
    await expect(createDiscount(tdb.prisma, fakeStripe().gateway, coach.id, input()))
      .rejects.toMatchObject({ code: "stripe_not_ready" });
  });

  it("rejects another coach's program, a free program and an unknown one", async () => {
    const { gw, coach } = await setup();
    const other = await makeCoach(tdb.prisma);
    const theirs = await makePaidContinuous(tdb.prisma, other.id);
    await tdb.prisma.program.update({ where: { id: theirs.id }, data: { stripeProductId: "prod_theirs" } });
    const free = await makeContinuous(tdb.prisma, coach.id);
    for (const id of [theirs.id, free.id, "missing"]) {
      await expect(createDiscount(tdb.prisma, gw.gateway, coach.id, input({ programIds: [id] })))
        .rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(gw.calls.filter((c) => c.method === "createDiscount")).toEqual([]);
  });

  it("a taken code is coupon_code_taken", async () => {
    const { gw, coach } = await setup();
    await createDiscount(tdb.prisma, gw.gateway, coach.id, input());
    await expect(createDiscount(tdb.prisma, gw.gateway, coach.id, input())).rejects.toMatchObject({ code: "coupon_code_taken" });
  });

  it("other Stripe rejections are coupon_invalid", async () => {
    const { gw, coach } = await setup();
    gw.state.rejectDiscounts = true;
    await expect(createDiscount(tdb.prisma, gw.gateway, coach.id, input())).rejects.toMatchObject({ code: "coupon_invalid" });
  });

  it("listDiscounts reads the coach's account; without one it is empty", async () => {
    const { gw, coach, acct } = await setup();
    await createDiscount(tdb.prisma, gw.gateway, coach.id, input());
    expect((await listDiscounts(tdb.prisma, gw.gateway, coach.id)).map((d) => d.code)).toEqual(["SPRING20"]);
    expect(gw.calls.filter((c) => c.method === "listDiscounts")).toEqual([{ method: "listDiscounts", args: [acct] }]);
    expect(await listDiscounts(tdb.prisma, gw.gateway, (await makeCoach(tdb.prisma)).id)).toEqual([]);
  });

  it("deactivate calls the gateway on the coach's account", async () => {
    const { gw, coach, acct } = await setup();
    await createDiscount(tdb.prisma, gw.gateway, coach.id, input());
    await deactivateDiscount(tdb.prisma, gw.gateway, coach.id, "promo_1");
    expect(gw.calls.filter((c) => c.method === "deactivateDiscount")).toEqual([
      { method: "deactivateDiscount", args: [acct, "promo_1"] },
    ]);
    expect([...gw.state.discounts.values()][0].view.active).toBe(false);
  });

  it("deactivating without an account is not_found", async () => {
    const coach = await makeCoach(tdb.prisma);
    await expect(deactivateDiscount(tdb.prisma, fakeStripe().gateway, coach.id, "promo_1"))
      .rejects.toMatchObject({ code: "not_found" });
  });
});

describe("Customer Portal", () => {
  const returnUrl = "https://app.test/me";
  async function subscriber(gw: ReturnType<typeof fakeStripe>) {
    const coach = await makeCoach(tdb.prisma);
    const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    const program = await makePaidContinuous(tdb.prisma, coach.id);
    const athlete = await makeAthlete(tdb.prisma);
    await tdb.prisma.stripeCustomer.create({ data: { athleteId: athlete.id, stripeAccountId: acct, stripeCustomerId: "cus_1" } });
    return { coach, acct, program, athlete };
  }

  it("the portal configuration is created once per coach account", async () => {
    const gw = fakeStripe();
    const { coach, acct, program, athlete } = await subscriber(gw);
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1");
    const first = await openPortal(tdb.prisma, gw.gateway, athlete.id, program.id, returnUrl);
    const second = await openPortal(tdb.prisma, gw.gateway, athlete.id, program.id, returnUrl);
    expect(first).toMatch(/^https:\/\/portal\.stripe\.test\//);
    expect(second).toMatch(/^https:\/\/portal\.stripe\.test\//);
    expect(gw.calls.filter((c) => c.method === "createPortalConfiguration")).toHaveLength(1);
    const stored = (await getStripeAccount(tdb.prisma, coach.id))!.portalConfigurationId;
    expect(stored).toEqual(expect.any(String));
    const session = { method: "createPortalSession", args: [acct, { customerId: "cus_1", configurationId: stored, returnUrl }] };
    expect(gw.calls.filter((c) => c.method === "createPortalSession")).toEqual([session, session]);
  });

  it("a configuration stored by a concurrent call wins", async () => {
    const gw = fakeStripe();
    const { coach, acct, program, athlete } = await subscriber(gw);
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1");
    const original = gw.gateway.createPortalConfiguration;
    gw.gateway.createPortalConfiguration = async (a) => {
      const id = await original(a);
      await tdb.prisma.stripeAccount.update({ where: { coachId: coach.id }, data: { portalConfigurationId: "bpc_first" } });
      return id;
    };
    await openPortal(tdb.prisma, gw.gateway, athlete.id, program.id, returnUrl);
    expect((await getStripeAccount(tdb.prisma, coach.id))!.portalConfigurationId).toBe("bpc_first");
    expect(gw.calls.find((c) => c.method === "createPortalSession")!.args[1]).toMatchObject({ configurationId: "bpc_first" });
  });

  it("openPortal without a purchase is not_found", async () => {
    const gw = fakeStripe();
    const { program, athlete } = await subscriber(gw);
    await expect(openPortal(tdb.prisma, gw.gateway, athlete.id, program.id, returnUrl)).rejects.toMatchObject({ code: "not_found" });
    expect(gw.calls.filter((c) => c.method.startsWith("createPortal"))).toEqual([]);
  });

  it("openPortal without a customer on the coach's account is not_found", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscriber(gw);
    await tdb.prisma.stripeCustomer.deleteMany({});
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1");
    await expect(openPortal(tdb.prisma, gw.gateway, athlete.id, program.id, returnUrl)).rejects.toMatchObject({ code: "not_found" });
  });

  it("athleteSubscriptions shows leaving subscriptions with their end date and status", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscriber(gw);
    const end = new Date("2026-12-01T00:00:00Z");
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1", { currentPeriodEnd: end, cancelAtPeriodEnd: true });
    expect(await athleteSubscriptions(tdb.prisma, athlete.id)).toEqual(
      new Map([[program.id, { status: "active", currentPeriodEnd: end, cancelAtPeriodEnd: true }]]),
    );
  });

  it("athleteSubscriptions includes unpaid ones and skips canceled and pending", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscriber(gw);
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1", { status: "canceled" });
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "2", { status: "pending" });
    expect((await athleteSubscriptions(tdb.prisma, athlete.id)).size).toBe(0);
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "3", { status: "unpaid" });
    expect((await athleteSubscriptions(tdb.prisma, athlete.id)).get(program.id)).toMatchObject({ status: "unpaid" });
  });

  it("latestSubscriptionPurchase is the newest of any status", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscriber(gw);
    expect(await latestSubscriptionPurchase(tdb.prisma, athlete.id, program.id)).toBeNull();
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "1", { status: "active" });
    await makeSubscriptionPurchase(tdb.prisma, program.id, athlete.id, acct, "2", { status: "unpaid" });
    expect(await latestSubscriptionPurchase(tdb.prisma, athlete.id, program.id)).toMatchObject({ status: "unpaid" });
  });
});
