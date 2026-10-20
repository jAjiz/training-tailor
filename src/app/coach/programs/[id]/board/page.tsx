import { getLocale } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { listBoard } from "@/lib/training/services/announcements";
import { ProgramHeader } from "../ProgramHeader";
import { BoardEditor } from "./BoardEditor";

export default async function CoachBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const { program, announcements, writable } = await orNotFound(listBoard(prisma, { coachId: coach.id }, id));
  const fmt = new Intl.DateTimeFormat(await getLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });
  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader programId={program.id} name={program.name} />
      <BoardEditor programId={program.id} writable={writable}
        items={announcements.map((a) => ({ id: a.id, body: a.body, when: fmt.format(a.createdAt), edited: a.editedAt !== null }))} />
    </section>
  );
}
