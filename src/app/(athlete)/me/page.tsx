import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AccountSignOut } from "@/components/AccountSignOut";
import { PreferenceSwitches } from "@/components/notifications/PreferenceSwitches";
import { PushSettings } from "@/components/notifications/PushSettings";
import { Card } from "@/components/ui/Card";
import { isLocale } from "@/i18n/locale";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { getPreferences } from "@/lib/training/services/notifications";
import { setPreferenceAction } from "../notification-actions";
import { MyPrograms } from "./MyPrograms";
import { SettingsForm } from "./SettingsForm";

export default async function MePage() {
  const athlete = await requireAthletePage("/me");
  const t = await getTranslations("me");
  const tp = await getTranslations("profile");
  const impersonating = Boolean((await getSessionContext())?.impersonatedBy);
  const programs = await listAthletePrograms(prisma, athlete.id);
  const preferences = await getPreferences(prisma, athlete.userId, "athlete");
  const timeZones = Intl.supportedValuesOf("timeZone");
  return (
    <section className="flex flex-col gap-6 pt-4">
      <h1 className="text-3xl">{t("title")}</h1>
      <Card className="p-5">
        <SettingsForm
          initial={{ displayName: athlete.displayName, timezone: athlete.timezone, locale: isLocale(athlete.locale) ? athlete.locale : "es" }}
          timeZones={timeZones.includes(athlete.timezone) ? timeZones : [athlete.timezone, ...timeZones]}
        />
      </Card>
      <Link href="/me/profile" className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
        <Card className="flex items-center justify-between gap-3 p-5 transition hover:bg-surface-2">
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{tp("link")}</span>
            <span className="text-sm text-muted">{tp("linkHint")}</span>
          </span>
          <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
        </Card>
      </Link>
      {!impersonating && <PushSettings />}
      {!impersonating && <PreferenceSwitches initial={preferences} save={setPreferenceAction} />}
      <MyPrograms programs={programs.map((e) => ({ id: e.programId, name: e.program.name }))} />
      <AccountSignOut />
    </section>
  );
}
