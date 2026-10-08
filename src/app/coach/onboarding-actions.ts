"use server";

import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { setLocaleCookie } from "@/lib/locale-cookie";
import { getSessionUser } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { ensureCoachAccount } from "@/lib/training/services/accounts";

export async function enterCoach(): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new TrainingError("unauthorized");
    const current = await getLocale();
    const coach = await ensureCoachAccount(prisma, user, { locale: isLocale(current) ? current : DEFAULT_LOCALE });
    if (isLocale(coach.locale)) await setLocaleCookie(coach.locale);
    return { status: coach.status };
  });
}
