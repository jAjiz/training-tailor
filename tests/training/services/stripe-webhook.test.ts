import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { fakeStripe } from "../../helpers/fake-stripe";
import { enroll, leave, makeAthlete, makeClosed, makeCoach, makeContinuous } from "../../helpers/factories";
import type { SubscriptionSnapshot } from "@/lib/stripe/gateway";
import { toDbDate } from "@/lib/training/dates";
import { connectStripe, getStripeAccount, setProgramPrice, startCheckout, syncStripeAccount } from "@/lib/training/services/payments";
import { handleStripeEvent, type WebhookEvent } from "@/lib/training/services/stripe-webhook";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

type Gw = ReturnType<typeof fakeStripe>;
const urls = { success: "https://app.test/ok", cancel: "https://app.test/cancel" };
let eventSeq = 0;

async function paidProgram(gw: Gw, kind: "continuous" | "closed" = "continuous") {
  const coach = await makeCoach(tdb.prisma);
  const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
  gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur" });
  await syncStripeAccount(tdb.prisma, gw.gateway, acct);
  const created = kind === "continuous" ? await makeContinuous(tdb.prisma, coach.id) : await makeClosed(tdb.prisma, coach.id);
  await setProgramPrice(tdb.prisma, gw.gateway, coach.id, created.id, { paid: true, amount: kind === "continuous" ? 1500 : 4000 });
  const program = await tdb.prisma.program.findUniqueOrThrow({ where: { id: created.id } });
  return { coach, acct, program };
}

async function payer(timezone = "Europe/Madrid") {
  const athlete = await makeAthlete(tdb.prisma, timezone);
  return { ...athlete, email: "payer@test.local" };
}

const event = (type: string, account: string | null, object: Record<string, unknown>): WebhookEvent =>
  ({ id: `evt_${++eventSeq}`, type, account, object });

function subscription(gw: Gw, id: string, over: Partial<SubscriptionSnapshot> = {}) {
  gw.state.subscriptions.set(id, {
    id, status: "active", customerId: "cus_1", priceId: "price_1", itemId: `si_${id}`,
    currentPeriodEnd: new Date("2026-12-23T00:00:00Z"), cancelAtPeriodEnd: false, cancellationReason: null, ...over,
  });
}

/** The athlete opens Checkout for a continuous program and completes it with subscription `sub_1`. */
async function pay(gw: Gw, acct: string, programId: string, athlete: Awaited<ReturnType<typeof payer>>) {
  await startCheckout(tdb.prisma, gw.gateway, athlete, programId, urls);
  const sessionId = [...gw.state.checkoutSessions.keys()].at(-1)!;
  subscription(gw, "sub_1");
  return handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
    id: sessionId, mode: "subscription", payment_status: "paid", subscription: "sub_1", amount_total: 1200,
    metadata: { programId, athleteId: athlete.id }, discounts: [{ promotion_code: { id: "promo_1", code: "WELCOME" } }],
  }));
}

const enrollmentOf = (programId: string, athleteId: string) =>
  tdb.prisma.enrollment.findUniqueOrThrow({ where: { programId_athleteId: { programId, athleteId } } });
const purchaseOf = (programId: string, athleteId: string) =>
  tdb.prisma.programPurchase.findFirstOrThrow({ where: { programId, athleteId } });
const subscriptionEvent = (type: string, acct: string, id = "sub_1") =>
  event(`customer.subscription.${type}`, acct, { id, object: "subscription", status: "incomplete" });

describe("checkout.session.completed", () => {
  it("checkout completed (subscription) enrolls the athlete, stores the subscription and grants paid access, with one athlete_joined intent", async () => {
    const gw = fakeStripe();
    const { acct, coach, program } = await paidProgram(gw);
    const athlete = await payer();
    const intents = await pay(gw, acct, program.id, athlete);

    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({
      kind: "subscription", status: "active", stripeSubscriptionId: "sub_1", amount: 1200, promotionCode: "WELCOME",
      currentPeriodEnd: new Date("2026-12-23T00:00:00Z"), cancelAtPeriodEnd: false, endedReason: null,
    });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ access: "paid", leftAt: null, startDate: null });
    const coachUser = await tdb.prisma.coachAccount.findUniqueOrThrow({ where: { id: coach.id } });
    expect(intents).toEqual([expect.objectContaining({
      kind: "athlete_joined", recipients: [{ userId: coachUser.userId, locale: coachUser.locale }],
      data: { programId: program.id, programName: program.name, athleteName: athlete.displayName },
    })]);
  });

  it("checkout completed (payment) on a closed program sets startDate to today in the athlete's time zone", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw, "closed");
    const athlete = await payer("Pacific/Kiritimati");
    const now = new Date("2026-11-23T12:00:00Z"); // already the 24th in Kiritimati (UTC+14)
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 3000,
      metadata: { programId: program.id, athleteId: athlete.id },
      total_details: { breakdown: { discounts: [{ discount: { promotion_code: { id: "promo_1", code: "SPRING" } } }] } },
    }), now);

    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({
      startDate: toDbDate("2026-11-24"), access: "paid", leftAt: null,
    });
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({
      kind: "payment", status: "paid", stripePaymentIntentId: "pi_1", amount: 3000, promotionCode: "SPRING",
    });
  });

  it("an unpaid payment session records nothing paid and does not enroll", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw, "closed");
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    const intents = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_1", mode: "payment", payment_status: "unpaid", payment_intent: "pi_1", amount_total: 4000,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(intents).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "pending" });
    expect(await tdb.prisma.enrollment.count()).toBe(0);
  });

  it("a session the app never stored is created from its metadata; one without valid metadata is ignored", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    subscription(gw, "sub_9");
    await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_unknown", mode: "subscription", payment_status: "paid", subscription: "sub_9", amount_total: 1500,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({
      checkoutSessionId: "cs_unknown", stripeAccountId: acct, kind: "subscription", status: "active",
      stripeSubscriptionId: "sub_9", stripePriceId: program.stripePriceId, currency: "eur",
    });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ access: "paid" });

    const ignored = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_other", mode: "payment", payment_status: "paid", payment_intent: "pi_x", amount_total: 100,
      metadata: { programId: "nope", athleteId: athlete.id },
    }));
    expect(ignored).toEqual([]);
    expect(await tdb.prisma.programPurchase.count()).toBe(1);
  });

  it("the same event twice changes nothing and returns no intents the second time", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    subscription(gw, "sub_1");
    const completed = event("checkout.session.completed", acct, {
      id: "cs_1", mode: "subscription", payment_status: "paid", subscription: "sub_1", amount_total: 1500,
      metadata: { programId: program.id, athleteId: athlete.id },
    });
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, completed)).toHaveLength(1);
    const before = { purchase: await purchaseOf(program.id, athlete.id), enrollment: await enrollmentOf(program.id, athlete.id) };
    await leave(tdb.prisma, before.enrollment.id);
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, completed)).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toEqual(before.purchase);
    expect((await enrollmentOf(program.id, athlete.id)).leftAt).not.toBeNull(); // not re-applied
    expect(await tdb.prisma.stripeEvent.findMany()).toMatchObject([{ id: completed.id, type: "checkout.session.completed", account: acct }]);
  });

  it("a closed athlete who joined before paidSince, left and rejoins by paying keeps joinedAt", async () => {
    const gw = fakeStripe();
    const coach = await makeCoach(tdb.prisma);
    const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur" });
    await syncStripeAccount(tdb.prisma, gw.gateway, acct);
    const program = await makeClosed(tdb.prisma, coach.id);
    const athlete = await payer();
    const joined = await enroll(tdb.prisma, program.id, athlete.id, "2026-10-05");
    await tdb.prisma.enrollment.update({ where: { id: joined.id }, data: { joinedAt: new Date("2026-10-05T08:00:00Z") } });
    await setProgramPrice(tdb.prisma, gw.gateway, coach.id, program.id, { paid: true, amount: 4000 });
    await leave(tdb.prisma, joined.id);
    // Paying is possible only while blocked, so a purchase is recorded as Stripe would after any checkout.
    await tdb.prisma.programPurchase.create({
      data: {
        programId: program.id, athleteId: athlete.id, kind: "payment", stripeAccountId: acct, checkoutSessionId: "cs_r",
        status: "pending", stripePriceId: "price_1", amount: 4000, currency: "eur",
      },
    });
    const intents = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_r", mode: "payment", payment_status: "paid", payment_intent: "pi_r", amount_total: 4000,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(intents.map((i) => i.kind)).toEqual(["athlete_joined"]);
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({
      leftAt: null, joinedAt: new Date("2026-10-05T08:00:00Z"), startDate: toDbDate("2026-10-05"), access: "free",
    });
  });

  it("a removed athlete's completed checkout records the purchase and does not restore the enrollment", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    const e = await enroll(tdb.prisma, program.id, athlete.id);
    await tdb.prisma.enrollment.update({ where: { id: e.id }, data: { removedAt: new Date(), leftAt: new Date() } });
    subscription(gw, "sub_1");
    const intents = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_1", mode: "subscription", payment_status: "paid", subscription: "sub_1", amount_total: 1500,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(intents).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "active", stripeSubscriptionId: "sub_1" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ removedAt: expect.any(Date), leftAt: expect.any(Date) });
  });

  it("paying from the blocked screen only refreshes access", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await enroll(tdb.prisma, program.id, athlete.id);
    expect(await pay(gw, acct, program.id, athlete)).toEqual([]);
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ access: "paid", leftAt: null });
  });
});

describe("customer.subscription.*", () => {
  async function subscribed(gw: Gw) {
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await pay(gw, acct, program.id, athlete);
    return { acct, program, athlete };
  }
  const setSub = (gw: Gw, over: Partial<SubscriptionSnapshot>) => Object.assign(gw.state.subscriptions.get("sub_1")!, over);

  it("subscription updated before created converges on the fake's current state", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscribed(gw);
    setSub(gw, { status: "past_due", currentPeriodEnd: new Date("2027-01-23T00:00:00Z"), cancelAtPeriodEnd: true });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("updated", acct));
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("created", acct));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({
      status: "past_due", currentPeriodEnd: new Date("2027-01-23T00:00:00Z"), cancelAtPeriodEnd: true,
    });
  });

  it("past_due keeps access; unpaid blocks", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscribed(gw);
    setSub(gw, { status: "past_due" });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("updated", acct));
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");
    setSub(gw, { status: "unpaid" });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("updated", acct));
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("blocked");
  });

  it("deleted after cancel_at_period_end sets leftAt with endedReason athlete", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscribed(gw);
    setSub(gw, { status: "canceled", cancelAtPeriodEnd: true, cancellationReason: "cancellation_requested" });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("deleted", acct));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "canceled", endedReason: "athlete" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ leftAt: expect.any(Date), access: "blocked" });
  });

  it("deleted at once with no app reason → coach_stripe, still enrolled, blocked", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscribed(gw);
    setSub(gw, { status: "canceled", cancellationReason: "cancellation_requested" });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("deleted", acct));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "canceled", endedReason: "coach_stripe" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ leftAt: null, access: "blocked" });
  });

  it("deleted for payment_failed → blocked", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscribed(gw);
    setSub(gw, { status: "canceled", cancellationReason: "payment_failed" });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("deleted", acct));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "canceled", endedReason: "payment_failed" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ leftAt: null, access: "blocked" });
  });

  it("deleted for a purchase the app ended keeps the app's endedReason", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await subscribed(gw);
    const purchase = await purchaseOf(program.id, athlete.id);
    await tdb.prisma.programPurchase.update({ where: { id: purchase.id }, data: { endedReason: "granted" } });
    setSub(gw, { status: "canceled", cancelAtPeriodEnd: true, cancellationReason: "cancellation_requested" });
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("deleted", acct));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "canceled", endedReason: "granted" });
    expect((await enrollmentOf(program.id, athlete.id)).leftAt).toBeNull();
  });

  it("an unknown subscription is ignored", async () => {
    const gw = fakeStripe();
    const { acct } = await paidProgram(gw);
    subscription(gw, "sub_stranger");
    await expect(handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("updated", acct, "sub_stranger"))).resolves.toEqual([]);
    expect(await tdb.prisma.programPurchase.count()).toBe(0);
  });
});

describe("other events", () => {
  it("account.updated stores the flags", async () => {
    const gw = fakeStripe();
    const coach = await makeCoach(tdb.prisma);
    const acct = await connectStripe(tdb.prisma, gw.gateway, coach.id, "ES");
    gw.state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, defaultCurrency: "usd" });
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, event("account.updated", acct, { id: acct }))).toEqual([]);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toMatchObject({
      chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, defaultCurrency: "usd",
    });
  });

  it("an unknown type does nothing and returns no intents", async () => {
    const gw = fakeStripe();
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, event("invoice.paid", "acct_1", { id: "in_1" }))).toEqual([]);
    expect(gw.calls).toEqual([]);
  });
});
