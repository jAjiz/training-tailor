import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { fromDbDate } from "@/lib/training/dates";
import { listRoster } from "@/lib/training/services/enrollments";
import { getOwnedProgram } from "@/lib/training/services/programs";
import { ProgramHeader } from "../ProgramHeader";
import { InviteLink } from "./InviteLink";
import { RosterRow } from "./RosterRow";

const th = "px-4 py-3";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const roster = await listRoster(prisma, coach.id, program.id);
  const t = await getTranslations();
  const locale = await getLocale();
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader programId={program.id} name={program.name} />
      <InviteLink programId={program.id} url={`${base}/join/${program.inviteCode}`} readOnly={program.archivedAt !== null} />
      {program.kind === "closed" && !program.publishedAt && (
        <p data-color="yellow" className="rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">{t("roster.notPublishedHint")}</p>
      )}
      {roster.length === 0 ? <EmptyState>{t("roster.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className={th}>{t("roster.athlete")}</th>
                <th scope="col" className={th}>{t("roster.since")}</th>
                <th scope="col" className={th}>{t("roster.status")}</th>
                <th scope="col" className={th}><span className="sr-only">{t("roster.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((e) => (
                <RosterRow key={e.id} enrollmentId={e.id} name={e.athlete.displayName}
                  joined={formatDay(fromDbDate(e.joinedAt), locale, { day: "numeric", month: "short", year: "numeric" })}
                  removed={e.removedAt !== null} resultsHref={`/coach/programs/${program.id}/athletes/${e.athleteId}`} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
