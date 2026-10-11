import Link from "next/link";
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
import { listAthleteResults } from "@/lib/training/services/results";

const th = "px-4 py-3";
const td = "px-4 py-3";

export default async function AthleteResultsPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const coach = await requireCoachPage();
  const { id, aid } = await params;
  const { athlete, results } = await orNotFound(listAthleteResults(prisma, coach.id, id, aid));
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" href={`/coach/programs/${id}/athletes`}>
          <ChevronLeft size={16} aria-hidden />{t("roster.title")}
        </Button>
      </div>
      <h1 className="text-3xl font-bold">{athlete.displayName} · {t("coachResults.title")}</h1>
      {results.length === 0 ? <EmptyState>{t("coachResults.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"><tr>
              <th scope="col" className={th}>{t("coachResults.date")}</th>
              <th scope="col" className={th}>{t("coachResults.block")}</th>
              <th scope="col" className={th}>{t("coachResults.score")}</th>
              <th scope="col" className={th}>{t("coachResults.division")}</th>
              <th scope="col" className={th}>{t("coachResults.notes")}</th>
            </tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className={`${td} tabular-nums`}>{formatDay(r.performedOn, locale, { day: "numeric", month: "short" })}</td>
                  <td className={td}><Link href={`/coach/blocks/${r.blockId}/results`} className="font-medium underline">{r.blockTitle}</Link></td>
                  <td className={`${td} tabular-nums`}>{r.formatted}</td>
                  <td className={td}><Pill>{t(`log.${r.division as "rx" | "scaled"}`)}</Pill></td>
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
