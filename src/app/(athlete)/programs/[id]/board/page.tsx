import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AnnouncementText } from "@/components/notifications/AnnouncementText";
import { NotInProgram } from "@/components/training/NotInProgram";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAthletePage } from "@/lib/accounts";
import { orBlocked } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { listBoard } from "@/lib/training/services/announcements";
import { getEnrollmentStatus, listAthletePrograms } from "@/lib/training/services/enrollments";
import { markProgramAnnouncementsRead } from "@/lib/training/services/notifications";
import { AthleteHeader, programOptions } from "../../../AthleteHeader";
import { BlockedScreen } from "../../../BlockedScreen";

// The page opens with the black AthleteHeader: the browser bar matches it in both themes.
export const viewport: Viewport = { themeColor: "#0f172a" };

export default async function AthleteBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const athlete = await requireAthletePage();
  const { id } = await params;
  const t = await getTranslations("board");
  const status = await getEnrollmentStatus(prisma, athlete.id, id);
  // An inbox link to a program one left or was removed from explains itself instead of showing a 404.
  if (status === "left" || status === "removed") {
    return <NotInProgram />;
  }
  const [board, enrollments] = await Promise.all([
    orBlocked(listBoard(prisma, { athleteId: athlete.id }, id)),
    listAthletePrograms(prisma, athlete.id),
  ]);
  if (!board) {
    const enrollment = enrollments.find((e) => e.programId === id);
    if (!enrollment) notFound();
    return (
      <>
        <AthleteHeader programs={programOptions(enrollments)} selected={id} page="board" />
        <BlockedScreen program={enrollment.program} />
      </>
    );
  }
  const { program, announcements } = board;
  const session = await getSessionContext();
  // During an impersonation nothing is marked read: the user still sees it unread.
  if (!session?.impersonatedBy) await markProgramAnnouncementsRead(prisma, athlete.userId, program.id);
  const fmt = new Intl.DateTimeFormat(await getLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: athlete.timezone });
  return (
    <>
      <AthleteHeader programs={programOptions(enrollments)} selected={program.id} page="board" />
      <section className="flex flex-col gap-4">
        {announcements.length === 0 ? <EmptyState>{t("athleteEmpty")}</EmptyState> : (
          <ul className="flex flex-col gap-3">
            {announcements.map((a) => (
              <li key={a.id}>
                <Card className="flex flex-col gap-2 p-5">
                  <p className="text-xs text-muted">{fmt.format(a.createdAt)}{a.editedAt && ` · ${t("edited")}`}</p>
                  <AnnouncementText body={a.body} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
