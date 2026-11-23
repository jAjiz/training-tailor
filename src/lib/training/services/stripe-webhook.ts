import type { ProgramPurchase } from "@/generated/prisma/client";
import type { StripeGateway, SubscriptionSnapshot } from "@/lib/stripe/gateway";
import type { NotificationIntent } from "@/lib/notifications/notify";
import { LIVE_SUBSCRIPTION } from "../payments";
import { refreshAccess } from "./access-store";
import { athleteJoinedIntents, enterProgram } from "./enrollments";
import { storeAccountSnapshot, type AppEndedReason } from "./payments";
import type { Db, DbOrTx } from "./types";

/** A verified Stripe event, reduced to what the handlers read. `account` is the connected account it came from. */
export type WebhookEvent = { id: string; type: string; account: string | null; object: Record<string, unknown> };

type Json = Record<string, unknown>;

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";
const DUPLICATE = Symbol("duplicate Stripe event");

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** An id field Stripe sends as a string, or as the object when expanded. */
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v)?.id);

/** A one-time payment session counts as paid when it was charged, or when a discount left nothing to charge. */
const PAID_SESSION = ["paid", "no_payment_required"];

/** A completed checkout the app does not keep: cancelled and refunded in Stripe after the transaction commits. */
type Undo = {
  purchaseId: string;
  reason: Extract<AppEndedReason, "duplicate" | "coach_removed" | "coach_deleted" | "archived" | "made_free" | "granted">;
  subscriptionId: string | null;
  paymentIntentId: string | null;
};

/**
 * Applies a Stripe event to purchases and access and returns the notifications to send. Webhooks are the source of
 * truth for access. Stripe is read before the transaction and written after it (cancelling and refunding a checkout
 * the app does not keep); the event id is stored in the same transaction as the effects, so an event delivered again
 * does nothing. Subscription events apply the subscription as Stripe has it now, never the payload, so out-of-order
 * delivery converges. Unknown types do nothing.
 */
export async function handleStripeEvent(
  db: Db, gw: StripeGateway, event: WebhookEvent, now: Date = new Date(),
): Promise<NotificationIntent[]> {
  if (await db.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return [];
  const acct = event.account;
  const object = event.object;
  switch (event.type) {
    case "account.updated": {
      const id = acct ?? str(object.id);
      if (!id) return once(db, event, async () => []);
      const snapshot = await gw.retrieveAccount(id);
      return once(db, event, async (tx) => {
        await storeAccountSnapshot(tx, id, snapshot);
        return [];
      });
    }
    case "checkout.session.completed": {
      if (!acct) return once(db, event, async () => []);
      const subscriptionId = object.mode === "subscription" ? idOf(object.subscription) : null;
      const snapshot = subscriptionId ? await gw.retrieveSubscription(acct, subscriptionId) : null;
      const after: { undo: Undo | null } = { undo: null };
      const intents = await once(db, event, async (tx) => {
        const result = await checkoutCompleted(tx, acct, object, snapshot, now);
        after.undo = result.undo;
        return result.intents;
      });
      // Set only by a delivery whose transaction committed: a redelivered event never refunds twice.
      if (after.undo) await undoCheckout(gw, acct, after.undo);
      return intents;
    }
    case "charge.refunded": {
      // Measured on the charge itself: a discount makes it differ from the program's price.
      const full = typeof object.amount === "number" && typeof object.amount_refunded === "number"
        && object.amount_refunded >= object.amount;
      const paymentIntentId = idOf(object.payment_intent);
      return once(db, event, async (tx) => {
        if (full && acct && paymentIntentId) await endPayment(tx, acct, paymentIntentId, "refunded");
        return [];
      });
    }
    case "charge.dispute.closed": {
      const paymentIntentId = idOf(object.payment_intent);
      return once(db, event, async (tx) => {
        if (object.status === "lost" && acct && paymentIntentId) await endPayment(tx, acct, paymentIntentId, "dispute_lost");
        return [];
      });
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const id = str(object.id);
      if (!acct || !id) return once(db, event, async () => []);
      // Stripe is asked only about a subscription the app has, of the account the event came from. Not linked yet:
      // checkout.session.completed applies the subscription when it arrives.
      const known = await db.programPurchase.findUnique({ where: { stripeSubscriptionId: id }, select: { stripeAccountId: true } });
      if (known?.stripeAccountId !== acct) return once(db, event, async () => []);
      const snapshot = await gw.retrieveSubscription(acct, id);
      return once(db, event, async (tx) => {
        const purchase = await tx.programPurchase.findUnique({ where: { stripeSubscriptionId: id } });
        if (!purchase) return [];
        await applySubscription(tx, purchase, snapshot, now);
        await refreshAccess(tx, purchase.programId, purchase.athleteId);
        return [];
      });
    }
    default:
      return [];
  }
}

/** Runs `effects` in one transaction with the event's `StripeEvent` row; an event already stored returns []. */
async function once(
  db: Db, event: WebhookEvent, effects: (tx: DbOrTx) => Promise<NotificationIntent[]>,
): Promise<NotificationIntent[]> {
  try {
    return await db.$transaction(async (tx) => {
      try {
        await tx.stripeEvent.create({ data: { id: event.id, type: event.type, account: event.account } });
      } catch (e) {
        throw isUniqueViolation(e) ? DUPLICATE : e;
      }
      return effects(tx);
    });
  } catch (e) {
    if (e === DUPLICATE) return []; // delivered twice at once: the other delivery applied it
    throw e;
  }
}

const nothing = (): { intents: NotificationIntent[]; undo: Undo | null } => ({ intents: [], undo: null });

async function checkoutCompleted(
  tx: DbOrTx, acct: string, session: Json, snapshot: SubscriptionSnapshot | null, now: Date,
): Promise<{ intents: NotificationIntent[]; undo: Undo | null }> {
  const sessionId = str(session.id);
  const stored = sessionId ? await tx.programPurchase.findUnique({ where: { checkoutSessionId: sessionId } }) : null;
  if (stored && stored.stripeAccountId !== acct) {
    console.warn("stripe webhook: checkout session from another account than its purchase", sessionId, acct);
    return nothing();
  }
  const purchase = stored ?? (sessionId ? await purchaseFromMetadata(tx, acct, sessionId, session) : null);
  if (!purchase) {
    console.warn("stripe webhook: checkout session without a purchase or valid metadata", sessionId, acct);
    return nothing();
  }
  const { programId, athleteId } = purchase;
  const amount = typeof session.amount_total === "number" ? session.amount_total : purchase.amount;
  const promotionCode = promotionCodeOf(session) ?? undefined;
  let paymentIntentId: string | null = null;

  if (purchase.kind === "subscription") {
    if (!snapshot) return nothing();
    const linked = await tx.programPurchase.update({
      where: { id: purchase.id }, data: { stripeSubscriptionId: snapshot.id, amount, promotionCode },
    });
    await applySubscription(tx, linked, snapshot, now);
    if (snapshot.status === "canceled") {
      // Delivered after the subscription ended: enrolling would undo a leftAt the cancellation just set.
      await refreshAccess(tx, programId, athleteId);
      return nothing();
    }
  } else {
    if (!PAID_SESSION.includes(str(session.payment_status) ?? "")) return nothing();
    paymentIntentId = idOf(session.payment_intent);
    await tx.programPurchase.update({
      where: { id: purchase.id }, data: { status: "paid", stripePaymentIntentId: paymentIntentId, amount, promotionCode },
    });
  }

  const reason = await unwantedReason(tx, purchase);
  if (reason) {
    await tx.programPurchase.update({ where: { id: purchase.id }, data: { endedReason: reason } });
    await refreshAccess(tx, programId, athleteId);
    return {
      intents: [],
      undo: { purchaseId: purchase.id, reason, subscriptionId: snapshot?.id ?? null, paymentIntentId },
    };
  }
  const intents = await enrollPayer(tx, programId, athleteId, now);
  await refreshAccess(tx, programId, athleteId);
  return { intents, undo: null };
}

/**
 * Why a paid checkout is not kept. Between opening it and paying: the coach removed the athlete (`coach_removed`), the
 * coach was deleted (`coach_deleted`), the program was archived (`archived`) or made free (`made_free`), or the coach
 * granted the athlete access (`granted`). Or the athlete already has another purchase giving access to the program,
 * e.g. paid in two tabs (`duplicate`).
 */
async function unwantedReason(tx: DbOrTx, purchase: ProgramPurchase): Promise<Undo["reason"] | null> {
  const { programId, athleteId } = purchase;
  const enrollment = await tx.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  if (enrollment?.removedAt) return "coach_removed";
  const program = await tx.program.findUniqueOrThrow({ where: { id: programId } });
  // Before made_free: deleting the coach also clears the price.
  if (program.coachId === null) return "coach_deleted";
  if (program.archivedAt) return "archived";
  if (program.priceAmount === null) return "made_free";
  if (enrollment?.accessGrantedAt) return "granted";
  const original = await tx.programPurchase.findFirst({
    where: {
      programId, athleteId, id: { not: purchase.id }, endedReason: null,
      OR: [
        { kind: "subscription", status: { in: [...LIVE_SUBSCRIPTION] } },
        { kind: "payment", status: "paid" },
      ],
    },
    select: { id: true },
  });
  return original ? "duplicate" : null;
}

/**
 * Cancels and refunds a checkout the app did not keep. Runs after the transaction, so a Stripe failure cannot be
 * retried by redelivery (the event is stored): it is logged and the event still succeeds. The purchase keeps its
 * `endedReason`, so a subscription whose cancellation failed is retried with the program's other pending cancellations.
 */
async function undoCheckout(gw: StripeGateway, acct: string, undo: Undo): Promise<void> {
  const attempt = async (what: string, call: () => Promise<void>) => {
    try {
      await call();
    } catch (e) {
      console.error(`stripe webhook: could not ${what} a ${undo.reason} checkout; do it in Stripe`, undo.purchaseId, e);
    }
  };
  const { subscriptionId, paymentIntentId } = undo;
  if (subscriptionId) {
    await attempt("cancel the subscription of", () => gw.cancelSubscription(acct, subscriptionId));
    await attempt("refund the first invoice of", () => gw.refundSubscriptionFirstInvoice(acct, subscriptionId));
  } else if (paymentIntentId) {
    await attempt("refund the payment of", () => gw.refundPaymentIntent(acct, paymentIntentId));
  }
}

/** A one-time payment of the account fully refunded or lost in a dispute: it no longer gives access. Subscription charges are ignored. */
async function endPayment(tx: DbOrTx, acct: string, paymentIntentId: string, status: "refunded" | "dispute_lost") {
  const purchase = await tx.programPurchase.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!purchase || purchase.stripeAccountId !== acct || purchase.kind !== "payment") return;
  await tx.programPurchase.update({ where: { id: purchase.id }, data: { status } });
  await refreshAccess(tx, purchase.programId, purchase.athleteId);
}

/**
 * A completed session the app has no row for (e.g. its insert failed after Stripe created it): built from its
 * metadata. Metadata is written by whoever created the session, and a coach can create sessions on their own
 * account, so it is trusted only for a program of the coach who owns the event's account, in that program's mode.
 */
async function purchaseFromMetadata(tx: DbOrTx, acct: string, sessionId: string, session: Json) {
  const metadata = obj(session.metadata);
  const programId = str(metadata?.programId);
  const athleteId = str(metadata?.athleteId);
  const kind = session.mode === "subscription" ? "subscription" : session.mode === "payment" ? "payment" : null;
  if (!programId || !athleteId || !kind) return null;
  // One query at a time: a transaction holds a single connection.
  const program = await tx.program.findUnique({ where: { id: programId } });
  const athlete = await tx.athleteAccount.findUnique({ where: { id: athleteId }, select: { id: true } });
  if (!program?.stripePriceId || !program.currency || !program.coachId || !athlete) return null;
  if (kind !== (program.kind === "continuous" ? "subscription" : "payment")) return null;
  const account = await tx.stripeAccount.findUnique({ where: { coachId: program.coachId } });
  if (account?.stripeAccountId !== acct) return null;
  return tx.programPurchase.create({
    data: {
      programId, athleteId, kind, stripeAccountId: acct, checkoutSessionId: sessionId, status: "pending",
      stripePriceId: program.stripePriceId, currency: str(session.currency) ?? program.currency,
      amount: typeof session.amount_total === "number" ? session.amount_total : (program.priceAmount ?? 0),
    },
  });
}

/** Enrolls (or brings back) a payer who is not active in the program; a removed athlete stays removed. */
async function enrollPayer(tx: DbOrTx, programId: string, athleteId: string, now: Date): Promise<NotificationIntent[]> {
  const program = await tx.program.findUniqueOrThrow({ where: { id: programId }, include: { coach: true } });
  const athlete = await tx.athleteAccount.findUniqueOrThrow({ where: { id: athleteId } });
  const enrollment = await tx.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  if (enrollment && (enrollment.removedAt || !enrollment.leftAt)) return []; // removed, or paying from the blocked screen
  const status = await enterProgram(tx, program, athlete, enrollment, now);
  return status === "already" ? [] : athleteJoinedIntents(program, athlete);
}

/**
 * Mirrors the subscription onto its purchase. Once it is canceled, the reason it ended is set unless the app set one
 * already: non-payment → `payment_failed`; at period end (the athlete left in the app or cancelled in the portal) →
 * `athlete`, who leaves the program; at once (the coach cancelled in Stripe) → `coach_stripe`, the athlete stays.
 */
async function applySubscription(tx: DbOrTx, purchase: ProgramPurchase, snapshot: SubscriptionSnapshot, now: Date) {
  let endedReason: string | undefined;
  if (snapshot.status === "canceled" && !purchase.endedReason) {
    endedReason = snapshot.cancellationReason === "payment_failed" ? "payment_failed"
      : snapshot.cancelAtPeriodEnd ? "athlete" : "coach_stripe";
  }
  await tx.programPurchase.update({
    where: { id: purchase.id },
    data: {
      status: snapshot.status, currentPeriodEnd: snapshot.currentPeriodEnd, cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      endedReason,
    },
  });
  if (endedReason === "athlete") {
    await tx.enrollment.updateMany({
      where: { programId: purchase.programId, athleteId: purchase.athleteId, leftAt: null },
      data: { leftAt: now },
    });
  }
}

/** The promotion code's text when Stripe sent it expanded; an id alone is not stored. */
function promotionCodeOf(session: Json): string | null {
  const candidates = [
    ...list(obj(obj(session.total_details)?.breakdown)?.discounts).map((d) => obj(obj(d)?.discount)?.promotion_code),
    ...list(session.discounts).map((d) => obj(d)?.promotion_code),
  ];
  for (const c of candidates) {
    const code = str(obj(c)?.code);
    if (code) return code;
  }
  return null;
}
