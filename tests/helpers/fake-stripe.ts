import type {
  AccountSnapshot, CheckoutInput, DiscountInput, DiscountView, StripeGateway, SubscriptionSnapshot,
} from "@/lib/stripe/gateway";

export type FakeStripeCall = { method: keyof StripeGateway; args: unknown[] };

export type FakeStripeState = {
  accounts: Map<string, AccountSnapshot>;
  products: Map<string, { acct: string; name: string }>;
  prices: Map<string, { acct: string; productId: string; amount: number; currency: string; monthly: boolean }>;
  customers: Map<string, { acct: string; email: string; name: string; athleteId: string }>;
  checkoutSessions: Map<string, { acct: string; input: CheckoutInput }>;
  /** Edit these to simulate Stripe: `retrieveSubscription` reads them. */
  subscriptions: Map<string, SubscriptionSnapshot>;
  discounts: Map<string, { acct: string; view: DiscountView }>;
  refunds: { acct: string; paymentIntentId?: string; subscriptionId?: string }[];
  portalConfigurations: Map<string, { acct: string }>;
  /** Method names that reject with an error, to simulate Stripe failing. */
  failing: Set<keyof StripeGateway>;
};

/**
 * A recording StripeGateway. Ids count per kind in call order: `acct_1`, `prod_1`, `price_1`, `cus_1`, `cs_1`,
 * `promo_1`, `bps_1`... Subscriptions are not created by the gateway (checkout does that in Stripe), so tests
 * add them to `state.subscriptions` themselves.
 */
export function fakeStripe() {
  const calls: FakeStripeCall[] = [];
  const counters: Record<string, number> = {};
  const nextId = (prefix: string) => `${prefix}_${(counters[prefix] = (counters[prefix] ?? 0) + 1)}`;
  const state: FakeStripeState = {
    accounts: new Map(), products: new Map(), prices: new Map(), customers: new Map(),
    checkoutSessions: new Map(), subscriptions: new Map(), discounts: new Map(), refunds: [],
    portalConfigurations: new Map(), failing: new Set(),
  };

  function record<K extends keyof StripeGateway>(method: K, args: unknown[]) {
    calls.push({ method, args });
    if (state.failing.has(method)) throw new Error(`fake stripe: ${method} failed`);
  }
  const subscription = (id: string) => {
    const sub = state.subscriptions.get(id);
    if (!sub) throw new Error(`fake stripe: no subscription ${id}`);
    return sub;
  };

  const gateway: StripeGateway = {
    async createAccount(country) {
      record("createAccount", [country]);
      const id = nextId("acct");
      state.accounts.set(id, { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, defaultCurrency: null });
      return id;
    },
    async retrieveAccount(acct) {
      record("retrieveAccount", [acct]);
      const account = state.accounts.get(acct);
      if (!account) throw new Error(`fake stripe: no account ${acct}`);
      return { ...account };
    },
    async createAccountSession(acct) {
      record("createAccountSession", [acct]);
      return `${acct}_secret`;
    },
    async createProduct(acct, name) {
      record("createProduct", [acct, name]);
      const id = nextId("prod");
      state.products.set(id, { acct, name });
      return id;
    },
    async createPrice(acct, p) {
      record("createPrice", [acct, p]);
      const id = nextId("price");
      state.prices.set(id, { acct, ...p });
      return id;
    },
    async createCustomer(acct, c) {
      record("createCustomer", [acct, c]);
      const id = nextId("cus");
      state.customers.set(id, { acct, ...c });
      return id;
    },
    async createCheckoutSession(acct, input) {
      record("createCheckoutSession", [acct, input]);
      const id = nextId("cs");
      state.checkoutSessions.set(id, { acct, input });
      return { id, url: `https://checkout.stripe.test/${id}` };
    },
    async retrieveSubscription(acct, id) {
      record("retrieveSubscription", [acct, id]);
      return { ...subscription(id) };
    },
    async cancelSubscription(acct, id) {
      record("cancelSubscription", [acct, id]);
      subscription(id).status = "canceled";
    },
    async setCancelAtPeriodEnd(acct, id, value) {
      record("setCancelAtPeriodEnd", [acct, id, value]);
      const sub = subscription(id);
      sub.cancelAtPeriodEnd = value;
      sub.cancellationReason = value ? "cancellation_requested" : null;
    },
    async updateSubscriptionPrice(acct, id, itemId, priceId) {
      record("updateSubscriptionPrice", [acct, id, itemId, priceId]);
      subscription(id).priceId = priceId;
    },
    async refundPaymentIntent(acct, paymentIntentId) {
      record("refundPaymentIntent", [acct, paymentIntentId]);
      state.refunds.push({ acct, paymentIntentId });
    },
    async refundSubscriptionFirstInvoice(acct, subscriptionId) {
      record("refundSubscriptionFirstInvoice", [acct, subscriptionId]);
      state.refunds.push({ acct, subscriptionId });
    },
    async createPortalConfiguration(acct) {
      record("createPortalConfiguration", [acct]);
      const id = nextId("bpc");
      state.portalConfigurations.set(id, { acct });
      return id;
    },
    async createPortalSession(acct, p) {
      record("createPortalSession", [acct, p]);
      return `https://portal.stripe.test/${nextId("bps")}`;
    },
    async createDiscount(acct, d: DiscountInput) {
      record("createDiscount", [acct, d]);
      const promotionCodeId = nextId("promo");
      state.discounts.set(promotionCodeId, {
        acct,
        view: {
          promotionCodeId, code: d.code, percentOff: d.percentOff, amountOff: d.amountOff, currency: d.currency,
          duration: d.duration, durationInMonths: d.durationInMonths, productIds: d.productIds, timesRedeemed: 0,
          maxRedemptions: d.maxRedemptions, expiresAt: d.expiresAt, active: true,
        },
      });
      return promotionCodeId;
    },
    async listDiscounts(acct) {
      record("listDiscounts", [acct]);
      return [...state.discounts.values()].filter((d) => d.acct === acct).map((d) => ({ ...d.view }));
    },
    async deactivateDiscount(acct, promotionCodeId) {
      record("deactivateDiscount", [acct, promotionCodeId]);
      const discount = state.discounts.get(promotionCodeId);
      if (discount) discount.view.active = false;
    },
  };

  return { gateway, calls, state };
}
