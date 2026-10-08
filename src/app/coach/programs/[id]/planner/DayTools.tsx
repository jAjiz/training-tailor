"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { duplicateDayAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyForm } from "./CopyForm";
import type { PlannerContext } from "./types";

export function DayTools({ dayIndex, ctx }: { dayIndex: number; ctx: PlannerContext }) {
  const t = useTranslations("planner");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <button onClick={() => setAdding(true)} className="rounded border border-dashed py-2 text-sm">{t("addBlock")}</button>
      <CopyForm label={t("duplicateDay")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
        onCopy={(week, day) => duplicateDayAction({ programId: ctx.programId, fromDay: dayIndex, toDay: week * 7 + (day ?? 0) })}
        onDone={() => router.refresh()} />
      {adding && <BlockEditor mode="create" programId={ctx.programId} dayIndex={dayIndex} lifts={ctx.lifts} onClose={() => setAdding(false)} />}
    </div>
  );
}
