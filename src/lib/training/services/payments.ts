import type { StripeGateway } from "@/lib/stripe/gateway";
import { TrainingError } from "../errors";
import { LIVE_SUBSCRIPTION, validatePrice } from "../payments";
import type { ProgramPrice } from "../schemas";
import { refreshProgramAccess } from "./access-store";
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
  const snapshot = await gw.retrieveAccount(acct);
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

const liveSubscriptions = (programId: string) => ({
  programId, kind: "subscription", status: { in: [...LIVE_SUBSCRIPTION] },
});

/** How many athletes have a live subscription to the program (what making it free would cancel). */
export function countLiveSubscriptions(db: Db, programId: string): Promise<number> {
  return db.programPurchase.count({ where: liveSubscriptions(programId) });
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
    const live = await db.programPurchase.findMany({ where: liveSubscriptions(programId) });
    await db.$transaction([
      db.programPurchase.updateMany({
        where: { id: { in: live.map((p) => p.id) } }, data: { endedReason: "made_free" },
      }),
      db.program.update({
        where: { id: programId }, data: { priceAmount: null, stripePriceId: null, paidSince: null },
      }),
    ]);
    await refreshProgramAccess(db, programId);
    const failed: string[] = [];
    let cancelled = 0;
    for (const purchase of live) {
      if (!purchase.stripeSubscriptionId) continue;
      try {
        await gw.cancelSubscription(purchase.stripeAccountId, purchase.stripeSubscriptionId);
        cancelled++;
      } catch {
        failed.push(purchase.stripeSubscriptionId);
      }
    }
    return { cancelled, failed };
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
