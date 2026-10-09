"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, Pencil } from "lucide-react";
import { BlockCard } from "@/components/training/BlockCard";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { deleteBlockAction, duplicateBlockAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyDialog } from "./CopyDialog";
import type { PlannerBlockData, PlannerContext } from "./types";

/**
 * A planner tile: a click opens the editor (a stretched button under the menu); pressing and moving anywhere
 * but the menu drags it (6px with a mouse, a 250ms press on touch; the click that ends a drag is swallowed).
 * Keyboard users get a handle that only shows when focused. While dragging, the tile stays as a faded
 * placeholder where it would land and WeekBoard's DragOverlay follows the pointer.
 */
export function PlannerBlock({ block, ctx }: { block: PlannerBlockData; ctx: PlannerContext }) {
  const t = useTranslations();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "duplicate" | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({ id: block.id, disabled: ctx.readOnly });
  const heading = block.title ?? block.movement ?? t(`editor.kinds.${block.kind}`);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  async function remove() {
    const message = block.resultCount > 0
      ? t("planner.deleteConfirmResults", { count: block.resultCount })
      : t("planner.deleteConfirm");
    if (await confirm({ title: t("planner.deleteBlock"), message, confirmLabel: t("common.delete") })) run(deleteBlockAction(block.id));
  }

  // Drags start from the whole tile; the menu (and its portaled popup, whose React events bubble here) is
  // excluded so a press on it never turns into a drag.
  const fromTile = (e: React.SyntheticEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    return e.currentTarget.contains(target) && !target.closest("[data-no-drag]");
  };
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { if (fromTile(e)) listeners?.onMouseDown?.(e); };
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { if (fromTile(e)) listeners?.onTouchStart?.(e); };

  return (
    <>
      {/* No transform: WeekBoard moves the block through the board while dragging (its strategy shifts nothing). */}
      <div ref={setNodeRef}
        onMouseDown={ctx.readOnly ? undefined : onMouseDown} onTouchStart={ctx.readOnly ? undefined : onTouchStart}
        className={cx("group relative select-none [-webkit-touch-callout:none]", !ctx.readOnly && "cursor-grab", isDragging && "rounded-xl opacity-50 outline-2 outline-offset-2 outline-dashed outline-foreground/50")}>
        <BlockCard block={block} compact>
          {block.resultCount > 0 && <p className="text-xs text-muted">{t("planner.results", { count: block.resultCount })}</p>}
          {error && <p role="alert" className="text-xs text-danger">{t(`errors.${error}`)}</p>}
        </BlockCard>
        {!ctx.readOnly && (
          <>
            <button type="button" onClick={() => setDialog("edit")} aria-label={`${t("common.edit")}: ${heading}`}
              className="absolute inset-0 cursor-[inherit] rounded-xl focus-visible:outline-2 focus-visible:outline-foreground" />
            {/* Keyboard moves (Space to lift, arrows, Space to drop): visible only while focused. */}
            <IconButton ref={setActivatorNodeRef} label={t("planner.dragHandle")} size="sm" {...attributes}
              onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler | undefined}
              className="pointer-events-none absolute left-1 top-1 bg-surface opacity-0 focus-visible:opacity-100">
              <GripVertical size={14} aria-hidden />
            </IconButton>
            <div data-no-drag className="absolute right-1 top-1 cursor-auto opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <Menu compact label={t("planner.blockActions")} icon={<Pencil size={14} aria-hidden />} items={[
                { label: t("common.edit"), onSelect: () => setDialog("edit") },
                { label: t("planner.duplicate"), onSelect: () => setDialog("duplicate") },
                { label: t("common.delete"), onSelect: () => void remove(), danger: true },
              ]} />
            </div>
          </>
        )}
      </div>
      {/* Outside the sortable node: Modal portals anyway, but the editor state belongs to this block. */}
      {dialog === "edit" && <BlockEditor mode="edit" block={block} lifts={ctx.lifts} onClose={() => setDialog(null)} />}
      {dialog === "duplicate" && (
        <CopyDialog title={t("planner.duplicate")} target="day" startDate={ctx.startDate} defaultIndex={block.dayIndex} maxWeek={ctx.maxWeek}
          onCopy={(targetDayIndex) => duplicateBlockAction({ blockId: block.id, targetDayIndex })}
          onClose={() => setDialog(null)} onDone={() => router.refresh()} />
      )}
      {confirmDialog}
    </>
  );
}
