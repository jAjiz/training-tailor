/** Planner drag and drop: day columns of block ids, and where a drop lands. */
export type Board = Record<number, string[]>;
export type Slot = { day: number; index: number };

const DAY_DROP = /^day-(\d+)$/;

export const dayDropId = (dayIndex: number) => `day-${dayIndex}`;
export const isDayDropId = (id: string) => DAY_DROP.test(id);

export function locate(board: Board, id: string): Slot | null {
  for (const [day, ids] of Object.entries(board)) {
    const index = ids.indexOf(id);
    if (index !== -1) return { day: Number(day), index };
  }
  return null;
}

/** Removes the block from its day and inserts it at `to` (clamped); returns a new board. */
export function applyMove(board: Board, activeId: string, to: Slot): Board {
  const next: Board = Object.fromEntries(
    Object.entries(board).map(([day, ids]) => [day, ids.filter((id) => id !== activeId)]),
  );
  const target = [...(next[to.day] ?? [])];
  target.splice(Math.max(0, Math.min(to.index, target.length)), 0, activeId);
  next[to.day] = target;
  return next;
}

/**
 * While dragging, the block itself moves through the board so its gap shows where it will land, the same way
 * within a day and across days: before the block under the pointer, or after it when `below`; at the end of a
 * day when over the column itself. Null when nothing changes (over itself, already in place, unknown ids).
 */
export function moveOver(board: Board, activeId: string, overId: string, below: boolean): Board | null {
  const from = locate(board, activeId);
  if (!from || overId === activeId) return null;
  const match = DAY_DROP.exec(overId);
  let to: Slot;
  if (match) {
    const day = Number(match[1]);
    to = { day, index: (board[day] ?? []).filter((id) => id !== activeId).length };
  } else {
    const over = locate(board, overId);
    if (!over) return null;
    const rest = (board[over.day] ?? []).filter((id) => id !== activeId);
    to = { day: over.day, index: rest.indexOf(overId) + (below ? 1 : 0) };
  }
  if (to.day === from.day && to.index === from.index) return null;
  return applyMove(board, activeId, to);
}
