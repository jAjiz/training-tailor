"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

export type InboxItem = { id: string; text: string; time: string; unread: boolean };

type Props = {
  items: InboxItem[];
  /** The zone's own actions. */
  open: (id: string) => Promise<ActionResult<{ href: string }>>;
  markAll: () => Promise<ActionResult>;
};

/** Newest first, unread in bold. Opening a row marks it read (server side) and goes to its target. */
export function InboxList({ items, open, markAll }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  async function openRow(id: string) {
    setError(null);
    const r = await open(id).catch((): ActionResult<{ href: string }> => ({ ok: false, code: "internal" }));
    if (r.ok) router.push(r.value.href);
    else setError(r.code);
  }

  async function readAll() {
    setBusy(true);
    setError(null);
    const r = await markAll().catch((): ActionResult => ({ ok: false, code: "internal" }));
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  if (items.length === 0) return <EmptyState>{t("notifications.empty")}</EmptyState>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" disabled={busy || !items.some((i) => i.unread)} onClick={() => void readAll()}>
          {t("notifications.markAll")}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      <Card as="section" className="overflow-hidden">
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => void openRow(i.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground">
                <span aria-hidden className={i.unread ? "mt-2 size-2 shrink-0 rounded-full bg-danger" : "mt-2 size-2 shrink-0"} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={i.unread ? "font-bold" : "text-muted"}>{i.text}</span>
                  <span className="text-xs text-muted">{i.time}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
