"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, Dumbbell, Megaphone, Trophy, UserRound } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { programOf, programPageHref, programPageOf, type ProgramPage } from "@/lib/routes";

type Item = { key: string; Icon: typeof Dumbbell } & ({ page: ProgramPage } | { href: "/prs" | "/me" });

// The program's pages on the left, today in the middle, the athlete's own pages on the right.
const ITEMS: Item[] = [
  { page: "board", key: "board", Icon: Megaphone },
  { page: "calendar", key: "calendar", Icon: CalendarDays },
  { page: "today", key: "today", Icon: Dumbbell },
  { href: "/prs", key: "prs", Icon: Trophy },
  { href: "/me", key: "me", Icon: UserRound },
];

/** Bottom tab bar; the program tabs keep the program being viewed. */
export function AthleteTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const program = programOf(pathname, useSearchParams().get("program"));
  const current = programPageOf(pathname);
  return (
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          // A tab stays active on its nested pages ("/prs/Back Squat").
          const active = "page" in item ? current === item.page : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const href = "page" in item ? programPageHref(item.page, program) : item.href;
          const { key, Icon } = item;
          return (
            <li key={key} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined}
                className={cx("relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-foreground",
                  active ? "text-foreground" : "text-muted hover:text-foreground")}>
                {active && <span aria-hidden className="absolute inset-x-[28%] -top-px h-[3px] -skew-x-30 bg-accent forced-colors:bg-[Highlight]" />}
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
