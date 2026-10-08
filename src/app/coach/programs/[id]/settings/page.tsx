import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { fromDbDate } from "@/lib/training/dates";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import { ProgramSettingsForm } from "./ProgramSettingsForm";

export default async function ProgramSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const t = await getTranslations("programs");
  const locked = program.kind === "continuous" && (await publishedWeeks(prisma, program.id)).size > 0;
  return (
    <section className="flex flex-col gap-6">
      <Link href={`/coach/programs/${program.id}`} className="text-sm underline">{t("planner")}</Link>
      <h1 className="text-2xl font-semibold">{program.name} · {t("settings")}</h1>
      <ProgramSettingsForm
        programId={program.id}
        kind={program.kind as "continuous" | "closed"}
        initial={{
          name: program.name,
          description: program.description ?? "",
          startDate: program.startDate ? fromDbDate(program.startDate) : null,
          weeks: program.weeks,
        }}
        startDateLocked={locked}
        archived={program.archivedAt !== null}
      />
    </section>
  );
}
