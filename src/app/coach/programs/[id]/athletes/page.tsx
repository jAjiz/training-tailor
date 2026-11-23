import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { paymentsEnabled } from "@/lib/stripe/client";
import { fromDbDate } from "@/lib/training/dates";
import { listRoster } from "@/lib/training/services/enrollments";
import { cancellableSubscribers, countPendingCancellations, subscriptionEndings } from "@/lib/training/services/payments";
import { getOwnedProgram } from "@/lib/training/services/programs";
import { CancellationRetry } from "../CancellationRetry";
import { ProgramHeader } from "../ProgramHeader";
import { InviteLink } from "./InviteLink";
import { RosterRow, type RosterAccess } from "./RosterRow";

const th = "px-4 py-3";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const roster = await listRoster(prisma, coach.id, program.id);
  const active = roster.filter((e) => !e.removedAt && !e.leftAt);
  const left = roster.filter((e) => !e.removedAt && e.leftAt);
  const removedRows = roster.filter((e) => e.removedAt);
  const payments = paymentsEnabled();
  // The Access column only means something on a paid program.
  const paid = payments && program.priceAmount !== null;
  const endings = paid ? await subscriptionEndings(prisma, program.id) : new Map<string, Date>();
  const subscribers = paid ? await cancellableSubscribers(prisma, program.id) : new Set<string>();
  const pendingCancellations = payments ? await countPendingCancellations(prisma, program.id, ["coach_removed", "granted"]) : 0;
  const dateFormat = { day: "numeric", month: "short", year: "numeric" } as const;
  const t = await getTranslations();
  const locale = await getLocale();
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const accessOf = (e: (typeof roster)[number]): RosterAccess | null => {
    if (!paid || e.removedAt || e.leftAt) return null;
    const endsOn = endings.get(e.athleteId);
    return { access: e.access as RosterAccess["access"], leavingOn: endsOn ? formatDay(fromDbDate(endsOn), locale, dateFormat) : null,
      subscribed: subscribers.has(e.athleteId) };
  };
  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader name={program.name} />
      {pendingCancellations > 0 && <CancellationRetry programId={program.id} count={pendingCancellations} />}
      <InviteLink programId={program.id} url={`${base}/join/${program.inviteCode}`} readOnly={program.archivedAt !== null}
        inviteDisabled={program.inviteDisabledAt !== null} />
      {program.kind === "closed" && !program.publishedAt && (
        <p data-color="yellow" className="rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">{t("roster.notPublishedHint")}</p>
      )}
      {roster.length === 0 ? <EmptyState>{t("roster.empty")}</EmptyState> : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className={th}>{t("roster.athlete")}</th>
                <th scope="col" className={th}>{t("roster.since")}</th>
                <th scope="col" className={th}>{t("roster.status")}</th>
                {paid && <th scope="col" className={th}>{t("roster.access")}</th>}
                <th scope="col" className={th}><span className="sr-only">{t("roster.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {[...active, ...left, ...removedRows].map((e) => (
                <RosterRow key={e.id} enrollmentId={e.id} name={e.athlete.displayName}
                  joined={formatDay(fromDbDate(e.joinedAt), locale, dateFormat)}
                  leftOn={e.leftAt && !e.removedAt ? formatDay(fromDbDate(e.leftAt), locale, dateFormat) : null}
                  removed={e.removedAt !== null} resultsHref={`/coach/programs/${program.id}/athletes/${e.athleteId}`}
                  showAccess={paid} access={accessOf(e)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
