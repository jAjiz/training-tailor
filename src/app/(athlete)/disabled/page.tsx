import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountSignOut } from "@/components/AccountSignOut";
import { Card } from "@/components/ui/Card";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";

export default async function DisabledPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const athlete = await getAthleteByUserId(prisma, user.id);
  if (!athlete?.disabledAt) redirect("/");
  const t = await getTranslations("accountDisabled");
  return (
    <section className="mx-auto max-w-lg pt-12">
      <Card className="flex flex-col gap-3 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-[15px] text-muted">{t("body")}</p>
        <AccountSignOut />
      </Card>
    </section>
  );
}
