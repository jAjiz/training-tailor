"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getStripeGateway } from "@/lib/stripe/client";
import { parse } from "@/lib/training/schemas";
import {
  CONNECT_COUNTRIES, connectStripe, createCoachAccountSession, getStripeAccount, syncStripeAccount,
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
