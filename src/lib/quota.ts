export type UsageKind = "analyze" | "tailor" | "refine";

export interface QuotaStore {
  countSince(userId: string, kind: UsageKind, since: Date): Promise<number>;
  record(userId: string, kind: UsageKind): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dailyLimit(): number {
  const n = Number(process.env.DAILY_ENGINE_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

/** Counts runs of this kind in the last 24 h; records this one only when it is allowed. */
export async function consumeQuota(
  store: QuotaStore, userId: string, kind: UsageKind, limit: number, now: Date = new Date(),
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const used = await store.countSince(userId, kind, new Date(now.getTime() - DAY_MS));
  if (used >= limit) return { allowed: false, used, limit };
  await store.record(userId, kind);
  return { allowed: true, used: used + 1, limit };
}
