"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { applyMove, dayDropId, locate, resolveDrop, type Board } from "@/lib/training/board";
import type { ErrorCode } from "@/lib/training/errors";
import { moveBlockAction } from "../../../block-actions";
import { DayTools } from "./DayTools";
import { PlannerBlock } from "./PlannerBlock";
import type { PlannerBlockData, PlannerContext } from "./types";

type Day = { dayIndex: number; label: string };

function boardOf(days: Day[], blocks: PlannerBlockData[]): Board {
  return Object.fromEntries(days.map((d) => [
    d.dayIndex,
    blocks.filter((b) => b.dayIndex === d.dayIndex).sort((a, b) => a.position - b.position).map((b) => b.id),
  ]));
}

function DayColumn({ day, ids, byId, ctx }: { day: Day; ids: string[]; byId: Map<string, PlannerBlockData>; ctx: PlannerContext }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day.dayIndex), disabled: ctx.readOnly });
  return (
    <div ref={setNodeRef} className={`flex min-h-24 min-w-0 flex-col gap-2 rounded p-1 ${isOver ? "bg-neutral-100" : ""}`}>
      <h2 className="text-sm font-medium capitalize">{day.label}</h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => <PlannerBlock key={id} block={byId.get(id) as PlannerBlockData} ctx={ctx} />)}
      </SortableContext>
      <DayTools dayIndex={day.dayIndex} ctx={ctx} />
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
    <DndContext id={`planner-${ctx.programId}`} sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      {error && <p className="text-sm text-red-700">{te(error)}</p>}
      <div className="grid grid-cols-7 gap-3">
        {days.map((d) => <DayColumn key={d.dayIndex} day={d} ids={board[d.dayIndex] ?? []} byId={byId} ctx={ctx} />)}
      </div>
    </DndContext>
  );
}
