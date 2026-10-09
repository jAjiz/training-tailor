"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDay } from "@/lib/format";
import { addDays, addMonths, mondayOf, monthGrid, todayIn, type IsoDate } from "@/lib/training/dates";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

type Props = {
  value: IsoDate | null;
  onSelect: (date: IsoDate) => void;
  /** The first date that can be picked. */
  min?: IsoDate;
  /** A further rule on top of `min` (only Mondays, say). */
  allow?: (date: IsoDate) => boolean;
  /** "week" picks a Monday-to-Sunday week: rows highlight whole and the value's week shows selected. */
  select?: "day" | "week";
  /** Focus the selected (or first pickable) day on mount, as a popup that just opened should. */
  autoFocus?: boolean;
};

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * A Monday-first month grid in the viewer's language. Arrows move a single tab stop around the days (Page Up
 * and Page Down change month, Home and End go to the week's ends); Enter or a click picks.
 */
export function Calendar({ value, onSelect, min, allow, select = "day", autoFocus = false }: Props) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [today] = useState(() => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone));
  const pickable = (d: IsoDate) => (min === undefined || d >= min) && (allow?.(d) ?? true);
  const [focused, setFocused] = useState<IsoDate>(() => value ?? (min && min > today ? min : today));
  const [month, setMonth] = useState(focused.slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(autoFocus);
  const weeks = monthGrid(month);
  const selectedWeek = value && select === "week" ? mondayOf(value) : null;
  // One tab stop: the focused day while it is on screen, else the month's first pickable day.
  const shown = weeks.flat();
  const tabStop = shown.includes(focused) ? focused : shown.find((d) => d.slice(0, 7) === month && pickable(d)) ?? `${month}-01`;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, month]);

  function go(date: IsoDate) {
    moveFocus.current = true;
    setFocused(date);
    setMonth(date.slice(0, 7));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    let next: IsoDate | null = null;
    if (e.key in KEY_STEPS) next = addDays(focused, KEY_STEPS[e.key]);
    else if (e.key === "Home") next = mondayOf(focused);
    else if (e.key === "End") next = addDays(mondayOf(focused), 6);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      // The same day of the next or previous month, or that month's last day (31 March → 28 February).
      const target = addMonths(month, e.key === "PageUp" ? -1 : 1);
      const last = addDays(`${addMonths(target, 1)}-01`, -1);
      const sameDay = `${target}-${focused.slice(8)}`;
      next = sameDay > last ? last : sameDay;
    }
    if (next === null) return;
    e.preventDefault();
    go(next);
  }

  // The month before `min`'s holds nothing pickable.
  const canGoBack = min === undefined || addMonths(month, -1) >= min.slice(0, 7);

  return (
    <div className="flex w-72 flex-col gap-2">
      <div className="flex items-center justify-between">
        <IconButton label={t("prevMonth")} size="sm" disabled={!canGoBack} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={16} aria-hidden />
        </IconButton>
        <span aria-live="polite" className="text-sm font-bold first-letter:uppercase">
          {formatDay(`${month}-01`, locale, { month: "long", year: "numeric" })}
        </span>
        <IconButton label={t("nextMonth")} size="sm" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={16} aria-hidden />
        </IconButton>
      </div>
      <div ref={grid} role="grid" onKeyDown={onKeyDown} className="flex flex-col gap-0.5">
        <div role="row" className="grid grid-cols-7">
          {weeks[0].map((d) => (
            <span key={d} role="columnheader" aria-label={formatDay(d, locale, { weekday: "long" })}
              className="py-1 text-center text-xs font-semibold uppercase text-muted">
              {formatDay(d, locale, { weekday: "narrow" })}
            </span>
          ))}
        </div>
        {weeks.map((week) => {
          const weekSelected = week[0] === selectedWeek;
          return (
            <div key={week[0]} role="row"
              className={cx("grid grid-cols-7 rounded-xl", select === "week" && (weekSelected ? "bg-foreground text-background" : "has-[button:not([aria-disabled]):hover]:bg-surface-2"))}>
              {week.map((d) => {
                const daySelected = select === "day" && d === value;
                const enabled = pickable(d);
                return (
                  <span key={d} role="gridcell" aria-selected={daySelected || weekSelected}>
                    {/* aria-disabled, not disabled: arrow keys still walk over days that can't be picked. */}
                    <button type="button" data-date={d} aria-disabled={!enabled || undefined} tabIndex={d === tabStop ? 0 : -1}
                      aria-label={formatDay(d, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      aria-current={d === today ? "date" : undefined}
                      onClick={() => { if (enabled) onSelect(d); }} onFocus={() => setFocused(d)}
                      className={cx(
                        "mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-30",
                        daySelected ? "bg-foreground text-background" : select === "day" && "[&:not([aria-disabled])]:hover:bg-surface-2",
                        d === today && !daySelected && !weekSelected && "ring-1 ring-muted",
                        d.slice(0, 7) !== month && !weekSelected && "text-muted/50",
                      )}>
                      {Number(d.slice(8))}
                    </button>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
