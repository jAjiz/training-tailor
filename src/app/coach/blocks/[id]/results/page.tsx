import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { blockLabel } from "@/lib/training/block-label";
import { getCoachBlockResults } from "@/lib/training/services/results";

const th = "px-4 py-3";
const td = "px-4 py-3";
const thead = "bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const row = "border-t";

export default async function BlockResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const { block, entries, results } = await orNotFound(getCoachBlockResults(prisma, coach.id, id));
  const day = (iso: string) => formatDay(iso, locale, { day: "numeric", month: "short" });
  const back = (
    <div>
      <Button variant="ghost" size="sm" href={`/coach/programs/${block.programId}?week=${Math.floor(block.dayIndex / 7)}`}>
        <ChevronLeft size={16} aria-hidden />{t("programs.planner")}
      </Button>
    </div>
  );

  if (entries) {
    return (
      <section className="flex flex-col gap-6">
        {back}
        <h1 className="text-3xl font-bold">{blockLabel(block, t)} · {t("leaderboard.title")}</h1>
        {entries.length === 0 ? <EmptyState>{t("coachResults.empty")}</EmptyState> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className={thead}><tr>
                <th scope="col" className={th}>{t("coachResults.rank")}</th>
                <th scope="col" className={th}>{t("coachResults.athlete")}</th>
                <th scope="col" className={th}>{t("coachResults.score")}</th>
                <th scope="col" className={th}>{t("coachResults.division")}</th>
                <th scope="col" className={th}>{t("coachResults.bumps")}</th>
                <th scope="col" className={th}>{t("coachResults.notes")}</th>
              </tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.resultId} className={row}>
                    <td className={`${td} tabular-nums`}>{e.rank}</td>
                    <td className={`${td} font-medium`}>{e.displayName}</td>
                    <td className={`${td} tabular-nums`}>{e.formatted}</td>
                    <td className={td}><Pill>{t(`log.${e.division as "rx" | "scaled"}`)}</Pill></td>
                    <td className={`${td} tabular-nums`}>{e.bumps}</td>
                    <td className={`${td} text-muted`}>{e.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {back}
      <h1 className="text-3xl font-bold">{blockLabel(block, t)} · {t("coachResults.title")}</h1>
      {!results?.length ? <EmptyState>{t("coachResults.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className={thead}><tr>
              <th scope="col" className={th}>{t("coachResults.date")}</th>
              <th scope="col" className={th}>{t("coachResults.athlete")}</th>
              <th scope="col" className={th}>{t("coachResults.score")}</th>
              <th scope="col" className={th}>{t("coachResults.notes")}</th>
            </tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className={row}>
                  <td className={`${td} tabular-nums`}>{day(r.performedOn)}</td>
                  <td className={`${td} font-medium`}>{r.displayName}</td>
                  <td className={`${td} tabular-nums`}>{r.formatted}</td>
                  <td className={`${td} text-muted`}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
