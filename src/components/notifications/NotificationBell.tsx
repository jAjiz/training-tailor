import Link from "next/link";
import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cx } from "@/components/ui/cx";
import { prisma } from "@/lib/db";
import type { Audience } from "@/lib/notifications/kinds";
import { getSessionUser } from "@/lib/session";
import { unreadCount } from "@/lib/training/services/notifications";

/** The inbox link with an unread dot; the count is read out for screen readers. `className` styles the link for its background. */
export async function NotificationBell({ audience, href, className }: { audience: Audience; href: string; className?: string }) {
  const user = await getSessionUser();
  if (!user) return null;
  const [t, count] = await Promise.all([getTranslations("notifications"), unreadCount(prisma, user.id, audience)]);
  return (
    <Link href={href} title={t("bell")}
      className={cx("relative grid size-9 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2", className)}>
      <Bell size={20} aria-hidden />
      {count > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger" />}
      <span className="sr-only">{t("bell")}{count > 0 && ` · ${t("unread", { count })}`}</span>
    </Link>
  );
}
