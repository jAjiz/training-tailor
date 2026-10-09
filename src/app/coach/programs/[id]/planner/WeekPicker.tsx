"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { continuousTarget } from "@/lib/training/copy-target";
import type { IsoDate } from "@/lib/training/dates";

/**
 * A continuous program's week label: a click opens the browser's date picker (an invisible input under the
 * label, so the popup anchors there) and picking any day opens its week. Days before the start can't be picked.
 */
export function WeekPicker({ label, startDate, weekStart }: { label: string; startDate: IsoDate; weekStart: IsoDate }) {
  const t = useTranslations("planner");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  function open() {
    const el = input.current;
    if (!el) return;
    el.value = weekStart;
    try { el.showPicker(); } catch { el.focus(); }
  }

  function pick(date: string) {
    const week = continuousTarget("week", startDate, date);
    if (week !== null) router.push(`?week=${week}`);
  }

  return (
    <span className="relative">
      <button type="button" onClick={open} aria-label={t("pickWeek", { week: label })}
        className="min-w-28 rounded-lg px-1 text-center text-lg font-bold transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-foreground">
        {label}
      </button>
      <input ref={input} type="date" min={startDate} tabIndex={-1} aria-hidden
        onChange={(e) => pick(e.target.value)}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0 opacity-0" />
    </span>
  );
}
