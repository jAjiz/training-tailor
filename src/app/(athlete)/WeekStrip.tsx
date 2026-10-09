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

/** Monday-to-Sunday strip on the black header; the selected day is framed, a dot marks days with blocks. */
export function WeekStrip({ programId, selected, today, withBlocks, locale, labels }: Props) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="mt-3 flex items-center">
      <Link href={`/?program=${programId}&date=${addDays(monday, -7)}`} aria-label={labels.prev} className={arrow}><ChevronLeft size={18} aria-hidden /></Link>
      <ol className="grid flex-1 grid-cols-7 text-center">
        {days.map((d) => (
          <li key={d}>
            <Link href={`/?program=${programId}&date=${d}`} aria-current={d === selected ? "date" : undefined}
              className={cx("mx-auto flex w-11 flex-col items-center rounded-xl border-2 py-1 focus-visible:outline-2 focus-visible:outline-on-chrome",
                d === selected ? "border-on-chrome" : "border-transparent", d === today ? "font-extrabold" : "font-semibold")}>
              <span className="text-[11px] uppercase tracking-wide text-on-chrome/70">{formatDay(d, locale, { weekday: "short" }).replace(/\.$/, "")}</span>
              <span className="text-lg leading-tight">{Number(d.slice(8))}</span>
              <span className={cx("mt-0.5 h-1 w-1 rounded-full", withBlocks.has(d) ? "bg-on-chrome" : "bg-transparent")} />
            </Link>
          </li>
        ))}
      </ol>
      <Link href={`/?program=${programId}&date=${addDays(monday, 7)}`} aria-label={labels.next} className={arrow}><ChevronRight size={18} aria-hidden /></Link>
    </div>
  );
}
