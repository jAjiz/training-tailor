import type { Movement } from "./types";

/** Case-, spacing- and punctuation-insensitive key; "&" is spelled out as "and". */
export function normalizeMovementName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

// Word-level shorthand seen in programming and in the library aliases. Whole-name shorthand
// (SDHP, HPC, BJO, ...) stays an alias of its row.
const ABBREVIATIONS: Record<string, string> = {
  kb: "kettlebell", db: "dumbbell", bb: "barbell",
  hs: "handstand", hspu: "handstand push up", mu: "muscle up",
  ohs: "overhead squat", rdl: "romanian deadlift",
  t2b: "toes to bar", ttb: "toes to bar", c2b: "chest to bar", ctb: "chest to bar",
  t2r: "toes to ring", ttr: "toes to ring", k2e: "knees to elbows",
  du: "double under", dus: "double under",
};

// Applied to the library and the query alike, so it only has to be consistent, not correct English.
const singular = (word: string) => (word.length > 2 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

/** Order-insensitive key: words, abbreviations expanded, each singularized, sorted. */
export function movementWordKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (ABBREVIATIONS[w] ?? w).split(" "))
    .map(singular)
    .sort()
    .join(" ");
}

export type MovementResolver = (name: string) => Movement | null;

/**
 * exact name/alias → normalized name/alias → normalized singular (trailing "s" dropped)
 * → word key (any word order, abbreviations expanded). Never matches a subset of the words.
 */
export function createMovementResolver(movements: Movement[]): MovementResolver {
  const exact = new Map<string, Movement>();
  const normalized = new Map<string, Movement>();
  const byWords = new Map<string, Movement>();
  for (const m of movements) {
    for (const n of [m.name, ...m.aliases]) {
      exact.set(n, m);
      normalized.set(normalizeMovementName(n), m);
      byWords.set(movementWordKey(n), m);
    }
  }
  return (name) => {
    const trimmed = name.trim();
    const direct = exact.get(trimmed);
    if (direct) return direct;
    const key = normalizeMovementName(trimmed);
    const hit = normalized.get(key);
    if (hit) return hit;
    const singularHit = key.endsWith("s") ? normalized.get(key.slice(0, -1)) : undefined;
    if (singularHit) return singularHit;
    const words = movementWordKey(trimmed);
    return words ? byWords.get(words) ?? null : null;
  };
}

/**
 * Every movement whose name holds all the words of a general name ("snatch" → Power Snatch, Hang Power Snatch,
 * Dumbbell Snatch, ...): what an athlete means by a movement they cannot do, when it is not one library row.
 */
export function movementFamily(name: string, movements: Movement[]): Movement[] {
  const words = movementWordKey(name).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  return movements.filter((m) => {
    const own = movementWordKey(m.name).split(" ");
    return words.every((w) => own.includes(w));
  });
}
