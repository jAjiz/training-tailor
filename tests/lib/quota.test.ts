import { describe, it, expect, afterEach } from "vitest";
import { consumeQuota, dailyLimit, type QuotaStore, type UsageKind } from "@/lib/quota";

function memoryStore(): QuotaStore & { rows: { userId: string; kind: UsageKind; at: Date }[] } {
  const rows: { userId: string; kind: UsageKind; at: Date }[] = [];
  return {
    rows,
    async countSince(userId, since) { return rows.filter((r) => r.userId === userId && r.at >= since).length; },
    async record(userId, kind) { rows.push({ userId, kind, at: new Date() }); },
  };
}

describe("consumeQuota", () => {
  it("records usage until the limit and then refuses", async () => {
    const store = memoryStore();
    expect(await consumeQuota(store, "u1", "tailor", 2)).toEqual({ allowed: true, used: 1, limit: 2 });
    expect(await consumeQuota(store, "u1", "refine", 2)).toEqual({ allowed: true, used: 2, limit: 2 });
    expect(await consumeQuota(store, "u1", "tailor", 2)).toEqual({ allowed: false, used: 2, limit: 2 });
    expect(await consumeQuota(store, "u2", "tailor", 2)).toMatchObject({ allowed: true });
    expect(store.rows).toHaveLength(3);
  });

  it("only counts the last 24 hours", async () => {
    const store = memoryStore();
    store.rows.push({ userId: "u1", kind: "tailor", at: new Date(Date.now() - 25 * 3600 * 1000) });
    expect((await consumeQuota(store, "u1", "tailor", 1)).allowed).toBe(true);
  });
});

describe("dailyLimit", () => {
  const original = process.env.DAILY_ENGINE_LIMIT;
  afterEach(() => {
    if (original === undefined) delete process.env.DAILY_ENGINE_LIMIT;
    else process.env.DAILY_ENGINE_LIMIT = original;
  });

  it("reads a positive integer and defaults to 30", () => {
    process.env.DAILY_ENGINE_LIMIT = "5";
    expect(dailyLimit()).toBe(5);
    process.env.DAILY_ENGINE_LIMIT = "abc";
    expect(dailyLimit()).toBe(30);
  });
});
