import type { Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { InboxView } from "@/components/notifications/InboxView";
import { requireAthletePage } from "@/lib/accounts";
import { markAllReadAction, openNotificationAction } from "../notification-actions";

export const viewport: Viewport = { themeColor: "#000000" };

export default async function AthleteNotificationsPage() {
  await requireAthletePage("/notifications");
  const t = await getTranslations("notifications");
  return (
    <section className="flex flex-col gap-4 pt-2">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <InboxView audience="athlete" open={openNotificationAction} markAll={markAllReadAction} />
    </section>
  );
}
