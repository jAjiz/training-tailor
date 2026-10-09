"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navPillClasses } from "@/components/ui/Pill";

/** Program name and the Planner / Athletes / Settings pills shared by the three program pages. */
export function ProgramHeader({ programId, name }: { programId: string; name: string }) {
  const t = useTranslations("programs");
  const pathname = usePathname();
  const base = `/coach/programs/${programId}`;
  const tabs = [
    { href: base, label: t("planner") },
    { href: `${base}/athletes`, label: t("roster") },
    { href: `${base}/settings`, label: t("settings") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{name}</h1>
      <nav aria-label={name}>
        <ul className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link href={tab.href} aria-current={pathname === tab.href ? "page" : undefined} className={navPillClasses(pathname === tab.href)}>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
