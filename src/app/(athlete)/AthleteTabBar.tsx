"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, House, UserRound } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { withProgram } from "@/lib/routes";

const ITEMS = [
  { href: "/", key: "today", Icon: House, keepProgram: true },
  { href: "/calendar", key: "calendar", Icon: CalendarDays, keepProgram: true },
  { href: "/me", key: "me", Icon: UserRound, keepProgram: false },
] as const;

/** Bottom tab bar (Strivee's WOD / PRs / Profile row), limited to the pages that exist. */
export function AthleteTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const program = useSearchParams().get("program");
  return (
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, key, Icon, keepProgram }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link href={keepProgram ? withProgram(href, program) : href} aria-current={active ? "page" : undefined}
                className={cx("flex flex-col items-center gap-1 pb-2 pt-2.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-foreground",
                  active ? "text-foreground" : "text-muted hover:text-foreground")}>
                <Icon size={24} strokeWidth={active ? 2.4 : 2} aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
