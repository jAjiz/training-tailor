import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { AthleteProfileSchema, emptyProfile, type AthleteProfile, type ProfileInjury } from "@/lib/engine/types";

export function normalizeProfile(raw: unknown): AthleteProfile {
  if (raw == null) return emptyProfile();
  const parsed = AthleteProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.error("stored profile failed validation; using an empty profile", parsed.error.issues);
  return emptyProfile();
}

/** Only catalog injury keys (first occurrence wins) and canonical movement names are stored. */
export function sanitizeProfile(
  profile: AthleteProfile, domain: Pick<DomainData, "movements" | "contraindications">,
): AthleteProfile {
  const resolve = createMovementResolver(domain.movements);
  const catalog = new Set(domain.contraindications.map((c) => c.key));
  const injuries: ProfileInjury[] = [];
  for (const i of profile.injuries) {
    if (catalog.has(i.key) && !injuries.some((x) => x.key === i.key)) injuries.push(i);
  }
  return {
    ...profile,
    injuries,
    benchmarks: profile.benchmarks.flatMap((b) => {
      const m = resolve(b.movement);
      return m ? [{ ...b, movement: m.name }] : [];
    }),
    goals: profile.goals.map((g) => ({ ...g, movement: g.movement ? resolve(g.movement)?.name ?? null : null })),
  };
}
