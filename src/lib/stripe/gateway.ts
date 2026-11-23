/** The port the payments services use to talk to Stripe. Every call acts on a connected account (`acct`). */

export type AccountSnapshot = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  defaultCurrency: string | null;
};

export type SubscriptionSnapshot = {
  id: string;
  status: string;
  customerId: string;
  priceId: string;
  itemId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancellationReason: "cancellation_requested" | "payment_failed" | "payment_disputed" | null;
};

export type CheckoutInput = {
  mode: "subscription" | "payment";
  priceId: string;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
  /** Platform fee, 0 to 100; no application fee is sent at 0. */
  feePercent: number;
  /** The price's amount in minor units, to compute the fee of a one-time payment. */
  amount: number;
  /** When the session expires if not completed (Stripe accepts 30 minutes to 24 hours from creation). */
  expiresAt: Date;
};

export type DiscountInput = {
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
  duration: "once" | "repeating" | "forever";
  durationInMonths: number | null;
  productIds: string[];
  maxRedemptions: number | null;
  expiresAt: Date | null;
};

export type DiscountView = {
  promotionCodeId: string;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  productIds: string[];
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
  active: boolean;
};

/** `createDiscount` failed because the account already has a promotion code with that code. */
export class DiscountCodeTaken extends Error {
  constructor() { super("discount code already exists"); this.name = "DiscountCodeTaken"; }
}

/** `createDiscount` failed because Stripe rejected the discount's values. */
export class DiscountInvalid extends Error {
  constructor(message = "discount rejected by Stripe") { super(message); this.name = "DiscountInvalid"; }
}

export interface StripeGateway {
  createAccount(country: string): Promise<string>;
  retrieveAccount(acct: string): Promise<AccountSnapshot>;
  /** Embedded-components session; returns the client secret. */
  createAccountSession(acct: string): Promise<string>;
  createProduct(acct: string, name: string): Promise<string>;
  createPrice(acct: string, p: { productId: string; amount: number; currency: string; monthly: boolean }): Promise<string>;
  createCustomer(acct: string, c: { email: string; name: string; athleteId: string }): Promise<string>;
  createCheckoutSession(acct: string, input: CheckoutInput): Promise<{ id: string; url: string }>;
  retrieveSubscription(acct: string, id: string): Promise<SubscriptionSnapshot>;
  cancelSubscription(acct: string, id: string): Promise<void>;
  setCancelAtPeriodEnd(acct: string, id: string, value: boolean): Promise<void>;
  updateSubscriptionPrice(acct: string, id: string, itemId: string, priceId: string): Promise<void>;
  refundPaymentIntent(acct: string, paymentIntentId: string): Promise<void>;
  refundSubscriptionFirstInvoice(acct: string, subscriptionId: string): Promise<void>;
  createPortalConfiguration(acct: string): Promise<string>;
  createPortalSession(acct: string, p: { customerId: string; configurationId: string; returnUrl: string }): Promise<string>;
  createDiscount(acct: string, d: DiscountInput): Promise<string>;
  listDiscounts(acct: string): Promise<DiscountView[]>;
  deactivateDiscount(acct: string, promotionCodeId: string): Promise<void>;
}
