import Link from "next/link";
import type { Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { monthGrid, todayIn } from "@/lib/training/dates";
import { getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { AthleteHeader } from "../AthleteHeader";

// The page opens with the black AthleteHeader: the browser bar matches it in both themes.
export const viewport: Viewport = { themeColor: "#000000" };

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
    <>
      <AthleteHeader programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={enrollment.programId} basePath="/calendar" />
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <IconButton href={href(shiftMonth(month, -1))} label={t("prevMonth")}><ChevronLeft size={20} aria-hidden /></IconButton>
          <h2 className="inline-block text-xl font-bold first-letter:uppercase">{formatDay(`${month}-01`, locale, { month: "long", year: "numeric" })}</h2>
          <IconButton href={href(shiftMonth(month, 1))} label={t("nextMonth")}><ChevronRight size={20} aria-hidden /></IconButton>
        </div>
        <Card className="grid grid-cols-7 gap-y-1 p-3 text-center">
          {weeks[0].map((d) => (
            <span key={d} className="pb-1 text-xs font-semibold uppercase text-muted">{formatDay(d, locale, { weekday: "narrow" })}</span>
          ))}
          {weeks.flat().map((d) => (
            <Link key={d} href={`/?program=${enrollment.programId}&date=${d}`}
              className={cx("mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-xl border-2 text-sm font-semibold transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-foreground",
                d === today ? "border-foreground" : "border-transparent", d.slice(0, 7) !== month && "text-muted/50")}>
              {Number(d.slice(8))}
              <span className={cx("mt-0.5 h-1 w-1 rounded-full", withBlocks.has(d) ? "bg-foreground" : "bg-transparent")} />
            </Link>
          ))}
        </Card>
      </section>
    </>
  );
}
