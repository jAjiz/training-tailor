import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BlockCard } from "@/components/training/BlockCard";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { addDays, isIsoDate, mondayOf, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { getAthleteDay, getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { ProgramSelect } from "./ProgramSelect";
import { WeekStrip } from "./WeekStrip";

type Props = { searchParams: Promise<{ program?: string; date?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  const athlete = await requireAthletePage();
  const { program: programParam, date: dateParam } = await searchParams;
  const t = await getTranslations("today");
  const locale = await getLocale();

  const enrollments = await listAthletePrograms(prisma, athlete.id);
  if (enrollments.length === 0) return <p className="py-12 text-center text-neutral-600">{t("noPrograms")}</p>;

  const programId = enrollments.some((e) => e.programId === programParam) ? programParam as string : enrollments[0].programId;
  const today = todayIn(athlete.timezone);
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const monday = mondayOf(date);
  const [day, withBlocks] = await Promise.all([
    orNotFound(getAthleteDay(prisma, athlete.id, programId, date, today)),
    getVisibleDays(prisma, athlete.id, programId, monday, addDays(monday, 6)),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <ProgramSelect programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={programId} />
      <WeekStrip programId={programId} selected={date} today={today} withBlocks={withBlocks} locale={locale} />
      <div className="flex items-center justify-between text-sm">
        <span className="inline-block text-neutral-600 first-letter:uppercase">
          {formatDay(date, locale, { weekday: "long", day: "numeric", month: "long" })}
          {day.timeline.kind === "closed" && day.dayIndex !== null &&
            ` · ${t("dayOfProgram", { week: weekIndexOf(day.dayIndex) + 1, day: (day.dayIndex % 7) + 1 })}`}
        </span>
        <span className="flex gap-3">
          {date !== today && <Link href={`/?program=${programId}`} className="underline">{t("today")}</Link>}
          <Link href={`/calendar?program=${programId}&month=${date.slice(0, 7)}`} className="underline">{t("calendar")}</Link>
        </span>
      </div>
      {day.status === "before_start" && <p className="text-neutral-600">{t("startsOn", { date: formatDay(day.timeline.startDate, locale) })}</p>}
      {day.status === "finished" && <p className="text-neutral-600">{t("finished")}</p>}
      {(day.status === "unpublished" || (day.status === "ok" && day.blocks.length === 0)) && <p className="text-neutral-600">{t("nothing")}</p>}
      {day.blocks.map((b) => (
        <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} />
      ))}
    </section>
  );
}
