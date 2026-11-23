import { TrainingError } from "./errors";

export type Access = "free" | "paid" | "granted" | "blocked";

/** Subscription statuses that keep a continuous program open. */
export const LIVE_SUBSCRIPTION = ["active", "trialing", "past_due"] as const;

const MIN_AMOUNT = 50; // Stripe's minimum charge, in minor units
const MAX_AMOUNT = 100000; // sanity cap, in minor units

/** Whether an athlete may see a program's content. Pure; see the spec, section "Access". */
export function programAccess(
  program: { kind: string; priceAmount: number | null; paidSince: Date | null },
  enrollment: { joinedAt: Date; accessGrantedAt: Date | null },
  purchases: { kind: string; status: string }[],
): Access {
  if (program.priceAmount === null) return "free";
  if (program.kind === "closed" && program.paidSince && enrollment.joinedAt < program.paidSince) return "free";
  if (enrollment.accessGrantedAt) return "granted";
  if (program.kind === "continuous") {
    const live = purchases.some(
      (p) => p.kind === "subscription" && (LIVE_SUBSCRIPTION as readonly string[]).includes(p.status),
    );
    return live ? "paid" : "blocked";
  }
  const paid = purchases.some((p) => p.kind === "payment" && p.status === "paid");
  return paid ? "paid" : "blocked";
}

/** Throws `price_invalid` outside Stripe's minimum and our cap (minor units). */
export function validatePrice(amount: number, currency: string): void {
  void currency; // every supported currency shares the same bounds
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new TrainingError("price_invalid");
  }
}

export function formatPrice(amount: number, currency: string, locale: string, monthly: boolean): string {
  const text = new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
  return monthly ? `${text}/${locale.startsWith("es") ? "mes" : "mo"}` : text;
}
