import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { formatDay } from "@/lib/format";
import { addDays, mondayOf, type IsoDate } from "@/lib/training/dates";

type Props = {
  programId: string;
  selected: IsoDate;
  today: IsoDate;
  withBlocks: Set<IsoDate>;
  locale: string;
  labels: { prev: string; next: string };
};

const arrow = "flex h-12 w-7 shrink-0 items-center justify-center rounded-lg text-on-chrome/60 hover:text-on-chrome focus-visible:outline-2 focus-visible:outline-on-chrome";

/** Monday-to-Sunday row of slanted cells on the navy header; the selected day is cyan, a dot marks days with blocks. */
export function WeekStrip({ programId, selected, today, withBlocks, locale, labels }: Props) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="mt-3 flex items-center">
      <Link href={`/?program=${programId}&date=${addDays(monday, -7)}`} aria-label={labels.prev} className={arrow}><ChevronLeft size={18} aria-hidden /></Link>
      <ol className="grid flex-1 grid-cols-7 gap-1 text-center">
        {days.map((d) => {
          const isSelected = d === selected;
          return (
            <li key={d}>
              <Link href={`/?program=${programId}&date=${d}`} aria-current={isSelected ? "date" : undefined}
                className={cx("slant flex flex-col items-center py-1 [--slant-focus:var(--on-chrome)]",
                  isSelected ? "text-on-accent before:bg-accent" : "before:bg-white/10", d === today ? "font-extrabold" : "font-semibold")}>
                <span className={cx("type-display text-[11px]", !isSelected && "text-on-chrome/70")}>
                  {formatDay(d, locale, { weekday: "short" }).replace(/\.$/, "")}
                </span>
                <span className={cx("text-lg leading-tight", !isSelected && d === today && "text-accent forced-colors:underline")}>{Number(d.slice(8))}</span>
                <span className={cx("mt-0.5 h-1 w-1 rounded-full", !withBlocks.has(d) ? "bg-transparent" : isSelected ? "bg-current" : "bg-on-chrome forced-colors:bg-[CanvasText]")} />
              </Link>
            </li>
          );
        })}
      </ol>
      <Link href={`/?program=${programId}&date=${addDays(monday, 7)}`} aria-label={labels.next} className={arrow}><ChevronRight size={18} aria-hidden /></Link>
    </div>
  );
}
