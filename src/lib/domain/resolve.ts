import type { Movement } from "./types";

/** Case-, spacing- and punctuation-insensitive key; "&" is spelled out as "and". */
export function normalizeMovementName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export type MovementResolver = (name: string) => Movement | null;

/** exact name/alias → normalized name/alias → normalized singular (trailing "s" dropped). */
export function createMovementResolver(movements: Movement[]): MovementResolver {
  const exact = new Map<string, Movement>();
  const normalized = new Map<string, Movement>();
  for (const m of movements) {
    for (const n of [m.name, ...m.aliases]) {
      exact.set(n, m);
      normalized.set(normalizeMovementName(n), m);
    }
  }
  return (name) => {
    const trimmed = name.trim();
    const direct = exact.get(trimmed);
    if (direct) return direct;
    const key = normalizeMovementName(trimmed);
    const hit = normalized.get(key);
    if (hit) return hit;
    return key.endsWith("s") ? normalized.get(key.slice(0, -1)) ?? null : null;
  };
}
