import { normalizeMovementName, type MovementResolver } from "@/lib/domain/resolve";
import type { PipelineResult } from "@/lib/engine/types";

// The queue that grows the catalog: movement names the engine met but could not resolve.
// Only the name is stored, never the workout text (programming may be private or paid).

export type UnrecognizedStatus = "pending" | "resolved" | "ignored";

export interface UnrecognizedEntry {
  key: string; // normalizeMovementName(example)
  example: string; // as written, truncated
}

export interface UnrecognizedStore {
  record(entries: UnrecognizedEntry[]): Promise<void>;
}

const MAX_EXAMPLE = 80;

/** Each unresolved movement name of the original and the tailored session, once per normalized key. */
export function collectUnrecognized(result: PipelineResult): UnrecognizedEntry[] {
  const byKey = new Map<string, UnrecognizedEntry>();
  for (const c of [...result.original.blocks, ...result.tailored.blocks].flatMap((b) => b.components)) {
    if (c.canonical) continue;
    const example = c.movement.trim().slice(0, MAX_EXAMPLE);
    const key = normalizeMovementName(example);
    if (key && !byKey.has(key)) byKey.set(key, { key, example });
  }
  return [...byKey.values()];
}

/** Records the result's unrecognized names; a store failure is logged, never surfaced to the athlete. */
export async function recordUnrecognized(store: UnrecognizedStore, result: PipelineResult): Promise<void> {
  const entries = collectUnrecognized(result);
  if (entries.length === 0) return;
  try {
    await store.record(entries);
  } catch (e) {
    console.error("recording unrecognized movements failed", e);
  }
}

/** Queue entries the current library resolves (a new row or alias was added since they were seen). */
export function newlyResolved(
  entries: UnrecognizedEntry[], resolve: MovementResolver,
): { key: string; resolvedTo: string }[] {
  return entries.flatMap((e) => {
    const m = resolve(e.example);
    return m ? [{ key: e.key, resolvedTo: m.name }] : [];
  });
}
