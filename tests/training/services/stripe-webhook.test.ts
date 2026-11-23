import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

  it("a session from another account with valid metadata is ignored", async () => {
    const gw = fakeStripe();
    const { program } = await paidProgram(gw);
    const other = await paidProgram(gw);
    const athlete = await payer();
    subscription(gw, "sub_9");
    const intents = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", other.acct, {
      id: "cs_forged", mode: "subscription", payment_status: "paid", subscription: "sub_9", amount_total: 1500,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(intents).toEqual([]);
    expect(await tdb.prisma.programPurchase.count()).toBe(0);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
  });

  it("a session whose mode does not match the program's kind is ignored", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw); // continuous: subscription only
    const athlete = await payer();
    await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_mode", mode: "payment", payment_status: "paid", payment_intent: "pi_m", amount_total: 100,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(await tdb.prisma.programPurchase.count()).toBe(0);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
  });

  it("a pending purchase receiving the session from a different account is not changed", async () => {
    const gw = fakeStripe();
    const { program } = await paidProgram(gw, "closed");
    const other = await paidProgram(gw, "closed");
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    const before = await purchaseOf(program.id, athlete.id);
    await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", other.acct, {
      id: before.checkoutSessionId, mode: "payment", payment_status: "paid", payment_intent: "pi_x", amount_total: 100,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(await purchaseOf(program.id, athlete.id)).toEqual(before);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
  });

  it("a completed checkout delivered after its subscription ended does not enroll again", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    const e = await enroll(tdb.prisma, program.id, athlete.id);
    await leave(tdb.prisma, e.id);
    subscription(gw, "sub_1", { status: "canceled", cancelAtPeriodEnd: true, cancellationReason: "cancellation_requested" });
    const intents = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_1", mode: "subscription", payment_status: "paid", subscription: "sub_1", amount_total: 1500,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(intents).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "canceled", endedReason: "athlete" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ leftAt: expect.any(Date), access: "blocked" });
  });

  it("a failure inside the transaction rolls back the event, and the redelivery applies it", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw, "closed");
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    const completed = event("checkout.session.completed", acct, {
      id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 4000,
      metadata: { programId: program.id, athleteId: athlete.id },
    });
    // Enrolling fails once: after the StripeEvent insert and the purchase update.
    let armed = true;
    const failing = new Proxy(tdb.prisma, {
      get(target, prop) {
        if (prop !== "$transaction") return Reflect.get(target, prop);
        return (fn: (tx: object) => Promise<unknown>) => target.$transaction((tx) => fn(new Proxy(tx, {
          get(t, p) {
            if (p === "enrollment" && armed) {
              armed = false;
              return new Proxy({}, { get: () => () => Promise.reject(new Error("boom")) });
            }
            return Reflect.get(t, p);
          },
        })));
      },
    });
    await expect(handleStripeEvent(failing, gw.gateway, completed)).rejects.toThrow("boom");
    expect(await tdb.prisma.stripeEvent.count()).toBe(0);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "pending" });

    expect(await handleStripeEvent(tdb.prisma, gw.gateway, completed)).toHaveLength(1);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "paid" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ access: "paid" });
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

  it("a removed athlete's completed checkout is recorded, cancelled and refunded as coach_removed, without restoring the enrollment", async () => {
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
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({
      status: "active", stripeSubscriptionId: "sub_1", endedReason: "coach_removed",
    });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ removedAt: expect.any(Date), leftAt: expect.any(Date) });
    expect(gw.state.subscriptions.get("sub_1")!.status).toBe("canceled");
    expect(gw.state.refunds).toEqual([{ acct, subscriptionId: "sub_1" }]);
  });

  it("a removed athlete's completed payment is refunded as coach_removed", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw, "closed");
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    const e = await enroll(tdb.prisma, program.id, athlete.id);
    await tdb.prisma.enrollment.update({ where: { id: e.id }, data: { removedAt: new Date(), leftAt: new Date() } });
    const intents = await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 4000,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    expect(intents).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "paid", endedReason: "coach_removed" });
    expect(gw.state.refunds).toEqual([{ acct, paymentIntentId: "pi_1" }]);
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

describe("refunds, disputes and duplicates", () => {
  /** A closed program the athlete paid with payment intent `pi_1` (4000). */
  async function paidClosed(gw: Gw) {
    const { acct, program } = await paidProgram(gw, "closed");
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
      id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 4000,
      metadata: { programId: program.id, athleteId: athlete.id },
    }));
    return { acct, program, athlete };
  }
  const refunded = (acct: string, over: Record<string, unknown> = {}) =>
    event("charge.refunded", acct, { id: "ch_1", payment_intent: "pi_1", amount: 4000, amount_refunded: 4000, ...over });

  it("a full refund of a closed payment blocks", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await paidClosed(gw);
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, refunded(acct))).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "refunded" });
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("blocked");
  });

  it("a full refund is measured on the charge's amount, after a discount", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await paidClosed(gw);
    await handleStripeEvent(tdb.prisma, gw.gateway, refunded(acct, { amount: 3000, amount_refunded: 3000 }));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "refunded" });
  });

  it("a partial refund keeps access", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await paidClosed(gw);
    await handleStripeEvent(tdb.prisma, gw.gateway, refunded(acct, { amount_refunded: 1000 }));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "paid" });
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");
  });

  it("a refund from another account or of an unknown payment is recorded and changes nothing", async () => {
    const gw = fakeStripe();
    const { program, athlete } = await paidClosed(gw);
    const other = await paidProgram(gw, "closed");
    const forged = refunded(other.acct);
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, forged)).toEqual([]);
    const unknown = refunded(other.acct, { payment_intent: "pi_unknown" });
    await handleStripeEvent(tdb.prisma, gw.gateway, unknown);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "paid" });
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");
    expect(await tdb.prisma.stripeEvent.count({ where: { id: { in: [forged.id, unknown.id] } } })).toBe(2);
  });

  it("a lost dispute blocks; a won one changes nothing", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete } = await paidClosed(gw);
    const dispute = (status: string) =>
      event("charge.dispute.closed", acct, { id: "dp_1", status, charge: "ch_1", payment_intent: "pi_1" });
    await handleStripeEvent(tdb.prisma, gw.gateway, dispute("won"));
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "paid" });
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, dispute("lost"))).toEqual([]);
    expect(await purchaseOf(program.id, athlete.id)).toMatchObject({ status: "dispute_lost" });
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("blocked");
  });

  it("a refund on a subscription charge changes nothing", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await pay(gw, acct, program.id, athlete);
    // A subscription purchase stores no payment intent; even one linked by hand is not changed.
    const before = await tdb.prisma.programPurchase.update({
      where: { id: (await purchaseOf(program.id, athlete.id)).id }, data: { stripePaymentIntentId: "pi_sub" },
    });
    await handleStripeEvent(tdb.prisma, gw.gateway, refunded(acct, { payment_intent: "pi_sub", amount: 1200, amount_refunded: 1200 }));
    await handleStripeEvent(tdb.prisma, gw.gateway, event("charge.dispute.closed", acct, { id: "dp_1", status: "lost", payment_intent: "pi_sub" }));
    expect(await purchaseOf(program.id, athlete.id)).toEqual(before);
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");
  });

  /** The athlete opens Checkout twice (two tabs) for a continuous program; both are stored as pending. */
  async function twoTabs(gw: Gw) {
    const { acct, program } = await paidProgram(gw);
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    subscription(gw, "sub_1");
    subscription(gw, "sub_2");
    const completed = (session: string, sub: string) => event("checkout.session.completed", acct, {
      id: session, mode: "subscription", payment_status: "paid", subscription: sub, amount_total: 1500,
      metadata: { programId: program.id, athleteId: athlete.id },
    });
    await handleStripeEvent(tdb.prisma, gw.gateway, completed("cs_1", "sub_1"));
    return { acct, program, athlete, second: completed("cs_2", "sub_2") };
  }
  const bySession = (id: string) => tdb.prisma.programPurchase.findUniqueOrThrow({ where: { checkoutSessionId: id } });

  it("a second completed checkout is cancelled and refunded as duplicate", async () => {
    const gw = fakeStripe();
    const { acct, program, athlete, second } = await twoTabs(gw);
    expect(await handleStripeEvent(tdb.prisma, gw.gateway, second)).toEqual([]);

    expect(await bySession("cs_2")).toMatchObject({ stripeSubscriptionId: "sub_2", endedReason: "duplicate" });
    expect(await bySession("cs_1")).toMatchObject({ status: "active", endedReason: null });
    expect(gw.state.subscriptions.get("sub_2")!.status).toBe("canceled");
    expect(gw.state.subscriptions.get("sub_1")!.status).toBe("active");
    expect(gw.state.refunds).toEqual([{ acct, subscriptionId: "sub_2" }]);
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");

    // Redelivered: nothing is cancelled or refunded twice.
    await handleStripeEvent(tdb.prisma, gw.gateway, second);
    expect(gw.state.refunds).toHaveLength(1);

    // Stripe confirms the cancellation: the duplicate keeps its reason, the athlete keeps access.
    await handleStripeEvent(tdb.prisma, gw.gateway, subscriptionEvent("deleted", acct, "sub_2"));
    expect(await bySession("cs_2")).toMatchObject({ status: "canceled", endedReason: "duplicate" });
    expect(await enrollmentOf(program.id, athlete.id)).toMatchObject({ access: "paid", leftAt: null });
  });

  it("a second completed payment for a closed program is refunded as duplicate", async () => {
    const gw = fakeStripe();
    const { acct, program } = await paidProgram(gw, "closed");
    const athlete = await payer();
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    await startCheckout(tdb.prisma, gw.gateway, athlete, program.id, urls);
    for (const [session, pi] of [["cs_1", "pi_1"], ["cs_2", "pi_2"]]) {
      await handleStripeEvent(tdb.prisma, gw.gateway, event("checkout.session.completed", acct, {
        id: session, mode: "payment", payment_status: "paid", payment_intent: pi, amount_total: 4000,
        metadata: { programId: program.id, athleteId: athlete.id },
      }));
    }
    expect(await bySession("cs_2")).toMatchObject({ status: "paid", endedReason: "duplicate" });
    expect(await bySession("cs_1")).toMatchObject({ status: "paid", endedReason: null });
    expect(gw.state.refunds).toEqual([{ acct, paymentIntentId: "pi_2" }]);

    // The refund arrives: the original payment still gives access.
    await handleStripeEvent(tdb.prisma, gw.gateway, refunded(acct, { payment_intent: "pi_2" }));
    expect(await bySession("cs_2")).toMatchObject({ status: "refunded" });
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");
  });

  it("a duplicate whose cancellation and refund fail is still recorded and the event succeeds", async () => {
    const gw = fakeStripe();
    const { program, athlete, second } = await twoTabs(gw);
    gw.state.failing.add("cancelSubscription");
    gw.state.failing.add("refundSubscriptionFirstInvoice");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(handleStripeEvent(tdb.prisma, gw.gateway, second)).resolves.toEqual([]);
      expect(errors).toHaveBeenCalledTimes(2);
    } finally {
      errors.mockRestore();
    }
    expect(await bySession("cs_2")).toMatchObject({ status: "active", endedReason: "duplicate" });
    expect(await tdb.prisma.stripeEvent.count({ where: { id: second.id } })).toBe(1);
    expect((await enrollmentOf(program.id, athlete.id)).access).toBe("paid");
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
