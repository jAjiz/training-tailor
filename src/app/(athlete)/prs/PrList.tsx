"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/EmptyState";

type Group = { pattern: string; label: string; movements: { name: string; kg: number | null }[] };

export function PrList({ groups }: { groups: Group[] }) {
  const t = useTranslations("prs");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = groups
    .map((g) => ({ ...g, movements: g.movements.filter((m) => m.name.toLowerCase().includes(q)) }))
    .filter((g) => g.movements.length > 0);
  return (
    <div className="flex flex-col gap-5">
      <Input type="search" aria-label={t("search")} placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
      {visible.length === 0 && <EmptyState>{t("noResults")}</EmptyState>}
      {visible.map((g) => (
        <section key={g.pattern} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h2>
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y">
              {g.movements.map((m) => (
                <li key={m.name}>
                  <Link href={`/prs/${encodeURIComponent(m.name)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-foreground">
                    <span className="min-w-0 truncate text-[15px]">{m.name}</span>
                    <span className="shrink-0 text-right font-semibold tabular-nums">{m.kg !== null ? `${m.kg} ${t("kg")}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
