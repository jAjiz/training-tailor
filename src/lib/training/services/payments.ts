import type { Prisma, ProgramPurchase } from "@/generated/prisma/client";
import { platformFeePercent } from "@/lib/stripe/client";
import type { AccountSnapshot, StripeGateway } from "@/lib/stripe/gateway";
import { TrainingError } from "../errors";
import { LIVE_SUBSCRIPTION, validatePrice } from "../payments";
import type { ProgramPrice } from "../schemas";
import { accessOnJoin, refreshProgramAccess } from "./access-store";
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

const liveSubscriptions = (where: Prisma.ProgramPurchaseWhereInput): Prisma.ProgramPurchaseWhereInput => ({
  ...where, kind: "subscription", status: { in: [...LIVE_SUBSCRIPTION] },
});

/** How many athletes have a live subscription to the program (what making it free would cancel). */
export function countLiveSubscriptions(db: Db, programId: string): Promise<number> {
  return db.programPurchase.count({ where: liveSubscriptions({ programId }) });
}

/** Why the app ended a subscription; the webhook keeps the reason when Stripe confirms the cancellation. */
export const APP_ENDED_REASONS = ["coach_removed", "archived", "made_free", "coach_deleted"] as const;
export type AppEndedReason = (typeof APP_ENDED_REASONS)[number];

/** Live subscriptions the app ended (for `reasons`) whose cancellation in Stripe has not gone through yet. */
const pendingCancellations = (programId: string, reasons: readonly AppEndedReason[] = APP_ENDED_REASONS) =>
  liveSubscriptions({ programId, endedReason: { in: [...reasons] } });

/**
 * Ends the live subscriptions matching `where`: marks them with `reason` (in one transaction with `alongside`, the
 * app-side change that ends them), then asks Stripe to cancel each one at once. Stripe never rolls back or blocks the
 * app-side change: a failed cancellation is logged and its subscription id returned in `failed`, for
 * `retryCancellations`. Without a gateway (payments off) nothing is sent to Stripe.
 */
export async function endLiveSubscriptions(
  db: Db, gw: StripeGateway | null, where: Prisma.ProgramPurchaseWhereInput, reason: AppEndedReason,
  alongside: Prisma.PrismaPromise<unknown>[] = [],
): Promise<{ cancelled: number; failed: string[] }> {
  const live = await db.programPurchase.findMany({ where: liveSubscriptions(where) });
  await db.$transaction([
    ...alongside,
    db.programPurchase.updateMany({ where: { id: { in: live.map((p) => p.id) } }, data: { endedReason: reason } }),
  ]);
  return cancelEach(db, gw, live);
}

/** Cancels each subscription in Stripe; a cancelled one is stored as `canceled` (the webhook confirms it later). */
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

/**
 * Makes a program paid or free. Going free ends every live subscription: the database is updated first, then
 * Stripe is asked to cancel each one; a cancellation that fails is returned (subscription ids), never thrown.
 * Changing the amount of a paid program is not supported yet.
 */
export async function setProgramPrice(
  db: Db, gw: StripeGateway, coachId: string, programId: string, input: ProgramPrice,
): Promise<{ cancelled: number; failed: string[] }> {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  const none = { cancelled: 0, failed: [] as string[] };

  if (!input.paid) {
    if (program.priceAmount === null) return none;
    const ended = await endLiveSubscriptions(db, gw, { programId }, "made_free", [
      db.program.update({ where: { id: programId }, data: { priceAmount: null, stripePriceId: null, paidSince: null } }),
    ]);
    await refreshProgramAccess(db, programId);
    return ended;
  }

  if (input.amount === null) throw new TrainingError("invalid_request");
  if (program.priceAmount !== null) {
    if (program.priceAmount === input.amount) return none;
    throw new TrainingError("invalid_request"); // changing the amount arrives with price changes
  }
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
  await db.program.update({
    where: { id: programId },
    data: { priceAmount: input.amount, currency, stripePriceId: priceId, paidSince: new Date() },
  });
  await refreshProgramAccess(db, programId);
  return none;
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
