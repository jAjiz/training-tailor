import { describe, expect, it } from "vitest";
import { TrainingError } from "@/lib/training/errors";
import { getStripeGateway, paymentsEnabled, platformFeePercent } from "@/lib/stripe/client";

const keys = {
  STRIPE_SECRET_KEY: "sk_test_x",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_x",
};

describe("stripe client", () => {
  it("enables payments with all three keys", () => {
    expect(paymentsEnabled(keys)).toBe(true);
  });

  it("payments are disabled without any of the three keys", () => {
    for (const missing of Object.keys(keys)) {
      const env = { ...keys, [missing]: "" };
      expect(paymentsEnabled(env), missing).toBe(false);
      expect(() => getStripeGateway(env), missing).toThrowError(expect.objectContaining({ code: "payments_unavailable" }));
      expect(() => getStripeGateway(env), missing).toThrowError(TrainingError);
    }
    expect(paymentsEnabled({})).toBe(false);
  });

  it("the fee defaults to 0 and rejects values outside 0–100", () => {
    expect(platformFeePercent({})).toBe(0);
    expect(platformFeePercent({ PLATFORM_FEE_PERCENT: "" })).toBe(0);
    expect(platformFeePercent({ PLATFORM_FEE_PERCENT: "2.5" })).toBe(2.5);
    expect(platformFeePercent({ PLATFORM_FEE_PERCENT: "100" })).toBe(100);
    for (const bad of ["-1", "100.5", "abc", "NaN"]) {
      expect(() => platformFeePercent({ PLATFORM_FEE_PERCENT: bad }), bad).toThrow();
    }
  });
});
