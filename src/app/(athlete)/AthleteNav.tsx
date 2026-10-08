"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS = [
  { href: "/", key: "today" },
  { href: "/me", key: "me" },
] as const;

export function AthleteNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t bg-white">
      <ul className="mx-auto flex max-w-md justify-around py-3 text-sm">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={pathname === item.href ? "font-semibold" : "text-neutral-500"}>
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
