import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
    <section className="mx-auto flex max-w-lg flex-col gap-3 py-12">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-neutral-700">{coach.status === "suspended" ? t("suspended") : t("pending")}</p>
    </section>
  );
}
