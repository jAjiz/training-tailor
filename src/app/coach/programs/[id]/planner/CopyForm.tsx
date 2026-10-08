"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  label: string;
  withDay: boolean;
  defaultWeek: number;
  maxWeek: number | null;
  onCopy: (week: number, day: number | null) => Promise<ActionResult>;
  onDone: () => void;
};

/** Asks for a target week (and day), 1-based on screen, 0-based to the action. */
export function CopyForm({ label, withDay, defaultWeek, maxWeek, onCopy, onDone }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(String(defaultWeek + 1));
  const [day, setDay] = useState("1");
  const [error, setError] = useState<ErrorCode | null>(null);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="underline">{label}</button>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await onCopy(Number(week) - 1, withDay ? Number(day) - 1 : null);
    if (r.ok) {
      setOpen(false);
      setError(null);
      onDone();
    } else {
      setError(r.code);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1 text-xs">
      <label>{t("planner.targetWeek")}{" "}
        <input type="number" min={1} max={maxWeek === null ? undefined : maxWeek + 1} value={week}
          onChange={(e) => setWeek(e.target.value)} className="w-14 rounded border px-1" />
      </label>
      {withDay && (
        <label>{t("planner.targetDay")}{" "}
          <input type="number" min={1} max={7} value={day} onChange={(e) => setDay(e.target.value)} className="w-10 rounded border px-1" />
        </label>
      )}
      <button className="underline">{t("planner.copy")}</button>
      <button type="button" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
      {error && <span className="text-red-700">{t(`errors.${error}`)}</span>}
    </form>
  );
}
