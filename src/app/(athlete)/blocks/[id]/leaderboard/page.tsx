import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { NotInProgram } from "@/components/training/NotInProgram";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { blockLabel } from "@/lib/training/block-label";
import { getBlockEnrollmentStatus } from "@/lib/training/services/enrollments";
import { getLeaderboard } from "@/lib/training/services/results";
import { FistBumpButton } from "./FistBumpButton";

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const athlete = await requireAthletePage();
  const { id } = await params;
  // An inbox link to a block of a program one left or was removed from explains itself instead of showing a 404.
  const enrollment = await getBlockEnrollmentStatus(prisma, athlete.id, id);
  if (enrollment?.status === "left" || enrollment?.status === "removed") {
    return <NotInProgram />;
  }
  const { block, date, entries } = await orNotFound(getLeaderboard(prisma, { athlete }, id));
  const [t, tc, tl, tb] = await Promise.all([getTranslations("leaderboard"), getTranslations("common"), getTranslations("log"), getTranslations()]);
  const locale = await getLocale();
  return (
    <section className="flex flex-col gap-5 pt-4">
      <div>
        <IconButton href={`/?program=${block.programId}&date=${date}`} label={tc("back")}><ChevronLeft size={20} aria-hidden /></IconButton>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-[15px] text-muted">{blockLabel(block, tb)} · {formatDay(date, locale, { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      {entries.length === 0 && <EmptyState>{t("empty")}</EmptyState>}
      {entries.length > 0 && (
        <Card as="section" className="overflow-hidden">
          <ol className="flex flex-col divide-y">
            {entries.map((e) => (
              <li key={e.resultId} className={cx("flex items-center gap-3 px-4 py-3", e.own && "bg-foreground/5")}>
                <span className="w-6 text-right text-sm tabular-nums text-muted">{e.rank}</span>
                <Avatar name={e.displayName} image={e.avatarUrl} size={40} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-semibold">{e.own ? t("you") : e.displayName}</span>
                  <span className="flex items-center gap-2 text-sm">
                    {e.formatted}
                    <Pill tone={e.division === "rx" ? "inverted" : "neutral"}>{tl(e.division as "rx" | "scaled")}</Pill>
                  </span>
                  {e.notes && <span className="truncate text-xs text-muted">{e.notes}</span>}
                </div>
                {/* Keyed on the server values so a refresh resets the button's local state. */}
                <FistBumpButton key={`${e.resultId}:${e.bumps}:${e.bumpedByViewer}`} resultId={e.resultId} initialCount={e.bumps} initialBumped={e.bumpedByViewer} disabled={e.own} />
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}
