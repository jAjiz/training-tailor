"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar } from "@/components/ui/Calendar";
import { Popover } from "@/components/ui/Popover";
import { continuousTarget } from "@/lib/training/copy-target";
import type { IsoDate } from "@/lib/training/dates";

/** A continuous program's week label: a click opens a calendar and picking a week opens it. Nothing before the start. */
export function WeekPicker({ label, startDate, weekStart }: { label: string; startDate: IsoDate; weekStart: IsoDate }) {
  const t = useTranslations("planner");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function pick(date: IsoDate) {
    setOpen(false);
    const week = continuousTarget("week", startDate, date);
    if (week !== null) router.push(`?week=${week}`);
  }

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={t("pickWeek", { week: label })}
        className="min-w-28 rounded-lg px-1 text-center text-lg font-bold transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-foreground">
        {label}
      </button>
      {open && (
        <Popover anchor={trigger} label={t("pickWeek", { week: label })} onClose={() => setOpen(false)}>
          <Calendar select="week" value={weekStart} min={startDate} onSelect={pick} autoFocus />
        </Popover>
      )}
    </>
  );
}
