"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { clearDayAction, duplicateDayAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { ClearDialog } from "./ClearDialog";
import { CopyDialog } from "./CopyDialog";
import type { PlannerContext } from "./types";

type Props = { dayIndex: number; ctx: PlannerContext };
type MenuProps = Props & {
  onNote: () => void;
  /** Nothing to clear: the day has no block and no note. */
  empty: boolean;
  /** Results athletes logged on the day's blocks, which clearing deletes. */
  resultCount: number;
};

/** "⋯" on a day column's header: write the day's note, duplicate the whole day, clear it. */
export function DayMenu({ dayIndex, ctx, onNote, empty, resultCount }: MenuProps) {
  const t = useTranslations("planner");
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [clearing, setClearing] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <>
      <Menu className="ml-auto" label={t("dayActions")} items={[
        { label: t("dayNote"), onSelect: onNote },
        { label: t("duplicateDay"), onSelect: () => setCopying(true) },
        ...(empty ? [] : [{ label: t("clearDay"), onSelect: () => setClearing(true), danger: true }]),
      ]} />
      {clearing && (
        <ClearDialog title={t("clearDay")} message={t("clearDayConfirm")} resultCount={resultCount}
          onClear={() => clearDayAction({ programId: ctx.programId, dayIndex })} onClose={() => setClearing(false)} />
      )}
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
