import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDay } from "@/lib/format";
import { liftCatalog } from "@/lib/training/barbell";
import { addDays, daysBetween, fromDbDate, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { listWeekBlocks } from "@/lib/training/services/blocks";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import { ProgramHeader } from "./ProgramHeader";
import type { PlannerBlockData, PlannerContext } from "./planner/types";
import { WeekBoard } from "./planner/WeekBoard";
import { WeekTools } from "./planner/WeekTools";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> };

/** A week arrow: a link, or a disabled button at the ends of the program. */
function WeekArrow({ to, label, children }: { to: number | null; label: string; children: React.ReactNode }) {
  return to === null
    ? <IconButton label={label} disabled>{children}</IconButton>
    : <IconButton label={label} href={`?week=${to}`}>{children}</IconButton>;
}

export default async function PlannerPage({ params, searchParams }: Params) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const { week } = await searchParams;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const t = await getTranslations();
  const locale = await getLocale();

  const continuous = program.kind === "continuous";
  const startDate = continuous ? fromDbDate(program.startDate as Date) : null;
  const maxWeek = continuous ? null : (program.weeks as number) - 1;
  const clamp = (w: number) => Math.max(0, maxWeek === null ? w : Math.min(w, maxWeek));
  const requested = Number.parseInt(week ?? "", 10);
  const weekIndex = clamp(Number.isInteger(requested)
    ? requested
    : startDate ? weekIndexOf(daysBetween(startDate, todayIn("UTC"))) : 0);

  const [blocks, weeks, domain] = await Promise.all([
    listWeekBlocks(prisma, program.id, weekIndex),
    publishedWeeks(prisma, program.id),
    getDomainData(),
  ]);
  const ctx: PlannerContext = {
    programId: program.id, lifts: liftCatalog(domain.movements), readOnly: program.archivedAt !== null, maxWeek, weekIndex,
  };
  const toData = (b: (typeof blocks)[number]): PlannerBlockData => ({
    id: b.id, dayIndex: b.dayIndex, position: b.position, kind: b.kind as PlannerBlockData["kind"], title: b.title,
    color: b.color, coachingTips: b.coachingTips, videoUrl: b.videoUrl, description: b.description, scoring: b.scoring,
    timeCapSeconds: b.timeCapSeconds, movement: b.movement, sets: b.sets as BarbellSet[] | null,
    instructions: b.instructions, resultCount: b._count.results,
  });
  const dayLabel = (dayIndex: number) => startDate
    ? formatDay(addDays(startDate, dayIndex), locale)
    : t("planner.dayLabel", { week: weekIndexOf(dayIndex) + 1, day: (dayIndex % 7) + 1 });
  const published = continuous ? weeks.has(weekIndex) : program.publishedAt !== null;

  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader programId={program.id} name={program.name} />
      {ctx.readOnly && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t("planner.archivedNotice")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <WeekArrow to={weekIndex > 0 ? weekIndex - 1 : null} label={t("planner.prevWeek")}><ChevronLeft size={20} aria-hidden /></WeekArrow>
          <h2 className="min-w-28 text-center text-lg font-bold">{t("planner.week", { week: weekIndex + 1 })}</h2>
          <WeekArrow to={maxWeek === null || weekIndex < maxWeek ? weekIndex + 1 : null} label={t("planner.nextWeek")}><ChevronRight size={20} aria-hidden /></WeekArrow>
        </div>
        <WeekTools ctx={ctx} kind={program.kind as "continuous" | "closed"} published={published} />
      </div>
      <WeekBoard
        days={Array.from({ length: 7 }, (_, d) => weekIndex * 7 + d).map((dayIndex) => ({ dayIndex, label: dayLabel(dayIndex) }))}
        blocks={blocks.map(toData)}
        ctx={ctx}
      />
    </section>
  );
}
