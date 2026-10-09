import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";

export default async function CoachPendingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/coach/signin");
  const coach = await getCoachByUserId(prisma, user.id);
  if (!coach) redirect("/coach/onboarding");
  if (coach.status === "approved") redirect("/coach");
  const t = await getTranslations("coachPending");
  return (
    <section className="mx-auto max-w-lg pt-12">
      <Card className="flex flex-col gap-3 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-[15px] text-muted">{coach.status === "suspended" ? t("suspended") : t("pending")}</p>
      </Card>
    </section>
  );
}
