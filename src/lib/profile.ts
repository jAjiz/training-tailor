import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { StoredProfileSchema, emptyStoredProfile, type ProfileInjury, type StoredProfile } from "@/lib/engine/types";

/** The stored profile; a `benchmarks` key left from before records is stripped. */
export function normalizeProfile(raw: unknown): StoredProfile {
  if (raw == null) return emptyStoredProfile();
  const parsed = StoredProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.error("stored profile failed validation; using an empty profile", parsed.error.issues);
  return emptyStoredProfile();
}

/** Only catalog injury keys (first occurrence wins) and canonical movement names are stored. */
export function sanitizeProfile(
  profile: StoredProfile, domain: Pick<DomainData, "movements" | "contraindications">,
): StoredProfile {
  const resolve = createMovementResolver(domain.movements);
  const catalog = new Set(domain.contraindications.map((c) => c.key));
  const injuries: ProfileInjury[] = [];
  for (const i of profile.injuries) {
    if (catalog.has(i.key) && !injuries.some((x) => x.key === i.key)) injuries.push(i);
  }
  return {
    ...profile,
    injuries,
    goals: profile.goals.map((g) => ({ ...g, movement: g.movement ? resolve(g.movement)?.name ?? null : null })),
  };
}
