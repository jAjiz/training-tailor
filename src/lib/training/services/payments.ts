import type { StripeGateway } from "@/lib/stripe/gateway";
import { TrainingError } from "../errors";
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
