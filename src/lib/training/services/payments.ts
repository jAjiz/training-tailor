import type { Prisma, ProgramPurchase } from "@/generated/prisma/client";
import { platformFeePercent } from "@/lib/stripe/client";
import {
  DiscountCodeTaken, DiscountInvalid, type AccountSnapshot, type DiscountView, type StripeGateway,
} from "@/lib/stripe/gateway";
import { TrainingError } from "../errors";
import { CANCELLABLE_SUBSCRIPTION, LIVE_SUBSCRIPTION, validatePrice } from "../payments";
import type { DiscountCreate, ProgramPrice } from "../schemas";
import { accessOnJoin, refreshAccess, refreshProgramAccess } from "./access-store";
import { isJoinable } from "./enrollments";
import { assertWritable, getOwnedProgram } from "./programs";
import type { Db, DbOrTx } from "./types";

/** Countries a coach can connect from: Stripe Connect's EU members, the UK and the US (our call). */
export const CONNECT_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "US",
] as const;
export const DEFAULT_CONNECT_COUNTRY = "ES";

export function getStripeAccount(db: Db, coachId: string) {
  return db.stripeAccount.findUnique({ where: { coachId } });
}

/** Creates the coach's connected account in Stripe the first time; later calls return the stored id. */
export async function connectStripe(db: Db, gw: StripeGateway, coachId: string, country: string): Promise<string> {
  const existing = await getStripeAccount(db, coachId);
  if (existing) return existing.stripeAccountId;
  const stripeAccountId = await gw.createAccount(country);
  try {
    await db.stripeAccount.create({ data: { coachId, stripeAccountId } });
    return stripeAccountId;
  } catch (e) {
    // A concurrent call stored its account first: keep that one.
    const winner = await getStripeAccount(db, coachId);
    if (winner) return winner.stripeAccountId;
    throw e;
  }
}

/** The client secret for the embedded components of the coach's account. */
export async function createCoachAccountSession(db: Db, gw: StripeGateway, coachId: string): Promise<string> {
  const account = await getStripeAccount(db, coachId);
  if (!account) throw new TrainingError("not_found");
  return gw.createAccountSession(account.stripeAccountId);
}

/** Stores Stripe's current view of the account. An account we do not know is ignored (webhooks can arrive for any). */
export async function syncStripeAccount(db: DbOrTx, gw: StripeGateway, acct: string): Promise<void> {
  await storeAccountSnapshot(db, acct, await gw.retrieveAccount(acct));
}

/** Stores an account state already read from Stripe (the webhook reads it before its transaction). */
export async function storeAccountSnapshot(db: DbOrTx, acct: string, snapshot: AccountSnapshot): Promise<void> {
  await db.stripeAccount.updateMany({
    where: { stripeAccountId: acct },
    data: {
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      detailsSubmitted: snapshot.detailsSubmitted,
      defaultCurrency: snapshot.defaultCurrency,
    },
  });
}

/** Subscriptions that give access now. */
const liveSubscriptions = (where: Prisma.ProgramPurchaseWhereInput): Prisma.ProgramPurchaseWhereInput => ({
  ...where, kind: "subscription", status: { in: [...LIVE_SUBSCRIPTION] },
});

/** Subscriptions Stripe could still charge (`unpaid` and `incomplete` included): what ending one must cancel. */
export const cancellableSubscriptions = (where: Prisma.ProgramPurchaseWhereInput): Prisma.ProgramPurchaseWhereInput => ({
  ...where, kind: "subscription", status: { in: [...CANCELLABLE_SUBSCRIPTION] },
});

/** How many subscriptions of the program are still running (what making it free would cancel). */
export function countLiveSubscriptions(db: Db, programId: string): Promise<number> {
  return db.programPurchase.count({ where: cancellableSubscriptions({ programId }) });
}

/** Why the app ended a subscription; the webhook keeps the reason when Stripe confirms the cancellation. */
export const APP_ENDED_REASONS = ["coach_removed", "archived", "made_free", "coach_deleted", "granted"] as const;
export type AppEndedReason = (typeof APP_ENDED_REASONS)[number];

/** Subscriptions the app ended (for `reasons`) whose cancellation in Stripe has not gone through yet. */
const pendingCancellations = (programId: string, reasons: readonly AppEndedReason[] = APP_ENDED_REASONS) =>
  cancellableSubscriptions({ programId, endedReason: { in: [...reasons] } });

/**
 * Ends the subscriptions matching `where` that Stripe could still charge: marks them with `reason` (in one transaction with `alongside`, the
 * app-side change that ends them), then asks Stripe to cancel each one at once. Stripe never rolls back or blocks the
 * app-side change: a failed cancellation is logged and its subscription id returned in `failed`, for
 * `retryCancellations`. Without a gateway (payments off) nothing is sent to Stripe.
 */
export async function endSubscriptions(
  db: Db, gw: StripeGateway | null, where: Prisma.ProgramPurchaseWhereInput, reason: AppEndedReason,
  alongside: Prisma.PrismaPromise<unknown>[] = [],
): Promise<{ cancelled: number; failed: string[] }> {
  const running = await db.programPurchase.findMany({ where: cancellableSubscriptions(where) });
  await db.$transaction([
    ...alongside,
    db.programPurchase.updateMany({ where: { id: { in: running.map((p) => p.id) } }, data: { endedReason: reason } }),
  ]);
  return cancelEach(db, gw, running);
}

/**
 * Cancels each subscription in Stripe; a cancelled one is stored as `canceled` (the webhook confirms it later) and
 * its athlete's access recomputed, so a restore before the webhook does not show it as paid.
 */
async function cancelEach(
  db: Db, gw: StripeGateway | null, purchases: ProgramPurchase[],
): Promise<{ cancelled: number; failed: string[] }> {
  const failed: string[] = [];
  let cancelled = 0;
  if (!gw) return { cancelled, failed };
  for (const purchase of purchases) {
    const id = purchase.stripeSubscriptionId;
    if (!id) continue;
    try {
      await gw.cancelSubscription(purchase.stripeAccountId, id);
    } catch (e) {
      console.error("stripe: could not cancel subscription", id, e);
      failed.push(id);
      continue;
    }
    await db.programPurchase.update({ where: { id: purchase.id }, data: { status: "canceled" } });
    await refreshAccess(db, purchase.programId, purchase.athleteId);
    cancelled++;
  }
  return { cancelled, failed };
}

/** Cancels again the subscriptions of the program the app ended and Stripe has not cancelled; returns those that fail again. */
export async function retryCancellations(db: Db, gw: StripeGateway | null, programId: string): Promise<string[]> {
  const pending = await db.programPurchase.findMany({ where: pendingCancellations(programId) });
  return (await cancelEach(db, gw, pending)).failed;
}

/** How many subscriptions of the program the app ended (for `reasons`) but could not cancel in Stripe yet. */
export function countPendingCancellations(
  db: Db, programId: string, reasons: readonly AppEndedReason[] = APP_ENDED_REASONS,
): Promise<number> {
  return db.programPurchase.count({ where: pendingCancellations(programId, reasons) });
}

/** The athletes of the program with a subscription Stripe could still charge (what granting access would cancel). */
export async function cancellableSubscribers(db: Db, programId: string): Promise<Set<string>> {
  const rows = await db.programPurchase.findMany({ where: cancellableSubscriptions({ programId }), select: { athleteId: true } });
  return new Set(rows.map((p) => p.athleteId));
}

/**
 * Grants or revokes the athlete's free access to a paid program. Granting ends their subscription at once
 * (`granted`, no refund); a cancellation Stripe rejects is returned in `failed` (for `retryCancellations`), never
 * thrown: the grant applies anyway. Revoking leaves purchases alone, so the athlete is blocked unless they paid.
 */
export async function setAccessGranted(
  db: Db, gw: StripeGateway | null, coachId: string, enrollmentId: string, granted: boolean,
): Promise<{ cancelledSubscription: boolean; failed: string[] }> {
  const e = await db.enrollment.findFirst({ where: { id: enrollmentId, program: { coachId } }, include: { program: true } });
  if (!e) throw new TrainingError("not_found");
  if (e.removedAt || e.program.priceAmount === null) throw new TrainingError("invalid_request");
  const change = db.enrollment.update({ where: { id: e.id }, data: { accessGrantedAt: granted ? new Date() : null } });
  let result = { cancelled: 0, failed: [] as string[] };
  if (granted) result = await endSubscriptions(db, gw, { programId: e.programId, athleteId: e.athleteId }, "granted", [change]);
  else await change;
  await refreshAccess(db, e.programId, e.athleteId);
  return { cancelledSubscription: result.cancelled > 0, failed: result.failed };
}

/** The date each athlete's subscription to the program ends, for those set to cancel at period end (leaving). */
export async function subscriptionEndings(db: Db, programId: string): Promise<Map<string, Date>> {
  const ending = await db.programPurchase.findMany({
    where: liveSubscriptions({ programId, cancelAtPeriodEnd: true, currentPeriodEnd: { not: null } }),
    select: { athleteId: true, currentPeriodEnd: true },
  });
  return new Map(ending.map((p) => [p.athleteId, p.currentPeriodEnd!]));
}

/** The athlete's live subscriptions by program: when each renews or ends, and whether it is set to end. */
export async function athleteSubscriptions(
  db: Db, athleteId: string,
): Promise<Map<string, { currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean }>> {
  const live = await db.programPurchase.findMany({
    where: liveSubscriptions({ athleteId }),
    select: { programId: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  return new Map(live.map(({ programId, ...rest }) => [programId, rest]));
}

/** Subscriptions still on a price other than the program's current one. */
const pendingPriceSync = (programId: string, priceId: string) =>
  liveSubscriptions({ programId, stripePriceId: { not: priceId } });

/** How many live subscriptions of the program are still on the old price (a price change that did not reach Stripe). */
export async function countPendingPriceSync(db: Db, programId: string): Promise<number> {
  const program = await db.program.findUnique({ where: { id: programId }, select: { stripePriceId: true } });
  if (!program?.stripePriceId) return 0;
  return db.programPurchase.count({ where: pendingPriceSync(programId, program.stripePriceId) });
}

/**
 * Moves every live subscription of the program to its current price, effective at the next renewal (no
 * proration). Stripe's item id is read again each time, as it may have changed. A failure is logged and its
 * subscription id returned in `failed`, never thrown; running it again moves only what is left.
 */
export async function syncSubscriptionPrices(
  db: Db, gw: StripeGateway, programId: string,
): Promise<{ moved: number; failed: string[] }> {
  const program = await db.program.findUnique({ where: { id: programId }, select: { stripePriceId: true } });
  const failed: string[] = [];
  let moved = 0;
  if (!program?.stripePriceId) return { moved, failed };
  const priceId = program.stripePriceId;
  const pending = await db.programPurchase.findMany({ where: pendingPriceSync(programId, priceId), orderBy: { createdAt: "asc" } });
  for (const purchase of pending) {
    const id = purchase.stripeSubscriptionId;
    if (!id) continue;
    try {
      const subscription = await gw.retrieveSubscription(purchase.stripeAccountId, id);
      if (subscription.priceId !== priceId) await gw.updateSubscriptionPrice(purchase.stripeAccountId, id, subscription.itemId, priceId);
    } catch (e) {
      console.error("stripe: could not move subscription to the new price", id, e);
      failed.push(id);
      continue;
    }
    await db.programPurchase.update({ where: { id: purchase.id }, data: { stripePriceId: priceId } });
    moved++;
  }
  return { moved, failed };
}

/**
 * Makes a program paid or free, or changes the amount of a paid one. Going free ends every live subscription: the
 * database is updated first, then Stripe is asked to cancel each one. A new amount creates a new Stripe price, stores
 * it, and (continuous programs) moves the live subscriptions to it from their next renewal. Stripe failures after the
 * database change are returned (subscription ids), never thrown.
 */
export async function setProgramPrice(
  db: Db, gw: StripeGateway, coachId: string, programId: string, input: ProgramPrice,
): Promise<{ cancelled: number; moved: number; failed: string[] }> {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  const none = { cancelled: 0, moved: 0, failed: [] as string[] };

  if (!input.paid) {
    if (program.priceAmount === null) return none;
    const ended = await endSubscriptions(db, gw, { programId }, "made_free", [
      db.program.update({ where: { id: programId }, data: { priceAmount: null, stripePriceId: null, paidSince: null } }),
    ]);
    await refreshProgramAccess(db, programId);
    return { ...none, ...ended };
  }

  if (input.amount === null) throw new TrainingError("invalid_request");
  if (program.priceAmount === input.amount) return none;
  const account = await getStripeAccount(db, coachId);
  if (!account?.chargesEnabled || !account.defaultCurrency) throw new TrainingError("stripe_not_ready");
  const currency = program.currency ?? account.defaultCurrency;
  if (currency !== account.defaultCurrency) throw new TrainingError("invalid_request"); // fixed once set
  validatePrice(input.amount, currency);
  const acct = account.stripeAccountId;
  let productId = program.stripeProductId;
  if (!productId) {
    productId = await gw.createProduct(acct, program.name);
    // Stored before the price so a failed createPrice does not orphan the product on retry.
    await db.program.update({ where: { id: programId }, data: { stripeProductId: productId } });
  }
  const priceId = await gw.createPrice(acct, {
    productId, amount: input.amount, currency, monthly: program.kind === "continuous",
  });
  const wasPaid = program.priceAmount !== null;
  await db.program.update({
    where: { id: programId },
    data: { priceAmount: input.amount, currency, stripePriceId: priceId, ...(wasPaid ? {} : { paidSince: new Date() }) },
  });
  if (!wasPaid) await refreshProgramAccess(db, programId);
  // Closed programs charge once: their purchases keep the price they paid.
  if (!wasPaid || program.kind !== "continuous") return none;
  return { ...none, ...(await syncSubscriptionPrices(db, gw, programId)) };
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

type PayingAthlete = { id: string; userId: string; displayName: string; email: string };

/** Whether the program's coach can take payments now (a paid program shows its pay button only then). */
export async function canCharge(db: Db, coachId: string | null): Promise<boolean> {
  if (!coachId) return false;
  return (await getStripeAccount(db, coachId))?.chargesEnabled ?? false;
}

/** The athlete's customer on the coach's account, created in Stripe the first time. */
async function customerFor(db: Db, gw: StripeGateway, athlete: PayingAthlete, acct: string): Promise<string> {
  const key = { athleteId_stripeAccountId: { athleteId: athlete.id, stripeAccountId: acct } };
  const existing = await db.stripeCustomer.findUnique({ where: key });
  if (existing) return existing.stripeCustomerId;
  const stripeCustomerId = await gw.createCustomer(acct, { email: athlete.email, name: athlete.displayName, athleteId: athlete.id });
  try {
    await db.stripeCustomer.create({ data: { athleteId: athlete.id, stripeAccountId: acct, stripeCustomerId } });
    return stripeCustomerId;
  } catch (e) {
    // A concurrent checkout stored its customer first: use that one.
    const winner = isUniqueViolation(e) ? await db.stripeCustomer.findUnique({ where: key }) : null;
    if (winner) return winner.stripeCustomerId;
    throw e;
  }
}

/**
 * Opens a Checkout Session on the coach's account for the program's current price and returns its URL. The athlete
 * reaches it through a joinable invitation or an enrollment they already have (the blocked screen). Access is never
 * granted here: the webhook does that when the session completes.
 */
export async function startCheckout(
  db: Db, gw: StripeGateway, athlete: PayingAthlete, programId: string, urls: { success: string; cancel: string },
): Promise<string> {
  const program = await db.program.findUnique({ where: { id: programId }, include: { coach: true } });
  if (!program || program.archivedAt || program.priceAmount === null || !program.stripePriceId || !program.currency) {
    throw new TrainingError("invalid_request");
  }
  const enrollment = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId, athleteId: athlete.id } },
  });
  if (enrollment?.removedAt) throw new TrainingError("enrollment_removed");
  if (!enrollment && !isJoinable(program)) throw new TrainingError("invalid_request");
  const account = program.coachId ? await getStripeAccount(db, program.coachId) : null;
  if (!account?.chargesEnabled) throw new TrainingError("stripe_not_ready");
  if ((await accessOnJoin(db, programId, athlete.id)) !== "blocked") throw new TrainingError("already_paid");

  const acct = account.stripeAccountId;
  const customerId = await customerFor(db, gw, athlete, acct);
  const kind = program.kind === "continuous" ? "subscription" : "payment";
  const session = await gw.createCheckoutSession(acct, {
    mode: kind,
    priceId: program.stripePriceId,
    customerId,
    successUrl: urls.success,
    cancelUrl: urls.cancel,
    clientReferenceId: athlete.id,
    metadata: { programId, athleteId: athlete.id },
    feePercent: platformFeePercent(),
    amount: program.priceAmount,
  });
  await db.programPurchase.create({
    data: {
      programId, athleteId: athlete.id, kind, stripeAccountId: acct, checkoutSessionId: session.id, status: "pending",
      stripePriceId: program.stripePriceId, amount: program.priceAmount, currency: program.currency,
    },
  });
  return session.url;
}

/** The program the athlete's Checkout Session was for, or null for someone else's or an unknown session. */
export async function checkoutProgramId(db: Db, athleteId: string, checkoutSessionId: string): Promise<string | null> {
  const purchase = await db.programPurchase.findUnique({ where: { checkoutSessionId }, select: { programId: true, athleteId: true } });
  return purchase?.athleteId === athleteId ? purchase.programId : null;
}

/** The athlete's stored access to a program they are active in; null when not (yet) enrolled, left or removed. */
export async function getEnrollmentAccess(db: Db, athleteId: string, programId: string): Promise<string | null> {
  const enrollment = await db.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  if (!enrollment || enrollment.removedAt || enrollment.leftAt) return null;
  return enrollment.access;
}

/**
 * Creates a discount code on the coach's account. `programIds` (paid programs of the coach) become the Stripe
 * products it applies to; none means every product. A fixed amount is in the account's currency. Stripe's refusals
 * come back as `coupon_code_taken` (the code exists) or `coupon_invalid` (any other rejected value).
 */
export async function createDiscount(db: Db, gw: StripeGateway, coachId: string, input: DiscountCreate): Promise<void> {
  const account = await getStripeAccount(db, coachId);
  if (!account?.chargesEnabled) throw new TrainingError("stripe_not_ready");
  if (input.amount !== null && !account.defaultCurrency) throw new TrainingError("stripe_not_ready");
  const programIds = [...new Set(input.programIds)];
  const programs = await db.program.findMany({
    where: { id: { in: programIds }, coachId, stripeProductId: { not: null }, priceAmount: { not: null } },
    select: { stripeProductId: true },
  });
  if (programs.length !== programIds.length) throw new TrainingError("invalid_request");
  try {
    await gw.createDiscount(account.stripeAccountId, {
      code: input.code,
      percentOff: input.percentOff,
      amountOff: input.amount,
      currency: account.defaultCurrency ?? "",
      duration: input.duration,
      durationInMonths: input.durationInMonths,
      productIds: programs.map((p) => p.stripeProductId as string),
      maxRedemptions: input.maxRedemptions,
      expiresAt: input.expiresAt,
    });
  } catch (e) {
    if (e instanceof DiscountCodeTaken) throw new TrainingError("coupon_code_taken");
    if (e instanceof DiscountInvalid) throw new TrainingError("coupon_invalid");
    throw e;
  }
}

/** The coach's discount codes, read from Stripe; none before connecting. */
export async function listDiscounts(db: Db, gw: StripeGateway, coachId: string): Promise<DiscountView[]> {
  const account = await getStripeAccount(db, coachId);
  return account ? gw.listDiscounts(account.stripeAccountId) : [];
}

/** Turns a discount code off (Stripe neither edits nor deletes them). Scoped to the coach's account: another coach's id fails in Stripe. */
export async function deactivateDiscount(db: Db, gw: StripeGateway, coachId: string, promotionCodeId: string): Promise<void> {
  const account = await getStripeAccount(db, coachId);
  if (!account) throw new TrainingError("not_found");
  await gw.deactivateDiscount(account.stripeAccountId, promotionCodeId);
}
