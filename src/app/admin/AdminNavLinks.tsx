"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navPillClasses } from "@/components/ui/Pill";

const LINKS = [
  { href: "/admin", key: "overview" },
  { href: "/admin/coaches", key: "coaches" },
  { href: "/admin/athletes", key: "athletes" },
  { href: "/admin/programs", key: "programs" },
  { href: "/admin/audit", key: "audit" },
] as const;

export function AdminNavLinks() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label={t("label")} className="min-w-0 overflow-x-auto overflow-y-hidden">
      <ul className="flex gap-1">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={navPillClasses(isActive(l.href))}>{t(l.key)}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
