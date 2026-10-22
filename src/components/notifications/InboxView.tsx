import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { relativeTime } from "@/lib/format";
import { notificationText, type Audience, type NotificationData, type NotificationKind } from "@/lib/notifications/kinds";
import { getSessionContext } from "@/lib/session";
import type { ActionResult } from "@/lib/training/errors";
import { listInbox } from "@/lib/training/services/notifications";
import { InboxList } from "./InboxList";

type Props = {
  audience: Audience;
  open: (id: string) => Promise<ActionResult<{ href: string }>>;
  markAll: () => Promise<ActionResult>;
};

/** The signed-in user's inbox for one zone, with texts built in the viewer's language. */
export async function InboxView({ audience, open, markAll }: Props) {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const user = ctx.user;
  const [rows, t, locale] = await Promise.all([listInbox(prisma, user.id, audience), getTranslations(), getLocale()]);
  const now = new Date();
  // notificationText needs the root translator (absolute keys).
  const translate = t as unknown as Parameters<typeof notificationText>[2];
  const items = rows.map((r) => {
    const kind = r.kind as NotificationKind;
    return {
      id: r.id,
      text: notificationText(kind, r.data as NotificationData[typeof kind], translate).body,
      time: relativeTime(r.updatedAt, now, locale),
      unread: r.readAt === null,
    };
  });
  // While impersonating nothing is marked read, so "Mark all as read" is hidden.
  return <InboxList items={items} open={open} markAll={ctx.impersonatedBy ? null : markAll} />;
}
