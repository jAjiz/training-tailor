"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navPillClasses } from "@/components/ui/Pill";

export function CoachNavLinks() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = pathname === "/coach" || pathname.startsWith("/coach/programs");
  return (
    <nav aria-label={t("main")}>
      <ul className="flex gap-1">
        <li><Link href="/coach" aria-current={active ? "page" : undefined} className={navPillClasses(active)}>{t("programs")}</Link></li>
      </ul>
    </nav>
  );
}
