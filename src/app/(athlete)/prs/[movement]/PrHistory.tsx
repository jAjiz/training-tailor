"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/controls";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import type { IsoDate } from "@/lib/training/dates";
import { parseDecimal } from "@/lib/training/log-draft";
import type { ErrorCode } from "@/lib/training/errors";
import { addPrAction, deletePrAction } from "../../pr-actions";

type Entry = { id: string; kg: number; label: string };

export function PrHistory({ movement, today, entries }: { movement: string; today: IsoDate; entries: Entry[] }) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState<IsoDate>(today);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const value = parseDecimal(kg);
    if (!Number.isFinite(value)) return setError("invalid_request");
    setPending(true);
    try {
      const r = await addPrAction({ movement, kg: value, achievedOn: date });
      if (r.ok) {
        setKg("");
        setError(null);
        router.refresh();
      } else {
        setError(r.code);
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (pending) return;
    const yes = await confirm({ title: t("common.delete"), message: t("prs.deleteConfirm"), confirmLabel: t("common.delete") });
    if (!yes) return;
    setPending(true);
    try {
      const r = await deletePrAction(id);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.code);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("prs.kg")}>
            <Input required inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
          </Field>
          <Field label={t("prs.date")}>
            <DatePicker value={date} onChange={setDate} allow={(d) => d <= today} />
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
        <Button type="submit" variant="primary" block disabled={pending}>{t("prs.add")}</Button>
      </form>
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("prs.history")}</h2>
        {entries.length === 0 ? <EmptyState>{t("prs.empty")}</EmptyState> : (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-[15px]">{e.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{e.kg} {t("prs.kg")}</span>
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove(e.id)}>{t("common.delete")}</Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
      {dialog}
    </div>
  );
}
