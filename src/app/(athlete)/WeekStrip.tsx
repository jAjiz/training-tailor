import Link from "next/link";
import { formatDay } from "@/lib/format";
import { addDays, mondayOf, type IsoDate } from "@/lib/training/dates";

type Props = { programId: string; selected: IsoDate; today: IsoDate; withBlocks: Set<IsoDate>; locale: string };

/** Monday-to-Sunday strip around the selected date; a dot marks days with published blocks. */
export function WeekStrip({ programId, selected, today, withBlocks, locale }: Props) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="flex items-center gap-1">
      <Link href={`/?program=${programId}&date=${addDays(monday, -7)}`} className="px-1 text-neutral-500" aria-label="previous week">‹</Link>
      <ol className="grid flex-1 grid-cols-7 gap-1 text-center text-xs">
        {days.map((d) => (
          <li key={d}>
            <Link href={`/?program=${programId}&date=${d}`}
              className={`flex flex-col items-center rounded py-1 ${d === selected ? "border border-black" : ""} ${d === today ? "font-bold" : ""}`}>
              <span className="uppercase text-neutral-500">{formatDay(d, locale, { weekday: "short" })}</span>
              <span className="text-base">{Number(d.slice(8))}</span>
              <span className={`h-1 w-1 rounded-full ${withBlocks.has(d) ? "bg-black" : "bg-transparent"}`} />
            </Link>
          </li>
        ))}
      </ol>
      <Link href={`/?program=${programId}&date=${addDays(monday, 7)}`} className="px-1 text-neutral-500" aria-label="next week">›</Link>
    </div>
  );
}
