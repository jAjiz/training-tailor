import Stripe from "stripe";
import { TrainingError } from "@/lib/training/errors";
import type { StripeGateway } from "@/lib/stripe/gateway";
import { stripeGateway } from "@/lib/stripe/stripe-gateway";

type Env = Record<string, string | undefined>;

/** Payments need all three settings; without them every program behaves as free (like push without VAPID keys). */
export function paymentsEnabled(env: Env = process.env): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && env.STRIPE_CONNECT_WEBHOOK_SECRET);
}

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

/** The platform's cut of each charge, 0 to 100 (`PLATFORM_FEE_PERCENT`, default 0). */
export function platformFeePercent(env: Env = process.env): number {
  const raw = env.PLATFORM_FEE_PERCENT?.trim();
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`PLATFORM_FEE_PERCENT must be a number from 0 to 100, got "${raw}"`);
  }
  return value;
}
