import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AccountSignOut } from "@/components/AccountSignOut";
import { PreferenceSwitches } from "@/components/notifications/PreferenceSwitches";
import { PushSettings } from "@/components/notifications/PushSettings";
import { Card } from "@/components/ui/Card";
import { isLocale } from "@/i18n/locale";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { getSessionContext } from "@/lib/session";
import { paymentsEnabled } from "@/lib/stripe/client";
import { fromDbDate } from "@/lib/training/dates";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { getPreferences } from "@/lib/training/services/notifications";
import { athleteSubscriptions } from "@/lib/training/services/payments";
import { PortalButton } from "../PortalButton";
import { setPreferenceAction } from "../notification-actions";
import { MyPrograms, type MyProgram } from "./MyPrograms";
import { SettingsForm } from "./SettingsForm";

export default async function MePage() {
  const athlete = await requireAthletePage("/me");
  const t = await getTranslations("me");
  const tp = await getTranslations("profile");
  const impersonating = Boolean((await getSessionContext())?.impersonatedBy);
  const programs = await listAthletePrograms(prisma, athlete.id);
  const subscriptions = paymentsEnabled() ? await athleteSubscriptions(prisma, athlete.id) : new Map();
  const locale = await getLocale();
  const longDay = (d: Date) => formatDay(fromDbDate(d), locale, { day: "numeric", month: "long", year: "numeric" });
  const myPrograms: MyProgram[] = programs.map((e) => {
    const sub = subscriptions.get(e.programId);
    // An unpaid subscription gives no access: leaving it is not "keep access until the end date".
    const live = sub && sub.status !== "unpaid" ? sub : null;
    const endsOn = live?.currentPeriodEnd ? longDay(live.currentPeriodEnd) : null;
    return { id: e.programId, name: e.program.name, subscription: live ? { endsOn, leaving: live.cancelAtPeriodEnd } : null };
  });
  const subscriptionRows = programs.flatMap((e) => {
    const sub = subscriptions.get(e.programId);
    if (!sub) return [];
    const date = sub.currentPeriodEnd ? longDay(sub.currentPeriodEnd) : null;
    const ending = sub.cancelAtPeriodEnd && sub.status !== "unpaid";
    const status = ending
      ? (date ? t("subscriptionStatus.endingOn", { date }) : t("subscriptionStatus.ending"))
      : t(`subscriptionStatus.${sub.status === "unpaid" || sub.status === "past_due" ? sub.status : "active"}`);
    const renewsOn = sub.status === "active" && !ending && date ? t("renewsOn", { date }) : null;
    return [{ programId: e.programId, name: e.program.name, status, renewsOn }];
  });
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
      <MyPrograms programs={myPrograms} />
      {subscriptionRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg">{t("subscriptionsTitle")}</h2>
          <Card className="divide-y">
            {subscriptionRows.map((r) => (
              <div key={r.programId} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-sm text-muted">{r.status}</span>
                  {r.renewsOn && <span className="text-sm text-muted">{r.renewsOn}</span>}
                </span>
                <PortalButton programId={r.programId} label={t("manage")} />
              </div>
            ))}
          </Card>
        </section>
      )}
      <AccountSignOut />
    </section>
  );
}
