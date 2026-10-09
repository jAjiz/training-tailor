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
  className?: string;
};

/** A date field: shows the date in the viewer's language and opens the app's Calendar under it. */
export function DatePicker({ value, onChange, min, allow, select, disabled, className }: Props) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={trigger} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(controlClasses(), "flex items-center justify-between gap-3 text-left", className)}>
        <span className={cx(!value && "text-muted")}>
          {value ? formatDay(value, locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—"}
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
