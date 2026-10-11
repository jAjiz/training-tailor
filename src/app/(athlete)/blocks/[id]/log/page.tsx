import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { logDraftFor } from "@/lib/training/log-draft";
import type { BarbellSet } from "@/lib/training/schemas";
import { scoreTarget } from "@/lib/training/scoring";
import { oneRmMap } from "@/lib/training/services/prs";
import { getMyResult, getVisibleBlock } from "@/lib/training/services/results";
import { LogForm } from "./LogForm";

export default async function LogPage({ params }: { params: Promise<{ id: string }> }) {
  const athlete = await requireAthletePage();
  const { id } = await params;
  const { block, date, loggable } = await orNotFound(getVisibleBlock(prisma, athlete, id));
  const [t, tc] = await Promise.all([getTranslations("log"), getTranslations("common")]);
  const backHref = `/?program=${block.programId}&date=${date}`;
  const back = <IconButton href={backHref} label={tc("back")}><ChevronLeft size={20} aria-hidden /></IconButton>;
  if (!loggable) {
    return (
      <section className="flex flex-col gap-4 pt-4">
        <div>{back}</div>
        <EmptyState>{t("notLoggable")}</EmptyState>
      </section>
    );
  }
  const [mine, oneRms] = await Promise.all([
    getMyResult(prisma, athlete.id, block.id),
    block.movement ? oneRmMap(prisma, athlete.id, [block.movement]) : Promise.resolve(new Map<string, number>()),
  ]);
  const target = scoreTarget(block);
  const prescribed = (block.sets as BarbellSet[] | null) ?? [];
  return (
    <section className="flex flex-col gap-5 pt-4">
      <div>{back}</div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{mine ? t("editTitle") : t("title")}</h1>
        <p className="text-[15px] text-muted">{block.title ?? block.movement}</p>
      </div>
      <LogForm
        blockId={block.id}
        target={target}
        date={date}
        backHref={backHref}
        initial={logDraftFor(target, mine?.score ?? null, prescribed, block.movement ? oneRms.get(block.movement) ?? null : null)}
        initialDivision={mine?.division === "scaled" ? "scaled" : "rx"}
        initialNotes={mine?.notes ?? ""}
        hasResult={mine !== null}
      />
    </section>
  );
}
