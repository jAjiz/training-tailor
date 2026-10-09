"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor, closestCorners, pointerWithin, useDroppable,
  useSensor, useSensors, type CollisionDetection, type UniqueIdentifier, type DragEndEvent, type DragMoveEvent, type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, type SortingStrategy } from "@dnd-kit/sortable";
import { BlockCard } from "@/components/training/BlockCard";
import { cx } from "@/components/ui/cx";
import { dayDropId, isDayDropId, locate, moveOver, type Board } from "@/lib/training/board";
import type { ErrorCode } from "@/lib/training/errors";
import { moveBlockAction } from "../../../block-actions";
import { AddBlock, DayMenu } from "./DayTools";
import { PlannerBlock } from "./PlannerBlock";
import type { PlannerBlockData, PlannerContext } from "./types";

type Day = { dayIndex: number; label: string };

/** The SortableContext of a day column, named so a collision can find the column's blocks. */
const columnId = (dayIndex: number) => `col-${dayIndex}`;

/**
 * The block under the pointer wins. Over its day column but between blocks (the gaps, the header, below the
 * last one), the column's block nearest the pointer's height stands in, so the slot follows the pointer
 * instead of jumping to the end; only an empty column means "the end". Over nothing (between columns)
 * nothing moves: a "closest" guess there flips as blocks move and made the board loop.
 * The keyboard has no pointer and uses the closest corners.
 */
const collision: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return closestCorners(args);
  const hits = pointerWithin(args);
  const blocks = hits.filter((c) => !isDayDropId(String(c.id)));
  if (blocks.length > 0) return blocks;
  const day = hits.find((c) => isDayDropId(String(c.id)));
  if (!day) return [];
  const column = columnId(Number(String(day.id).slice("day-".length)));
  let nearest: { id: UniqueIdentifier; distance: number } | null = null;
  for (const container of args.droppableContainers) {
    if (container.data.current?.sortable?.containerId !== column) continue;
    const rect = args.droppableRects.get(container.id);
    if (!rect) continue;
    const distance = Math.abs(pointer.y - (rect.top + rect.height / 2));
    if (!nearest || distance < nearest.distance) nearest = { id: container.id, distance };
  }
  return nearest ? [{ id: nearest.id, data: { droppableContainer: args.droppableContainers.find((c) => c.id === nearest.id) } }] : [day];
};

/**
 * No transforms: the dragged block really moves through the board (onDragOver), so the layout itself shows the
 * gap, the same within a day and across days. Transforms computed from pre-move rects misplaced tiles.
 */
const inPlace: SortingStrategy = () => null;

/** Pointer height during a drag: where the press started plus how far it moved. Keyboard drags have none. */
function pointerY(event: DragMoveEvent): number | null {
  const start = event.activatorEvent;
  if (typeof MouseEvent !== "undefined" && start instanceof MouseEvent) return start.clientY + event.delta.y;
  if (typeof TouchEvent !== "undefined" && start instanceof TouchEvent && start.touches[0]) return start.touches[0].clientY + event.delta.y;
  return null;
}

function boardOf(days: Day[], blocks: PlannerBlockData[]): Board {
  return Object.fromEntries(days.map((d) => [
    d.dayIndex,
    blocks.filter((b) => b.dayIndex === d.dayIndex).sort((a, b) => a.position - b.position).map((b) => b.id),
  ]));
}

function DayColumn({ day, ids, byId, ctx, receiving }: {
  day: Day; ids: string[]; byId: Map<string, PlannerBlockData>; ctx: PlannerContext; receiving: boolean;
}) {
  const t = useTranslations("planner");
  const { setNodeRef } = useDroppable({ id: dayDropId(day.dayIndex), disabled: ctx.readOnly });
  return (
    <div ref={setNodeRef} className={cx("flex min-h-40 min-w-0 flex-col gap-2 rounded-2xl p-1.5 transition-colors", receiving && "bg-surface-2")}>
      <div className="flex min-h-9 items-center gap-2 pl-1.5">
        <h2 className="inline-block truncate text-sm font-bold first-letter:uppercase">{day.label}</h2>
        <span className="rounded-full bg-surface-2 px-2 text-xs font-semibold text-muted">
          <span aria-hidden>{ids.length}</span>
          <span className="sr-only">{t("blockCount", { count: ids.length })}</span>
        </span>
        <DayMenu dayIndex={day.dayIndex} ctx={ctx} />
      </div>
      <SortableContext id={columnId(day.dayIndex)} items={ids} strategy={inPlace}>
        {ids.map((id) => <PlannerBlock key={id} block={byId.get(id) as PlannerBlockData} ctx={ctx} />)}
      </SortableContext>
      {/* The column holding the dragged block hides it: on the highlighted background its dashed border vanished. */}
      {!receiving && <AddBlock dayIndex={day.dayIndex} ctx={ctx} />}
    </div>
  );
}

export function WeekBoard({ days, blocks, ctx }: { days: Day[]; blocks: PlannerBlockData[]; ctx: PlannerContext }) {
  const te = useTranslations("errors");
  const router = useRouter();
  const [source, setSource] = useState(blocks);
  const [board, setBoard] = useState(() => boardOf(days, blocks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  // The board when the drag started: where the block came from, and what to restore on cancel or failure.
  const before = useRef<Board | null>(null);
  // Set for one frame after a move: the layout shifts under the pointer, and reacting to the stale rects again
  // could bounce the block between two slots.
  const settling = useRef(false);
  // New server data (after router.refresh) replaces the optimistic board.
  if (source !== blocks) {
    setSource(blocks);
    setBoard(boardOf(days, blocks));
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press first: a plain swipe over the board keeps scrolling it.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const active = activeId ? byId.get(activeId) : undefined;

  function onDragStart({ active }: DragStartEvent) {
    before.current = board;
    settling.current = false;
    setActiveId(String(active.id));
  }

  // The block follows the pointer through the board: before the block under it, or after it past its middle.
  // Runs on every move too: crossing a block's middle changes the slot without changing what is under the pointer.
  function follow(event: DragMoveEvent | DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const dragged = active.rect.current.translated;
    const y = pointerY(event) ?? (dragged ? dragged.top + dragged.height / 2 : null);
    const below = y !== null && y > over.rect.top + over.rect.height / 2;
    if (settling.current) return;
    const next = moveOver(board, String(active.id), String(over.id), below);
    if (!next) return;
    settling.current = true;
    requestAnimationFrame(() => { settling.current = false; });
    setBoard(next);
  }

  // The board already shows where the block landed: persist it if that differs from where it started.
  async function onDragEnd({ active }: DragEndEvent) {
    const id = String(active.id);
    const start = before.current;
    before.current = null;
    setActiveId(null);
    const from = start ? locate(start, id) : null;
    const landed = locate(board, id);
    if (!start || !from || !landed || (from.day === landed.day && from.index === landed.index)) return;
    const r = await moveBlockAction({ blockId: id, toDayIndex: landed.day, toPosition: landed.index });
    if (r.ok) {
      setError(null);
      router.refresh();
    } else {
      setBoard(start);
      setError(r.code);
    }
  }

  function onDragCancel() {
    if (before.current) setBoard(before.current);
    before.current = null;
    setActiveId(null);
  }

  return (
    // A fixed id keeps dnd-kit's generated aria ids identical on the server and the client.
    // Blocks change columns mid-drag: measure drop targets continuously, or their rects stay where they were.
    <DndContext id={`planner-${ctx.programId}`} sensors={sensors} collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart} onDragMove={follow} onDragOver={follow} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      {error && <p role="alert" className="text-sm text-danger">{te(error)}</p>}
      <div className="-mx-6 overflow-x-auto px-6 pb-2 lg:-mx-8 lg:px-8">
        <div className="grid min-w-[1050px] grid-cols-7 gap-2">
          {days.map((d) => <DayColumn key={d.dayIndex} day={d} ids={board[d.dayIndex] ?? []} byId={byId} ctx={ctx}
            receiving={activeId !== null && (board[d.dayIndex] ?? []).includes(activeId)} />)}
        </div>
      </div>
      {/* The tile under the pointer: a copy at the original size, never stretched to the tiles it passes. */}
      <DragOverlay>
        {active && (
          <div className="cursor-grabbing rounded-xl shadow-2xl ring-1 ring-foreground/10">
            <BlockCard block={active} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
