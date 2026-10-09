"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { BlockCard } from "@/components/training/BlockCard";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { deleteBlockAction, duplicateBlockAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyDialog } from "./CopyDialog";
import type { PlannerBlockData, PlannerContext } from "./types";

/**
 * A planner tile: a click opens the editor (a stretched button under the tools) and a press-and-move anywhere
 * but the "⋯" menu drags it (the sensor waits for 6px, and swallows the click that ends a drag). The handle
 * stays for the keyboard and for touch, where a press on the tile scrolls the board instead.
 */
export function PlannerBlock({ block, ctx }: { block: PlannerBlockData; ctx: PlannerContext }) {
  const t = useTranslations();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "duplicate" | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: ctx.readOnly });
  const heading = block.title ?? block.movement ?? t(`editor.kinds.${block.kind}`);

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

  // Pointer drags start from the whole tile; the menu (and its portaled popup, whose React events bubble
  // here) is excluded so a press on it never turns into a drag.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as Element;
    if (!e.currentTarget.contains(target) || target.closest("[data-no-drag]")) return;
    listeners?.onPointerDown?.(e);
  }

  return (
    <>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
        onPointerDown={ctx.readOnly ? undefined : onPointerDown}
        className={cx("group relative", !ctx.readOnly && "cursor-grab", isDragging && "z-10 cursor-grabbing opacity-60")}>
        <BlockCard block={block} compact>
          {block.resultCount > 0 && <p className="text-xs text-muted">{t("planner.results", { count: block.resultCount })}</p>}
          {error && <p role="alert" className="text-xs text-danger">{t(`errors.${error}`)}</p>}
        </BlockCard>
        {!ctx.readOnly && (
          <>
            <button type="button" onClick={() => setDialog("edit")} aria-label={`${t("common.edit")}: ${heading}`}
              className="absolute inset-0 cursor-[inherit] rounded-xl focus-visible:outline-2 focus-visible:outline-foreground" />
            <div className="absolute right-1 top-1 flex items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <IconButton ref={setActivatorNodeRef} label={t("planner.dragHandle")} className="cursor-[inherit] touch-none" {...attributes}
                onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler | undefined}>
                <GripVertical size={16} aria-hidden />
              </IconButton>
              <div data-no-drag className="cursor-auto">
                <Menu label={t("planner.blockActions")} items={[
                  { label: t("planner.duplicate"), onSelect: () => setDialog("duplicate") },
                  { label: t("common.delete"), onSelect: remove, danger: true },
                ]} />
              </div>
            </div>
          </>
        )}
      </div>
      {/* Outside the sortable node: Modal portals anyway, but the editor state belongs to this block. */}
      {dialog === "edit" && <BlockEditor mode="edit" block={block} lifts={ctx.lifts} onClose={() => setDialog(null)} />}
      {dialog === "duplicate" && (
        <CopyDialog title={t("planner.duplicate")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
          onCopy={(week, day) => duplicateBlockAction({ blockId: block.id, targetDayIndex: week * 7 + (day ?? 0) })}
          onClose={() => setDialog(null)} onDone={() => router.refresh()} />
      )}
    </>
  );
}
