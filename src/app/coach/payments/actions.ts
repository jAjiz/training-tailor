"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getStripeGateway } from "@/lib/stripe/client";
import { DiscountCreateInput, parse } from "@/lib/training/schemas";
import {
  CONNECT_COUNTRIES, connectStripe, createCoachAccountSession, createDiscount, deactivateDiscount, getStripeAccount,
  syncStripeAccount,
} from "@/lib/training/services/payments";

export async function connectStripeAction(country: unknown) {
  return runAction("connectStripeAction", async () => {
    const coach = await requireCoach();
    const code = parse(z.enum(CONNECT_COUNTRIES), country);
    await connectStripe(prisma, getStripeGateway(), coach.id, code);
    revalidatePath("/coach/payments");
  });
}

/** The client secret the embedded components fetch (and fetch again when it expires). */
export async function accountSessionAction() {
  return runAction("accountSessionAction", async () => {
    const coach = await requireCoach();
    return createCoachAccountSession(prisma, getStripeGateway(), coach.id);
  });
}

/** Called when the coach leaves the onboarding form: stores what Stripe now says about the account. */
export async function syncStripeAccountAction() {
  return runAction("syncStripeAccountAction", async () => {
    const coach = await requireCoach();
    const account = await getStripeAccount(prisma, coach.id);
    if (!account) return;
    await syncStripeAccount(prisma, getStripeGateway(), account.stripeAccountId);
    revalidatePath("/coach/payments");
  });
}

export async function createDiscountAction(raw: unknown) {
  return runAction("createDiscountAction", async () => {
    const coach = await requireCoach();
    await createDiscount(prisma, getStripeGateway(), coach.id, parse(DiscountCreateInput, raw));
    revalidatePath("/coach/payments");
  });
}

export async function deactivateDiscountAction(promotionCodeId: unknown) {
  return runAction("deactivateDiscountAction", async () => {
    const coach = await requireCoach();
    await deactivateDiscount(prisma, getStripeGateway(), coach.id, parse(z.string().min(1), promotionCodeId));
    revalidatePath("/coach/payments");
  });
}
