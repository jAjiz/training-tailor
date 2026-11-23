/** Payments settings read from the environment. Free of the Stripe SDK, so services and pages can import it. */

type Env = Record<string, string | undefined>;

/** Payments need all three settings; without them every program behaves as free (like push without VAPID keys). */
export function paymentsEnabled(env: Env = process.env): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && env.STRIPE_CONNECT_WEBHOOK_SECRET);
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
