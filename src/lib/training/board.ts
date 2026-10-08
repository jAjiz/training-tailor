/** Planner drag and drop: day columns of block ids, and where a drop lands. */
export type Board = Record<number, string[]>;
export type Slot = { day: number; index: number };

const DAY_DROP = /^day-(\d+)$/;

export const dayDropId = (dayIndex: number) => `day-${dayIndex}`;

export function locate(board: Board, id: string): Slot | null {
  for (const [day, ids] of Object.entries(board)) {
    const index = ids.indexOf(id);
    if (index !== -1) return { day: Number(day), index };
  }
  return null;
}

/** Dropped on a block: take its slot. Dropped on a day column: go to the end of that day. */
export function resolveDrop(board: Board, activeId: string, overId: string): Slot | null {
  if (!locate(board, activeId)) return null;
  const match = DAY_DROP.exec(overId);
  if (match) {
    const day = Number(match[1]);
    return { day, index: (board[day] ?? []).filter((id) => id !== activeId).length };
  }
  return locate(board, overId);
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
