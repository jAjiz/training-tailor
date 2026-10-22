import { getTranslations } from "next-intl/server";
import { PreferenceSwitches } from "@/components/notifications/PreferenceSwitches";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { getPreferences } from "@/lib/training/services/notifications";
import { setPreferenceAction } from "../../notification-actions";

export default async function CoachNotificationSettingsPage() {
  const coach = await requireCoachPage();
  const t = await getTranslations("notifications");
  const initial = await getPreferences(prisma, coach.userId, "coach");
  const impersonating = Boolean((await getSessionContext())?.impersonatedBy);
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-bold">{t("settingsTitle")}</h1>
      {impersonating
        ? <p className="text-sm text-muted">{t("preferencesImpersonating")}</p>
        : <PreferenceSwitches initial={initial} save={setPreferenceAction} />}
    </section>
  );
}
