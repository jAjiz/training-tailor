"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cx } from "@/components/ui/cx";
import { applyMove, dayDropId, isDayDropId, locate, resolveDrop, type Board } from "@/lib/training/board";
import type { ErrorCode } from "@/lib/training/errors";
import { moveBlockAction } from "../../../block-actions";
import { AddBlock, DayMenu } from "./DayTools";
import { PlannerBlock } from "./PlannerBlock";
import type { PlannerBlockData, PlannerContext } from "./types";

type Day = { dayIndex: number; label: string };

/**
 * What is under the pointer wins (a block before its day column); the keyboard has no pointer and falls back
 * to the closest corners. Plain closestCorners misses empty days: their columns stretch to the grid's height.
 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  const blocks = hits.filter((c) => !isDayDropId(String(c.id)));
  return blocks.length > 0 ? blocks : hits;
};

function boardOf(days: Day[], blocks: PlannerBlockData[]): Board {
  return Object.fromEntries(days.map((d) => [
    d.dayIndex,
    blocks.filter((b) => b.dayIndex === d.dayIndex).sort((a, b) => a.position - b.position).map((b) => b.id),
  ]));
}

function DayColumn({ day, ids, byId, ctx }: { day: Day; ids: string[]; byId: Map<string, PlannerBlockData>; ctx: PlannerContext }) {
  const t = useTranslations("planner");
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day.dayIndex), disabled: ctx.readOnly });
  return (
    <div ref={setNodeRef} className={cx("flex min-h-40 min-w-0 flex-col gap-2 rounded-2xl p-1.5 transition-colors", isOver && "bg-surface-2")}>
      <div className="flex min-h-9 items-center gap-2 pl-1.5">
        <h2 className="inline-block truncate text-sm font-bold first-letter:uppercase">{day.label}</h2>
        <span className="rounded-full bg-surface-2 px-2 text-xs font-semibold text-muted">
          <span aria-hidden>{ids.length}</span>
          <span className="sr-only">{t("blockCount", { count: ids.length })}</span>
        </span>
        <DayMenu dayIndex={day.dayIndex} ctx={ctx} />
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => <PlannerBlock key={id} block={byId.get(id) as PlannerBlockData} ctx={ctx} />)}
      </SortableContext>
      <AddBlock dayIndex={day.dayIndex} ctx={ctx} />
    </div>
  );
}

export function WeekBoard({ days, blocks, ctx }: { days: Day[]; blocks: PlannerBlockData[]; ctx: PlannerContext }) {
  const te = useTranslations("errors");
  const router = useRouter();
  const [source, setSource] = useState(blocks);
  const [board, setBoard] = useState(() => boardOf(days, blocks));
  const [error, setError] = useState<ErrorCode | null>(null);
  // New server data (after router.refresh) replaces the optimistic board.
  if (source !== blocks) {
    setSource(blocks);
    setBoard(boardOf(days, blocks));
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(blocks.map((b) => [b.id, b]));

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const from = locate(board, activeId);
    const to = resolveDrop(board, activeId, String(over.id));
    if (!from || !to || (from.day === to.day && from.index === to.index)) return;
    const previous = board;
    setBoard(applyMove(board, activeId, to));
    const r = await moveBlockAction({ blockId: activeId, toDayIndex: to.day, toPosition: to.index });
    if (r.ok) {
      setError(null);
      router.refresh();
    } else {
      setBoard(previous);
      setError(r.code);
    }
  }

  return (
    // A fixed id keeps dnd-kit's generated aria ids identical on the server and the client.
    <DndContext id={`planner-${ctx.programId}`} sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
      {error && <p role="alert" className="text-sm text-danger">{te(error)}</p>}
      <div className="-mx-6 overflow-x-auto px-6 pb-2">
        <div className="grid min-w-[1050px] grid-cols-7 gap-2">
          {days.map((d) => <DayColumn key={d.dayIndex} day={d} ids={board[d.dayIndex] ?? []} byId={byId} ctx={ctx} />)}
        </div>
      </div>
    </DndContext>
  );
}
