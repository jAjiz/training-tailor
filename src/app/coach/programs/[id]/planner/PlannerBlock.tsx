"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BlockCard } from "@/components/training/BlockCard";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { deleteBlockAction, duplicateBlockAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyForm } from "./CopyForm";
import type { PlannerBlockData, PlannerContext } from "./types";

export function PlannerBlock({ block, ctx }: { block: PlannerBlockData; ctx: PlannerContext }) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: ctx.readOnly });

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  function remove() {
    const message = block.resultCount > 0
      ? t("planner.deleteConfirmResults", { count: block.resultCount })
      : t("planner.deleteConfirm");
    if (window.confirm(message)) run(deleteBlockAction(block.id));
  }

  return (
    <>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 opacity-60" : ""}>
      <BlockCard block={block}>
        {block.resultCount > 0 && <p className="text-xs text-neutral-500">{t("planner.results", { count: block.resultCount })}</p>}
        {!ctx.readOnly && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs">
            <button type="button" {...attributes} {...listeners} aria-label={t("planner.dragHandle")} className="cursor-grab touch-none px-1 text-neutral-500">⠿</button>
            <button onClick={() => setEditing(true)} className="underline">{t("common.edit")}</button>
            <CopyForm label={t("planner.duplicate")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
              onCopy={(week, day) => duplicateBlockAction({ blockId: block.id, targetDayIndex: week * 7 + (day ?? 0) })}
              onDone={() => router.refresh()} />
            <button onClick={remove} className="text-red-700 underline">{t("common.delete")}</button>
          </div>
        )}
        {error && <p className="text-xs text-red-700">{t(`errors.${error}`)}</p>}
      </BlockCard>
      </div>
      {/* Outside the sortable node: a transformed ancestor would break the modal's fixed positioning. */}
      {editing && <BlockEditor mode="edit" block={block} lifts={ctx.lifts} onClose={() => setEditing(false)} />}
    </>
  );
}
