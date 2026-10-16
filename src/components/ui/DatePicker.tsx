"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { formatDay } from "@/lib/format";
import type { IsoDate } from "@/lib/training/dates";
import { Calendar } from "./Calendar";
import { controlClasses } from "./controls";
import { cx } from "./cx";
import { Popover } from "./Popover";

type Props = {
  value: IsoDate | null;
  onChange: (date: IsoDate) => void;
  min?: IsoDate;
  allow?: (date: IsoDate) => boolean;
  /** "week": the calendar highlights whole weeks (any day of the picked week comes back). */
  select?: "day" | "week";
  disabled?: boolean;
  /** Accessible name prefix; combined with the shown date (e.g. "Fecha: vie, 16 de octubre de 2026"). */
  label?: string;
  className?: string;
};

/** A date field: shows the date in the viewer's language and opens the app's Calendar under it. */
export function DatePicker({ value, onChange, min, allow, select, disabled, label, className }: Props) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const shown = value ? formatDay(value, locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—";

  return (
    <>
      <button ref={trigger} type="button" disabled={disabled} aria-label={label ? `${label}: ${shown}` : undefined} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(controlClasses(), "flex items-center justify-between gap-3 text-left", className)}>
        <span className={cx(!value && "text-muted")}>
          {shown}
        </span>
        <CalendarDays size={16} aria-hidden className="shrink-0 text-muted" />
      </button>
      {open && (
        <Popover anchor={trigger} label={t("pickDate")} onClose={() => setOpen(false)}>
          <Calendar value={value} min={min} allow={allow} select={select} autoFocus
            onSelect={(d) => { onChange(d); setOpen(false); trigger.current?.focus(); }} />
        </Popover>
      )}
    </>
  );
}
