"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { chromeNavClasses } from "@/components/ui/Pill";
import { coachProgramIdOf } from "@/lib/routes";

/** "Programs" and, inside a program, its Planner / Athletes / Board / Settings tabs. Only one item is current. */
export function CoachNavLinks() {
  const t = useTranslations();
  const pathname = usePathname();
  const programId = coachProgramIdOf(pathname);
  const programsActive = !programId && (pathname === "/coach" || pathname.startsWith("/coach/programs"));
  const base = `/coach/programs/${programId}`;
  const tabs = [
    { href: base, label: t("programs.planner"), active: pathname === base },
    ...[
      { href: `${base}/athletes`, label: t("programs.roster") },
      { href: `${base}/board`, label: t("programs.board") },
      { href: `${base}/settings`, label: t("programs.settings") },
    ].map((tab) => ({ ...tab, active: pathname === tab.href || pathname.startsWith(`${tab.href}/`) })),
  ];
  return (
    <>
      <nav aria-label={t("nav.main")}>
        <ul className="flex gap-1">
          <li>
            <Link href="/coach" aria-current={programsActive ? "page" : undefined} className={chromeNavClasses(programsActive)}>
              {t("nav.programs")}
            </Link>
          </li>
        </ul>
      </nav>
      {programId && (
        <nav aria-label={t("programs.sectionsNav")} className="min-w-0 overflow-x-auto max-md:order-last max-md:-mb-5 max-md:w-full">
          {/* The padding keeps the slant's overhang and the focus ring from being clipped by the scroller. */}
          <ul className="flex w-max gap-1 px-2 py-2">
            {tabs.map((tab) => (
              <li key={tab.href}>
                <Link href={tab.href} aria-current={tab.active ? "page" : undefined} className={chromeNavClasses(tab.active)}>
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
