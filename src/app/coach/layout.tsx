import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";
import { CoachNav } from "./CoachNav";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  const user = ctx?.user ?? null;
  const coach = user ? await getCoachByUserId(prisma, user.id) : null;
  return (
    <>
      {ctx?.impersonatedBy && <ImpersonationBanner name={ctx.user.name} />}
      <CoachNav user={user && { name: user.name, image: user.image }} approved={coach?.status === "approved"}
        impersonating={Boolean(ctx?.impersonatedBy)}
        bell={<NotificationBell audience="coach" href="/coach/notifications" className="text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-foreground" />} />
      <main className="px-6 py-8 lg:px-8">{children}</main>
    </>
  );
}
