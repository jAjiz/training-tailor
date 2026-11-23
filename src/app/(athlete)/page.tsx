import type { Viewport } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BlockCard } from "@/components/training/BlockCard";
import { NotInProgram } from "@/components/training/NotInProgram";
import { EnablePushCard } from "@/components/notifications/EnablePushCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAthletePage } from "@/lib/accounts";
import { orBlocked } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { getSessionContext } from "@/lib/session";
import { formatDay, formatDayRange } from "@/lib/format";
import { hasLeaderboard } from "@/lib/training/access";
import { workoutHash } from "@/lib/training/block-engine";
import { addDays, dateOfDay, isIsoDate, mondayOf, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { oneRmToAdd } from "@/lib/training/records";
import { formatScore, scoreTarget } from "@/lib/training/scoring";
import { listAdaptations } from "@/lib/training/services/adaptations";
import { getAthleteDay, getAthleteWeekNote, getVisibleDays } from "@/lib/training/services/athlete-view";
import { getEnrollmentStatus, listAthletePrograms } from "@/lib/training/services/enrollments";
import { oneRmMap } from "@/lib/training/services/prs";
import { getDayResults } from "@/lib/training/services/results";
import { isAdaptableDay, tailoringOn } from "@/lib/training/services/tailoring";
import { AnnouncementText } from "@/components/notifications/AnnouncementText";
import { AthleteHeader, programOptions } from "./AthleteHeader";
import { BlockedScreen } from "./BlockedScreen";
import { WeekNoteButton } from "./WeekNoteButton";
import { WeekStrip } from "./WeekStrip";

// The page opens with the navy AthleteHeader: the browser bar matches it in both themes.
export const viewport: Viewport = { themeColor: "#0f172a" };

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

  const enrollment = enrollments.find((e) => e.programId === programParam) ?? enrollments[0];
  const programId = enrollment.programId;
  const today = todayIn(athlete.timezone);
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const monday = mondayOf(date);
  const loaded = await orBlocked(Promise.all([
    getAthleteDay(prisma, athlete.id, programId, date, today),
    getVisibleDays(prisma, athlete.id, programId, monday, addDays(monday, 6)),
  ]));
  if (!loaded) {
    return (
      <>
        <AthleteHeader programs={programOptions(enrollments)} selected={programId} page="today" />
        <BlockedScreen program={enrollment.program} />
      </>
    );
  }
  const [day, withBlocks] = loaded;
  const movements = day.blocks.flatMap((b) => (b.movement ? [b.movement] : []));
  // The selected day decides the week: in a closed program the strip can span two program weeks.
  let weekNote: { body: string; title: string } | null = null;
  if (day.status === "ok" && day.dayIndex !== null) {
    const body = await getAthleteWeekNote(prisma, athlete.id, programId, day.dayIndex);
    // Continuous weeks count from the program's start, so they are named by their dates, as in the planner.
    const week = weekIndexOf(day.dayIndex);
    const title = day.timeline.kind === "continuous"
      ? formatDayRange(dateOfDay(day.timeline, week * 7), dateOfDay(day.timeline, week * 7 + 6), locale)
      : t("weekNotesTitle", { week: week + 1 });
    if (body) weekNote = { body, title };
  }
  const blockIds = day.blocks.map((b) => b.id);
  const [dayResults, oneRms, adaptations, { records: catalog }] = await Promise.all([
    getDayResults(prisma, athlete.id, programId, blockIds),
    oneRmMap(prisma, athlete.id, movements),
    listAdaptations(prisma, athlete.id, blockIds),
    getDomainData(),
  ]);
  // An impersonation session never runs the engine: it sees accepted adaptations but cannot adapt.
  const adaptable = !impersonating && tailoringOn(day.program) && isAdaptableDay(date, today);

  return (
    <>
      <AthleteHeader programs={programOptions(enrollments)} selected={programId} page="today"
        start={weekNote !== null ? <WeekNoteButton note={weekNote.body} title={weekNote.title} /> : undefined}>
        <WeekStrip programId={programId} selected={date} today={today} withBlocks={withBlocks} locale={locale}
          labels={{ prev: t("prevWeek"), next: t("nextWeek") }} />
      </AthleteHeader>
      <section className="flex flex-col gap-4">
        {!impersonating && <EnablePushCard />}
        {day.program.coachId === null && (
          <p data-color="neutral" className="rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">{t("noNewSessions")}</p>
        )}
        {day.note && (
          <div data-color="neutral" className="rounded-xl bg-(--block-fill) px-4 py-3 text-(--block-ink)">
            <p className="type-label mb-1 opacity-70">{t("dayGoal")}</p>
            <AnnouncementText body={day.note} />
          </div>
        )}
        {day.status === "before_start" && <EmptyState>{t("startsOn", { date: formatDay(day.timeline.startDate, locale) })}</EmptyState>}
        {day.status === "finished" && <EmptyState>{t("finished")}</EmptyState>}
        {(day.status === "unpublished" || (day.status === "ok" && day.blocks.length === 0 && !day.note)) && <EmptyState>{t("nothing")}</EmptyState>}
        {day.blocks.map((b) => {
          const mine = dayResults.mine.get(b.id);
          const scored = b.kind === "barbell" || (b.scoring !== null && b.scoring !== "none");
          const board = hasLeaderboard(b, day.program);
          const adaptation = adaptations.get(b.id);
          const accepted = adaptation?.accepted ?? null;
          const missing = oneRmToAdd(b, catalog, (m) => oneRms.has(m));
          return (
            <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} oneRm={b.movement ? oneRms.get(b.movement) ?? null : null}
              summary={mine ? formatScore(scoreTarget(b), mine.score, locale) : null}
              adaptation={{
                blockId: b.id, adaptable, accepted: accepted?.tailored ?? null,
                stale: accepted !== null && accepted.workoutHash !== workoutHash(b),
                resultAdapted: mine !== undefined && mine.adaptation !== null, messages: adaptation?.messages ?? [],
              }}>
              {missing && (
                <Link href={`/prs/${encodeURIComponent(missing)}`} className="text-xs text-muted underline">{t("addOneRm", { movement: missing })}</Link>
              )}
              {(scored && day.loggable) || board ? (
                <div className="flex gap-2">
                  {scored && day.loggable && (
                    <Button href={`/blocks/${b.id}/log`} variant="tinted" size="sm" block slanted>
                      {mine ? t("editResult") : t("logResult")}
                    </Button>
                  )}
                  {board && (
                    <Button href={`/blocks/${b.id}/leaderboard`} variant="tinted" size="sm" block slanted>
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
