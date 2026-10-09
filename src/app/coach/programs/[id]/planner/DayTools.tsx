"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { duplicateDayAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyDialog } from "./CopyDialog";
import type { PlannerContext } from "./types";

type Props = { dayIndex: number; ctx: PlannerContext };

/** "⋯" on a day column's header: duplicate the whole day. */
export function DayMenu({ dayIndex, ctx }: Props) {
  const t = useTranslations("planner");
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <>
      <Menu className="ml-auto" label={t("dayActions")} items={[{ label: t("duplicateDay"), onSelect: () => setCopying(true) }]} />
      {copying && (
        <CopyDialog title={t("duplicateDay")} target="day" startDate={ctx.startDate} defaultIndex={dayIndex + 7} maxWeek={ctx.maxWeek}
          onCopy={(toDay) => duplicateDayAction({ programId: ctx.programId, fromDay: dayIndex, toDay })}
          onClose={() => setCopying(false)} onDone={() => router.refresh()} />
      )}
    </>
  );
}

/** Dashed "Add block" button at the bottom of a day column. */
export function AddBlock({ dayIndex, ctx }: Props) {
  const t = useTranslations("planner");
  const [adding, setAdding] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <>
      <button type="button" onClick={() => setAdding(true)}
        className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-2.5 text-sm font-semibold text-muted transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground">
        <Plus size={16} aria-hidden />
        {t("addBlock")}
      </button>
      {adding && <BlockEditor mode="create" programId={ctx.programId} dayIndex={dayIndex} lifts={ctx.lifts} onClose={() => setAdding(false)} />}
    </>
  );
}
