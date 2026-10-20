import type { Viewport } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BlockCard } from "@/components/training/BlockCard";
import { NotInProgram } from "@/components/training/NotInProgram";
import { EnablePushCard } from "@/components/notifications/EnablePushCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { formatDay } from "@/lib/format";
import { hasLeaderboard } from "@/lib/training/access";
import { addDays, isIsoDate, mondayOf, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { formatScore, scoreTarget } from "@/lib/training/scoring";
import { getAthleteDay, getVisibleDays } from "@/lib/training/services/athlete-view";
import { getEnrollmentStatus, listAthletePrograms } from "@/lib/training/services/enrollments";
import { oneRmMap } from "@/lib/training/services/prs";
import { getDayResults } from "@/lib/training/services/results";
import { AthleteHeader } from "./AthleteHeader";
import { WeekStrip } from "./WeekStrip";

// The page opens with the black AthleteHeader: the browser bar matches it in both themes.
export const viewport: Viewport = { themeColor: "#000000" };

type Props = { searchParams: Promise<{ program?: string; date?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  const athlete = await requireAthletePage();
  const impersonating = Boolean((await getSessionContext())?.impersonatedBy);
  const { program: programParam, date: dateParam } = await searchParams;
  const t = await getTranslations("today");
  const locale = await getLocale();

  const enrollments = await listAthletePrograms(prisma, athlete.id);
  // An inbox link to a program one left or was removed from explains itself instead of showing another program.
  if (programParam && !enrollments.some((e) => e.programId === programParam)) {
    const status = await getEnrollmentStatus(prisma, athlete.id, programParam);
    if (status === "left" || status === "removed") {
      return <NotInProgram />;
    }
  }

  if (enrollments.length === 0) return <div className="pt-8"><EmptyState>{t("noPrograms")}</EmptyState></div>;

  const programId = enrollments.some((e) => e.programId === programParam) ? programParam as string : enrollments[0].programId;
  const today = todayIn(athlete.timezone);
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const monday = mondayOf(date);
  const [day, withBlocks] = await Promise.all([
    orNotFound(getAthleteDay(prisma, athlete.id, programId, date, today)),
    getVisibleDays(prisma, athlete.id, programId, monday, addDays(monday, 6)),
  ]);
  const movements = day.blocks.flatMap((b) => (b.movement ? [b.movement] : []));
  const [dayResults, oneRms] = await Promise.all([
    getDayResults(prisma, athlete.id, programId, day.blocks.map((b) => b.id)),
    oneRmMap(prisma, athlete.id, movements),
  ]);

  return (
    <>
      <AthleteHeader programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={programId} basePath="/">
        <WeekStrip programId={programId} selected={date} today={today} withBlocks={withBlocks} locale={locale}
          labels={{ prev: t("prevWeek"), next: t("nextWeek") }} />
      </AthleteHeader>
      <section className="flex flex-col gap-4">
        {!impersonating && <EnablePushCard />}
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p className="inline-block text-sm font-medium text-muted first-letter:uppercase">
            {formatDay(date, locale, { weekday: "long", day: "numeric", month: "long" })}
            {day.timeline.kind === "closed" && day.dayIndex !== null &&
              ` · ${t("dayOfProgram", { week: weekIndexOf(day.dayIndex) + 1, day: (day.dayIndex % 7) + 1 })}`}
          </p>
          {date !== today && <Button href={`/?program=${programId}`} variant="ghost" size="sm">{t("today")}</Button>}
        </div>
        {day.program.coachId === null && (
          <p data-color="neutral" className="rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">{t("noNewSessions")}</p>
        )}
        {day.status === "before_start" && <EmptyState>{t("startsOn", { date: formatDay(day.timeline.startDate, locale) })}</EmptyState>}
        {day.status === "finished" && <EmptyState>{t("finished")}</EmptyState>}
        {(day.status === "unpublished" || (day.status === "ok" && day.blocks.length === 0)) && <EmptyState>{t("nothing")}</EmptyState>}
        {day.blocks.map((b) => {
          const mine = dayResults.mine.get(b.id);
          const scored = b.kind === "barbell" || (b.scoring !== null && b.scoring !== "none");
          const board = hasLeaderboard(b, day.program);
          return (
            <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} oneRm={b.movement ? oneRms.get(b.movement) ?? null : null}>
              {b.kind === "barbell" && b.movement && !oneRms.has(b.movement) && (b.sets as BarbellSet[] | null)?.some((s) => s.percent !== null) && (
                <Link href={`/prs/${encodeURIComponent(b.movement)}`} className="text-xs text-muted underline">{t("addOneRm", { movement: b.movement })}</Link>
              )}
              {mine && <p className="text-sm font-semibold">{t("myResult", { score: formatScore(scoreTarget(b), mine.score) })}</p>}
              {(scored && day.loggable) || board ? (
                <div className="flex gap-2">
                  {scored && day.loggable && (
                    <Button href={`/blocks/${b.id}/log`} variant="tinted" size="sm" block>
                      {mine ? t("editResult") : t("logResult")}
                    </Button>
                  )}
                  {board && (
                    <Button href={`/blocks/${b.id}/leaderboard`} variant="tinted" size="sm" block>
                      {t("scores", { count: dayResults.counts.get(b.id) ?? 0 })}
                    </Button>
                  )}
                </div>
              ) : null}
            </BlockCard>
          );
        })}
      </section>
    </>
  );
}
