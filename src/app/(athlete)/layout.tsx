import { Suspense } from "react";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { PushResync } from "@/components/notifications/PushResync";
import { InstallGate } from "@/components/notifications/InstallGate";
import { ServiceWorkerRegistrar } from "@/components/notifications/ServiceWorkerRegistrar";
import { cx } from "@/components/ui/cx";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { AthleteTabBar } from "./AthleteTabBar";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  const account = ctx ? await getAthleteByUserId(prisma, ctx.user.id) : null;
  // A disabled athlete only sees the /disabled page, so no tab bar.
  const athlete = account && !account.disabledAt ? account : null;
  return (
    <>
      <ServiceWorkerRegistrar />
      {athlete && !ctx?.impersonatedBy && <PushResync />}
      {ctx?.impersonatedBy && <ImpersonationBanner name={ctx.user.name} />}
      <main className={cx("mx-auto max-w-md px-4 pt-4", athlete ? "pb-28" : "pb-8")}><InstallGate enabled={process.env.INSTALL_GATE !== "off"}>{children}</InstallGate></main>
      {/* useSearchParams needs a Suspense boundary. */}
      {athlete && <Suspense><AthleteTabBar /></Suspense>}
    </>
  );
}
