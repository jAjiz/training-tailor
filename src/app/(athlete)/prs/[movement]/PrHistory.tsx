"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/controls";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import type { IsoDate } from "@/lib/training/dates";
import type { ErrorCode } from "@/lib/training/errors";
import { parseDecimal, parseInteger } from "@/lib/training/log-draft";
import { DISTANCE_OPTIONS, REP_OPTIONS, formatDistance, parseDuration, type RecordKind } from "@/lib/training/records";
import { addPrAction, deletePrAction } from "../../pr-actions";

/** One kind's rows on a movement page, ready to show: the bests and the dated history. */
export type RecordSection = {
  kind: RecordKind;
  bests: { label: string; value: string }[];
  entries: { id: string; label: string; value: string }[];
};

const BEST_TITLE = { lift: "bestByReps", reps: "bestByLoad", time: "bestByDistance" } as const;

/**
 * A movement's records. The form adds the kind the library gives the movement today (none when it gives none); rows
 * of any stored kind are listed and can be deleted.
 */
export function PrHistory({ movement, today, formKind, sections }: {
  movement: string; today: IsoDate; formKind: RecordKind | null; sections: RecordSection[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [kg, setKg] = useState("");
  const [reps, setReps] = useState(formKind === "lift" ? "1" : "");
  const [distance, setDistance] = useState<string>(String(DISTANCE_OPTIONS[1]));
  const [time, setTime] = useState("");
  const [date, setDate] = useState<IsoDate>(today);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  /** The action input for what is typed, or null when something is not a valid number or time. */
  function input() {
    const base = { movement, achievedOn: date };
    if (formKind === "lift") {
      const load = parseDecimal(kg);
      return Number.isFinite(load) ? { kind: "lift" as const, ...base, kg: load, reps: Number(reps) } : null;
    }
    if (formKind === "reps") {
      const count = parseInteger(reps);
      const load = kg.trim() === "" ? null : parseDecimal(kg);
      if (!Number.isFinite(count) || (load !== null && !Number.isFinite(load))) return null;
      return { kind: "reps" as const, movement, reps: count, kg: load, achievedOn: date };
    }
    const seconds = parseDuration(time);
    return seconds === null ? null : { kind: "time" as const, movement, distanceM: Number(distance), seconds, achievedOn: date };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const value = input();
    if (!value) return setError("invalid_request");
    setPending(true);
    try {
      const r = await addPrAction(value);
      if (r.ok) {
        setKg("");
        setTime("");
        if (formKind === "reps") setReps("");
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

  const dateField = (
    <Field label={t("prs.date")}>
      <DatePicker label={t("prs.date")} value={date} onChange={setDate} allow={(d) => d <= today} />
    </Field>
  );

  return (
    <div className="flex flex-col gap-6">
      {formKind && (
        <form onSubmit={add} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {formKind === "lift" && <>
              <Field label={t("prs.kg")}><Input required inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
              <Field label={t("prs.reps")}>
                <Select aria-label={t("prs.reps")} value={reps} onChange={(e) => setReps(e.target.value)}>
                  {REP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
            </>}
            {formKind === "reps" && <>
              <Field label={t("prs.reps")}><Input required inputMode="numeric" aria-label={t("prs.reps")} value={reps} onChange={(e) => setReps(e.target.value)} /></Field>
              <Field label={t("prs.addedLoad")}><Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
            </>}
            {formKind === "time" && <>
              <Field label={t("prs.distance")}>
                <Select aria-label={t("prs.distance")} value={distance} onChange={(e) => setDistance(e.target.value)}>
                  {DISTANCE_OPTIONS.map((m) => <option key={m} value={m}>{formatDistance(m)}</option>)}
                </Select>
              </Field>
              <Field label={t("prs.time")}>
                <Input required aria-label={t("prs.time")} placeholder={t("prs.timeHint")} inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </>}
            {dateField}
          </div>
          {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
          <Button type="submit" variant="primary" block slanted disabled={pending}>{t("prs.add")}</Button>
        </form>
      )}
      {!formKind && error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      {sections.length === 0 && <EmptyState>{t("prs.empty")}</EmptyState>}
      {sections.map((s) => (
        <div key={s.kind} className="flex flex-col gap-6">
          {s.bests.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-xs tracking-wide text-muted">{t(`prs.${BEST_TITLE[s.kind]}`)}</h2>
              <Card className="overflow-hidden">
                <ul className="flex flex-col divide-y">
                  {s.bests.map((b) => (
                    <li key={b.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-[15px]">{b.label}</span>
                      <span className="font-semibold tabular-nums">{b.value}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-xs tracking-wide text-muted">
              {sections.length > 1 ? `${t("prs.history")} · ${t(`prs.tabs.${s.kind}`)}` : t("prs.history")}
            </h2>
            {s.entries.length === 0 ? <EmptyState>{t("prs.empty")}</EmptyState> : (
              <Card className="overflow-hidden">
                <ul className="flex flex-col divide-y">
                  {s.entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-[15px]">{e.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{e.value}</span>
                        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove(e.id)}>{t("common.delete")}</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      ))}
      {dialog}
    </div>
  );
}
