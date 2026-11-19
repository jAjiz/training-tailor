"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/EmptyState";
import { Segmented } from "@/components/ui/Segmented";
import type { RecordKind } from "@/lib/training/records";

export type RecordRow = { name: string; summary: string | null; estimated: boolean };
export type RecordGroup = { label: string | null; movements: RecordRow[] };
export type RecordTabs = Record<RecordKind, RecordGroup[]>;

const KINDS: RecordKind[] = ["lift", "reps", "time"];

/** The records list, one sub-tab per kind. The open tab lives in `?tab=`, so back and links keep it. */
export function PrList({ tabs, initialTab }: { tabs: RecordTabs; initialTab: RecordKind }) {
  const t = useTranslations("prs");
  const [tab, setTab] = useState<RecordKind>(initialTab);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = tabs[tab]
    .map((g) => ({ ...g, movements: g.movements.filter((m) => m.name.toLowerCase().includes(q)) }))
    .filter((g) => g.movements.length > 0);

  function open(next: RecordKind) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <Segmented label={t("tabsLabel")} value={tab} onChange={open} options={KINDS.map((k) => ({ value: k, label: t(`tabs.${k}`) }))} />
      <Input type="search" aria-label={t("search")} placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
      {visible.length === 0 && <EmptyState>{t("noResults")}</EmptyState>}
      {visible.map((g, i) => (
        <section key={g.label ?? i} className="flex flex-col gap-2">
          {g.label && <h2 className="px-1 text-xs tracking-wide text-muted">{g.label}</h2>}
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y">
              {g.movements.map((m) => (
                <li key={m.name}>
                  <Link href={`/prs/${encodeURIComponent(m.name)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-foreground">
                    <span className="min-w-0 truncate text-[15px]">{m.name}</span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="font-semibold tabular-nums">{m.summary ?? ""}</span>
                      {m.estimated && <span className="text-xs text-muted">{t("estimated")}</span>}
                    </span>
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
