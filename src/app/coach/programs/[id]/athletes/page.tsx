import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { fromDbDate } from "@/lib/training/dates";
import { listRoster } from "@/lib/training/services/enrollments";
import { getOwnedProgram } from "@/lib/training/services/programs";
import { InviteLink } from "./InviteLink";
import { RosterRow } from "./RosterRow";

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
      <Link href={`/coach/programs/${program.id}`} className="text-sm underline">{t("programs.planner")}</Link>
      <h1 className="text-2xl font-semibold">{program.name} · {t("roster.title")}</h1>
      <InviteLink programId={program.id} url={`${base}/join/${program.inviteCode}`} readOnly={program.archivedAt !== null} />
      {program.kind === "closed" && !program.publishedAt && <p className="text-sm text-amber-700">{t("roster.notPublishedHint")}</p>}
      {roster.length === 0 ? <p className="text-neutral-600">{t("roster.empty")}</p> : (
        <ul>
          {roster.map((e) => (
            <RosterRow key={e.id} enrollmentId={e.id} name={e.athlete.displayName}
              joined={formatDay(fromDbDate(e.joinedAt), locale, { day: "numeric", month: "short", year: "numeric" })}
              removed={e.removedAt !== null} resultsHref={`/coach/programs/${program.id}/athletes/${e.athleteId}`} />
          ))}
        </ul>
      )}
    </section>
  );
}
