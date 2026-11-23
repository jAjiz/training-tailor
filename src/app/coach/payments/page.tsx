import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { paymentsEnabled } from "@/lib/stripe/client";
import { CONNECT_COUNTRIES, DEFAULT_CONNECT_COUNTRY, getStripeAccount } from "@/lib/training/services/payments";
import { ConnectPanel } from "./ConnectPanel";

export default async function CoachPaymentsPage() {
  if (!paymentsEnabled()) notFound();
  const coach = await requireCoachPage();
  const t = await getTranslations("coach.payments");
  const account = await getStripeAccount(prisma, coach.id);

  const names = new Intl.DisplayNames(await getLocale(), { type: "region" });
  const countries = CONNECT_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl">{t("title")}</h1>
      {!account ? (
        <Card className="flex flex-col gap-5 p-6">
          <p className="max-w-prose text-muted">{t("intro")}</p>
          <ConnectPanel stage="connect" countries={countries} defaultCountry={DEFAULT_CONNECT_COUNTRY} />
        </Card>
      ) : !account.chargesEnabled ? (
        <Card className="flex flex-col gap-5 p-6">
          <h2 className="text-xl">{t("onboardingTitle")}</h2>
          <p className="max-w-prose text-muted">{t("onboardingIntro")}</p>
          <ConnectPanel stage="onboarding" />
        </Card>
      ) : (
        <>
          <ConnectPanel stage="ready" />
          {/* Task 12: the coach's discount codes go here. */}
        </>
      )}
    </section>
  );
}
