import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getStripeGateway, paymentsEnabled } from "@/lib/stripe/client";
import {
  CONNECT_COUNTRIES, DEFAULT_CONNECT_COUNTRY, getStripeAccount, listDiscounts,
} from "@/lib/training/services/payments";
import { listCoachPrograms } from "@/lib/training/services/programs";
import { ConnectPanel } from "./ConnectPanel";
import { DiscountCodes } from "./DiscountCodes";

export default async function CoachPaymentsPage() {
  if (!paymentsEnabled()) notFound();
  const coach = await requireCoachPage();
  const t = await getTranslations("coach.payments");
  const account = await getStripeAccount(prisma, coach.id);
  const ready = !!account?.chargesEnabled;
  const programs = ready ? await listCoachPrograms(prisma, coach.id) : [];
  // Stripe being down must not take the whole page with it.
  const discounts = ready ? await listDiscounts(prisma, getStripeGateway(), coach.id).catch(() => null) : null;

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
          <DiscountCodes
            discounts={discounts?.map((d) => ({ ...d, expiresAt: d.expiresAt?.toISOString() ?? null })) ?? null}
            programs={programs.filter((p) => p.priceAmount !== null && p.stripeProductId && !p.archivedAt)
              .map((p) => ({ id: p.id, name: p.name }))}
            productNames={Object.fromEntries(programs.flatMap((p) => (p.stripeProductId ? [[p.stripeProductId, p.name]] : [])))}
            currency={account.defaultCurrency}
          />
        </>
      )}
    </section>
  );
}
