import type { Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BlockCard } from "@/components/training/BlockCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { addDays, isIsoDate, mondayOf, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { getAthleteDay, getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { AthleteHeader } from "./AthleteHeader";
import { WeekStrip } from "./WeekStrip";

// The page opens with the black AthleteHeader: the browser bar matches it in both themes.
export const viewport: Viewport = { themeColor: "#000000" };

type Props = { searchParams: Promise<{ program?: string; date?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  const athlete = await requireAthletePage();
  const { program: programParam, date: dateParam } = await searchParams;
  const t = await getTranslations("today");
  const locale = await getLocale();

  const enrollments = await listAthletePrograms(prisma, athlete.id);
  if (enrollments.length === 0) return <div className="pt-8"><EmptyState>{t("noPrograms")}</EmptyState></div>;

  const programId = enrollments.some((e) => e.programId === programParam) ? programParam as string : enrollments[0].programId;
  const today = todayIn(athlete.timezone);
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const monday = mondayOf(date);
  const [day, withBlocks] = await Promise.all([
    orNotFound(getAthleteDay(prisma, athlete.id, programId, date, today)),
    getVisibleDays(prisma, athlete.id, programId, monday, addDays(monday, 6)),
  ]);

  return (
    <>
      <AthleteHeader programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={programId} basePath="/">
        <WeekStrip programId={programId} selected={date} today={today} withBlocks={withBlocks} locale={locale}
          labels={{ prev: t("prevWeek"), next: t("nextWeek") }} />
      </AthleteHeader>
      <section className="flex flex-col gap-4">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p className="inline-block text-sm font-medium text-muted first-letter:uppercase">
            {formatDay(date, locale, { weekday: "long", day: "numeric", month: "long" })}
            {day.timeline.kind === "closed" && day.dayIndex !== null &&
              ` · ${t("dayOfProgram", { week: weekIndexOf(day.dayIndex) + 1, day: (day.dayIndex % 7) + 1 })}`}
          </p>
          {date !== today && <Button href={`/?program=${programId}`} variant="ghost" size="sm">{t("today")}</Button>}
        </div>
        {day.status === "before_start" && <EmptyState>{t("startsOn", { date: formatDay(day.timeline.startDate, locale) })}</EmptyState>}
        {day.status === "finished" && <EmptyState>{t("finished")}</EmptyState>}
        {(day.status === "unpublished" || (day.status === "ok" && day.blocks.length === 0)) && <EmptyState>{t("nothing")}</EmptyState>}
        {day.blocks.map((b) => (
          <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} />
        ))}
      </section>
    </>
  );
}
