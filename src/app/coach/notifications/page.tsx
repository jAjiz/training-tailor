import { getTranslations } from "next-intl/server";
import { InboxView } from "@/components/notifications/InboxView";
import { requireCoachPage } from "@/lib/accounts";
import { markAllReadAction, openNotificationAction } from "../notification-actions";

export default async function CoachNotificationsPage() {
  await requireCoachPage();
  const t = await getTranslations("notifications");
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <InboxView audience="coach" open={openNotificationAction} markAll={markAllReadAction} />
    </section>
  );
}
