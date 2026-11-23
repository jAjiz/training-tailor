import Stripe from "stripe";
import { TrainingError } from "@/lib/training/errors";
import { paymentsEnabled } from "@/lib/stripe/config";
import type { StripeGateway } from "@/lib/stripe/gateway";
import { stripeGateway } from "@/lib/stripe/stripe-gateway";

// The settings live in config.ts, free of the SDK; re-exported for callers that also need the gateway.
export { paymentsEnabled, platformFeePercent } from "@/lib/stripe/config";

type Env = Record<string, string | undefined>;

let cached: { key: string; stripe: Stripe; gateway: StripeGateway } | null = null;

function sdk(env: Env) {
  const key = env.STRIPE_SECRET_KEY as string;
  if (cached?.key !== key) {
    const stripe = new Stripe(key);
    cached = { key, stripe, gateway: stripeGateway(stripe) };
  }
  return cached;
}

export function getStripeGateway(env: Env = process.env): StripeGateway {
  if (!paymentsEnabled(env)) throw new TrainingError("payments_unavailable");
  return sdk(env).gateway;
}

/** The gateway when payments are on, else null: services then skip Stripe (no live purchase can exist). */
export function stripeGatewayIfEnabled(env: Env = process.env): StripeGateway | null {
  return paymentsEnabled(env) ? getStripeGateway(env) : null;
}

/** Verifies a webhook's signature over its raw body; throws when it does not match. */
export function constructWebhookEvent(body: string, signature: string, env: Env = process.env): Stripe.Event {
  if (!paymentsEnabled(env)) throw new TrainingError("payments_unavailable");
  return sdk(env).stripe.webhooks.constructEvent(body, signature, env.STRIPE_CONNECT_WEBHOOK_SECRET as string);
}
