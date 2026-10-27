"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LIBRARY_DOCUMENTS } from "@/lib/domain/library";
import { navPillClasses } from "@/components/ui/Pill";

const TABS = [
  { href: "/admin/library", key: "overview" },
  { href: "/admin/library/movements", key: "movements" },
  { href: "/admin/library/contraindications", key: "contraindications" },
  ...LIBRARY_DOCUMENTS.map((d) => ({ href: `/admin/library/documents/${d}`, key: d })),
] as const;

export function LibraryTabs() {
  const t = useTranslations("admin.library.tabs");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="overflow-x-auto overflow-y-hidden">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link href={tab.href} aria-current={active ? "page" : undefined} className={navPillClasses(active)}>{t(tab.key)}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
