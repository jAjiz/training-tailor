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
import { REP_OPTIONS, formatTarget, parseDuration, type RecordEntry } from "@/lib/training/records";
import { addPrAction, deletePrAction } from "../../pr-actions";

export type RecordLine = { label: string; value: string };

const BEST_TITLE = { lift: "bestByReps", reps: "bestByLoad", distance: "bestDistance", time: "bestByTarget" } as const;

/** A movement's records: the add form its catalog entry asks for, its bests and its dated history. */
export function PrHistory({ movement, today, entry, bests, entries }: {
  movement: string; today: IsoDate; entry: RecordEntry; bests: RecordLine[]; entries: (RecordLine & { id: string })[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [kg, setKg] = useState("");
  const [reps, setReps] = useState(entry.kind === "lift" ? "1" : "");
  const [metres, setMetres] = useState("");
  const [target, setTarget] = useState("0");
  const [time, setTime] = useState("");
  const [date, setDate] = useState<IsoDate>(today);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  /** The action input for what is typed, or null when something is not a valid number or time. */
  function input() {
    const base = { movement, achievedOn: date };
    switch (entry.kind) {
      case "lift": {
        const load = parseDecimal(kg);
        return Number.isFinite(load) ? { kind: "lift" as const, ...base, kg: load, reps: Number(reps) } : null;
      }
      case "reps": {
        const count = parseInteger(reps);
        const load = !entry.weighted || kg.trim() === "" ? null : parseDecimal(kg);
        if (!Number.isFinite(count) || (load !== null && !Number.isFinite(load))) return null;
        return { kind: "reps" as const, movement, reps: count, kg: load, achievedOn: date };
      }
      case "distance": {
        const distanceM = parseInteger(metres);
        return Number.isFinite(distanceM) ? { kind: "distance" as const, movement, distanceM, achievedOn: date } : null;
      }
      case "time": {
        const seconds = parseDuration(time);
        const goal = entry.targets[Number(target)];
        return seconds === null || !goal ? null : { kind: "time" as const, movement, ...goal, seconds, achievedOn: date };
      }
    }
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
        setMetres("");
        if (entry.kind === "reps") setReps("");
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
      <form onSubmit={add} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          {entry.kind === "lift" && <>
            <Field label={t("prs.kg")}><Input required inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
            <Field label={t("prs.reps")}>
              <Select aria-label={t("prs.reps")} value={reps} onChange={(e) => setReps(e.target.value)}>
                {REP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </>}
          {entry.kind === "reps" && <>
            <Field label={t("prs.reps")}><Input required inputMode="numeric" aria-label={t("prs.reps")} value={reps} onChange={(e) => setReps(e.target.value)} /></Field>
            {entry.weighted && (
              <Field label={t("prs.addedLoad")}><Input inputMode="decimal" aria-label={t("prs.addedLoad")} value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
            )}
          </>}
          {entry.kind === "distance" && (
            <Field label={t("prs.distanceRecord")}>
              <Input required inputMode="numeric" aria-label={t("prs.distanceRecord")} value={metres} onChange={(e) => setMetres(e.target.value)} />
            </Field>
          )}
          {entry.kind === "time" && <>
            <Field label={t("prs.target")}>
              <Select aria-label={t("prs.target")} value={target} onChange={(e) => setTarget(e.target.value)}>
                {entry.targets.map((goal, i) => <option key={formatTarget(goal)} value={i}>{formatTarget(goal)}</option>)}
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
      {bests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs tracking-wide text-muted">{t(`prs.${BEST_TITLE[entry.kind]}`)}</h2>
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y">
              {bests.map((b) => (
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
        <h2 className="px-1 text-xs tracking-wide text-muted">{t("prs.history")}</h2>
        {entries.length === 0 ? <EmptyState>{t("prs.empty")}</EmptyState> : (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y">
              {entries.map((e) => (
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
      {dialog}
    </div>
  );
}
