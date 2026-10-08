import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const coach = user ? await getCoachByUserId(prisma, user.id) : null;
  const t = await getTranslations("nav");
  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3 text-sm">
          <span className="font-semibold">Training Tailor · Coach</span>
          {coach?.status === "approved" && <Link href="/coach">{t("programs")}</Link>}
          {user && <span className="ml-auto"><SignOutButton to="/coach/signin" /></span>}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </>
  );
}
