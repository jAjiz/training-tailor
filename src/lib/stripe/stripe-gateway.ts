import Stripe from "stripe";
import {
  DiscountCodeTaken, DiscountInvalid, type DiscountView, type StripeGateway, type SubscriptionSnapshot,
} from "@/lib/stripe/gateway";

/** A Stripe validation error becomes a typed discount error: a duplicate code, or any other rejected value. */
function discountError(e: unknown): unknown {
  if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) return e;
  return e.code === "resource_already_exists" || e.param === "code" ? new DiscountCodeTaken() : new DiscountInvalid(e.message);
}

const fromSeconds = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const idOf = (x: string | { id: string }) => (typeof x === "string" ? x : x.id);

function snapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items.data[0];
  // Recent API versions keep the period on the item, not on the subscription.
  const periodEnd = (sub as { current_period_end?: number }).current_period_end ?? item?.current_period_end;
  const reason = sub.cancellation_details?.reason;
  return {
    id: sub.id,
    status: sub.status,
    customerId: idOf(sub.customer),
    priceId: item?.price.id ?? "",
    itemId: item?.id ?? "",
    currentPeriodEnd: fromSeconds(periodEnd),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancellationReason: reason === "cancellation_requested" ? "cancellation_requested"
      : reason === "payment_failed" ? "payment_failed"
      : reason === "payment_disputed" ? "payment_disputed"
      : null,
  };
}

/** The real gateway over the Stripe SDK. Calls on a connected account pass it as the request's `stripeAccount`. */
export function stripeGateway(stripe: Stripe): StripeGateway {
  return {
    async createAccount(country, email) {
      const account = await stripe.accounts.create({
        country,
        email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
      });
      return account.id;
    },

    async retrieveAccount(acct) {
      const a = await stripe.accounts.retrieve(acct);
      return {
        chargesEnabled: !!a.charges_enabled,
        payoutsEnabled: !!a.payouts_enabled,
        detailsSubmitted: !!a.details_submitted,
        defaultCurrency: a.default_currency ? a.default_currency.toLowerCase() : null,
      };
    },

    async createAccountSession(acct) {
      const session = await stripe.accountSessions.create({
        account: acct,
        components: {
          account_onboarding: { enabled: true },
          notification_banner: { enabled: true },
          payments: {
            enabled: true,
            features: { refund_management: true, dispute_management: true },
          },
          payouts: { enabled: true },
        },
      });
      return session.client_secret;
    },

    async createProduct(acct, name) {
      const product = await stripe.products.create({ name }, { stripeAccount: acct });
      return product.id;
    },

    async createPrice(acct, p) {
      const price = await stripe.prices.create(
        {
          product: p.productId,
          unit_amount: p.amount,
          currency: p.currency,
          ...(p.monthly ? { recurring: { interval: "month" as const } } : {}),
        },
        { stripeAccount: acct },
      );
      return price.id;
    },

    async createCustomer(acct, c) {
      const customer = await stripe.customers.create(
        { email: c.email, name: c.name, metadata: { athleteId: c.athleteId } },
        { stripeAccount: acct },
      );
      return customer.id;
    },

    async createCheckoutSession(acct, input) {
      const fee = input.feePercent > 0;
      const session = await stripe.checkout.sessions.create(
        {
          mode: input.mode,
          // SDK 23 dropped `payment_method_types` from create params; this is its filter equivalent.
          allowed_payment_method_types: ["card"],
          customer: input.customerId,
          line_items: [{ price: input.priceId, quantity: 1 }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.clientReferenceId,
          metadata: input.metadata,
          allow_promotion_codes: true,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
          ...(input.mode === "subscription"
            ? {
                subscription_data: {
                  metadata: input.metadata,
                  ...(fee ? { application_fee_percent: input.feePercent } : {}),
                },
              }
            : {
                payment_intent_data: {
                  metadata: input.metadata,
                  ...(fee ? { application_fee_amount: Math.round((input.amount * input.feePercent) / 100) } : {}),
                },
              }),
        },
        { stripeAccount: acct },
      );
      if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
      return { id: session.id, url: session.url };
    },

    async retrieveSubscription(acct, id) {
      return snapshot(await stripe.subscriptions.retrieve(id, {}, { stripeAccount: acct }));
    },

    async cancelSubscription(acct, id) {
      await stripe.subscriptions.cancel(id, {}, { stripeAccount: acct });
    },

    async setCancelAtPeriodEnd(acct, id, value) {
      await stripe.subscriptions.update(id, { cancel_at_period_end: value }, { stripeAccount: acct });
    },

    async updateSubscriptionPrice(acct, id, itemId, priceId) {
      await stripe.subscriptions.update(
        id,
        { items: [{ id: itemId, price: priceId }], proration_behavior: "none" },
        { stripeAccount: acct },
      );
    },

    async refundPaymentIntent(acct, paymentIntentId) {
      await stripe.refunds.create({ payment_intent: paymentIntentId }, { stripeAccount: acct });
    },

    async refundSubscriptionFirstInvoice(acct, subscriptionId) {
      const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 100 }, { stripeAccount: acct });
      const first = [...invoices.data].sort((a, b) => a.created - b.created)[0];
      if (!first) return;
      const payments = await stripe.invoicePayments.list(
        { invoice: first.id, status: "paid" },
        { stripeAccount: acct },
      );
      for (const payment of payments.data) {
        if (payment.payment.type === "payment_intent" && payment.payment.payment_intent) {
          await stripe.refunds.create(
            { payment_intent: idOf(payment.payment.payment_intent) },
            { stripeAccount: acct },
          );
        }
      }
    },

    async createPortalConfiguration(acct) {
      const config = await stripe.billingPortal.configurations.create(
        {
          business_profile: {},
          features: {
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: { enabled: true, mode: "at_period_end" },
          },
        },
        { stripeAccount: acct },
      );
      return config.id;
    },

    async createPortalSession(acct, p) {
      const session = await stripe.billingPortal.sessions.create(
        { customer: p.customerId, configuration: p.configurationId, return_url: p.returnUrl },
        { stripeAccount: acct },
      );
      return session.url;
    },

    async createDiscount(acct, d) {
      const options = { stripeAccount: acct };
      let couponId: string;
      try {
        const coupon = await stripe.coupons.create(
          {
            ...(d.percentOff != null ? { percent_off: d.percentOff } : { amount_off: d.amountOff ?? 0, currency: d.currency }),
            duration: d.duration,
            ...(d.duration === "repeating" && d.durationInMonths ? { duration_in_months: d.durationInMonths } : {}),
            ...(d.productIds.length ? { applies_to: { products: d.productIds } } : {}),
          },
          options,
        );
        couponId = coupon.id;
      } catch (e) {
        const error = discountError(e);
        throw error instanceof DiscountCodeTaken ? new DiscountInvalid() : error;
      }
      try {
        const promo = await stripe.promotionCodes.create(
          {
            promotion: { type: "coupon", coupon: couponId },
            code: d.code,
            ...(d.maxRedemptions ? { max_redemptions: d.maxRedemptions } : {}),
            ...(d.expiresAt ? { expires_at: Math.floor(d.expiresAt.getTime() / 1000) } : {}),
          },
          options,
        );
        return promo.id;
      } catch (e) {
        // The coupon is useless without its code: remove it so a retry does not leave orphans.
        await stripe.coupons.del(couponId, options).catch(() => {});
        throw discountError(e);
      }
    },

    async listDiscounts(acct) {
      const promos = await stripe.promotionCodes.list(
        { limit: 100, expand: ["data.promotion.coupon"] },
        { stripeAccount: acct },
      );
      return promos.data.flatMap((promo): DiscountView[] => {
        const coupon = promo.promotion.coupon;
        if (!coupon || typeof coupon === "string") return [];
        return [{
          promotionCodeId: promo.id,
          code: promo.code,
          percentOff: coupon.percent_off ?? null,
          amountOff: coupon.amount_off ?? null,
          currency: coupon.currency ?? null,
          duration: coupon.duration,
          durationInMonths: coupon.duration_in_months ?? null,
          productIds: coupon.applies_to?.products ?? [],
          timesRedeemed: promo.times_redeemed,
          maxRedemptions: promo.max_redemptions ?? null,
          expiresAt: fromSeconds(promo.expires_at),
          active: promo.active && coupon.valid,
        }];
      });
    },

    async deactivateDiscount(acct, promotionCodeId) {
      await stripe.promotionCodes.update(promotionCodeId, { active: false }, { stripeAccount: acct });
    },
  };
}
