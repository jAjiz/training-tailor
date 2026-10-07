import type { MovementResolver } from "@/lib/domain/resolve";
import type { ComponentDraft, WorkoutComponent } from "./types";

/** Attach the canonical library name (or null) to every component; the model never sets it. */
export function resolveBlocks<B extends { components: ComponentDraft[] }>(
  blocks: B[], resolve: MovementResolver,
): Array<Omit<B, "components"> & { components: WorkoutComponent[] }> {
  return blocks.map((b) => ({
    ...b,
    components: b.components.map((c) => ({ ...c, canonical: resolve(c.movement)?.name ?? null })),
  }));
}
