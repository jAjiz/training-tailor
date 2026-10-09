import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui/Card";
import { isLocale } from "@/i18n/locale";
import { requireAthletePage } from "@/lib/accounts";
import { SettingsForm } from "./SettingsForm";

export default async function MePage() {
  const athlete = await requireAthletePage("/me");
  const t = await getTranslations("me");
  const timeZones = Intl.supportedValuesOf("timeZone");
  return (
    <section className="flex flex-col gap-6 pt-4">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <Card className="p-5">
        <SettingsForm
          initial={{ displayName: athlete.displayName, timezone: athlete.timezone, locale: isLocale(athlete.locale) ? athlete.locale : "es" }}
          timeZones={timeZones.includes(athlete.timezone) ? timeZones : [athlete.timezone, ...timeZones]}
        />
      </Card>
      <SignOutButton />
    </section>
  );
}
