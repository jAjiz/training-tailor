import { Suspense } from "react";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
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
      {ctx?.impersonatedBy && <ImpersonationBanner name={ctx.user.name} />}
      <main className={cx("mx-auto max-w-md px-4 pt-4", athlete ? "pb-28" : "pb-8")}>{children}</main>
      {/* useSearchParams needs a Suspense boundary. */}
      {athlete && <Suspense><AthleteTabBar /></Suspense>}
    </>
  );
}
