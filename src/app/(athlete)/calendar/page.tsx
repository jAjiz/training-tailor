import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { monthGrid, todayIn } from "@/lib/training/dates";
import { getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ program?: string; month?: string }> }) {
  const athlete = await requireAthletePage();
  const { program: programParam, month: monthParam } = await searchParams;
  const t = await getTranslations("calendar");
  const locale = await getLocale();
  const enrollments = await listAthletePrograms(prisma, athlete.id);
  const enrollment = enrollments.find((e) => e.programId === programParam) ?? enrollments[0];
  if (!enrollment) return null;

  const today = todayIn(athlete.timezone);
  const month = monthParam && MONTH.test(monthParam) ? monthParam : today.slice(0, 7);
  const weeks = monthGrid(month);
  const withBlocks = await orNotFound(getVisibleDays(prisma, athlete.id, enrollment.programId, weeks[0][0], weeks.at(-1)![6]));
  const href = (m: string) => `/calendar?program=${enrollment.programId}&month=${m}`;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-center text-lg font-semibold">{enrollment.program.name}</h1>
      <div className="flex items-center justify-between text-sm">
        <Link href={href(shiftMonth(month, -1))} className="underline">{t("prevMonth")}</Link>
        <span className="inline-block font-medium first-letter:uppercase">{formatDay(`${month}-01`, locale, { month: "long", year: "numeric" })}</span>
        <Link href={href(shiftMonth(month, 1))} className="underline">{t("nextMonth")}</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {weeks[0].map((d) => <span key={d} className="uppercase text-neutral-500">{formatDay(d, locale, { weekday: "narrow" })}</span>)}
        {weeks.flat().map((d) => (
          <Link key={d} href={`/?program=${enrollment.programId}&date=${d}`}
            className={`flex flex-col items-center rounded py-2 ${d.slice(0, 7) === month ? "" : "text-neutral-300"} ${d === today ? "font-bold" : ""}`}>
            {Number(d.slice(8))}
            <span className={`mt-1 h-1 w-1 rounded-full ${withBlocks.has(d) ? "bg-black" : "bg-transparent"}`} />
          </Link>
        ))}
      </div>
    </section>
  );
}
