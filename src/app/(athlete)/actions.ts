"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { setLocaleCookie } from "@/lib/locale-cookie";
import { getSessionUser } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { AthleteSettingsInput, OnboardingInput, parse } from "@/lib/training/schemas";
import { ensureAthleteAccount, updateAthleteSettings } from "@/lib/training/services/accounts";
import { athleteSignupMode } from "@/lib/signup";
import { canCreateAthleteProfile, joinByCode } from "@/lib/training/services/enrollments";

export async function completeAthleteOnboarding(raw: unknown): Promise<ActionResult> {
  return runAction("completeAthleteOnboarding", async () => {
    const user = await getSessionUser();
    if (!user) throw new TrainingError("unauthorized");
    const { timezone, next } = parse(OnboardingInput, raw);
    if (!(await canCreateAthleteProfile(prisma, user.id, next, athleteSignupMode()))) throw new TrainingError("invite_required");
    const current = await getLocale();
    const athlete = await ensureAthleteAccount(prisma, user, { timezone, locale: isLocale(current) ? current : DEFAULT_LOCALE });
    if (isLocale(athlete.locale)) await setLocaleCookie(athlete.locale);
  });
}

export async function updateSettingsAction(raw: unknown): Promise<ActionResult> {
  return runAction("updateSettingsAction", async () => {
    const athlete = await requireAthlete();
    const settings = parse(AthleteSettingsInput, raw);
    await updateAthleteSettings(prisma, athlete.id, settings);
    await setLocaleCookie(settings.locale);
    revalidatePath("/", "layout");
  });
}

export async function joinProgramAction(code: unknown): Promise<ActionResult<{ programId: string }>> {
  return runAction("joinProgramAction", async () => {
    const athlete = await requireAthlete();
    const { programId } = await joinByCode(prisma, athlete, parse(z.string().min(1).max(64), code));
    revalidatePath("/");
    return { programId };
  });
}
