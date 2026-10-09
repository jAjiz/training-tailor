import { Suspense } from "react";
import { cx } from "@/components/ui/cx";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { AthleteTabBar } from "./AthleteTabBar";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  return (
    <>
      <main className={cx("mx-auto max-w-md px-4 pt-4", athlete ? "pb-28" : "pb-8")}>{children}</main>
      {/* useSearchParams needs a Suspense boundary. */}
      {athlete && <Suspense><AthleteTabBar /></Suspense>}
    </>
  );
}
