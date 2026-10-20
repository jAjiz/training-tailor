import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeSubscription, makeUser } from "../helpers/factories";
import { fakePush } from "../helpers/fake-push";
import { deliver, intent } from "@/lib/notifications/notify";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const prog = { programId: "p1", programName: "Cycle" };
const announce = (recipients: { userId: string; locale: string | null }[], groupKey: string | null = null) =>
  intent("announcement", recipients, { ...prog, excerpt: "Hola equipo" }, { programId: "p1", entityId: "a1", groupKey });
const bump = (userId: string, latestName: string, count: number) =>
  intent("fist_bump", [{ userId, locale: null }], {
    resultId: "r1", blockId: "b1", block: { title: "Fran", movement: null, kind: "wod", scoring: "for_time" }, latestName, count,
  }, { groupKey: "bump:r1" });

describe("deliver", () => {
  it("creates one athlete row per recipient and pushes the localized text", async () => {
    const a = await makeUser(tdb.prisma);
    const b = await makeUser(tdb.prisma);
    const sa = await makeSubscription(tdb.prisma, a.id);
    const sb = await makeSubscription(tdb.prisma, b.id);
    const { sender, calls } = fakePush();
    const r = await deliver(tdb.prisma, [announce([{ userId: a.id, locale: null }, { userId: b.id, locale: "en" }])], sender);
    expect(r).toEqual({ created: 2, refreshed: 0, pushed: 2 });
    const rows = await tdb.prisma.notification.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((n) => n.audience === "athlete" && n.kind === "announcement")).toBe(true);
    const es = calls.find((c) => c.endpoint === sa.endpoint)!;
    const en = calls.find((c) => c.endpoint === sb.endpoint)!;
    expect(es.payload.url).toBe("/programs/p1/board");
    expect(es.payload.body).toContain("Hola equipo");
    expect(en.payload.body).toContain("Hola equipo");
  });

  it("localizes the text per recipient", async () => {
    const a = await makeUser(tdb.prisma);
    const b = await makeUser(tdb.prisma);
    const c = await makeUser(tdb.prisma);
    const sa = await makeSubscription(tdb.prisma, a.id);
    const sb = await makeSubscription(tdb.prisma, b.id);
    const sc = await makeSubscription(tdb.prisma, c.id);
    const { sender, calls } = fakePush();
    await deliver(tdb.prisma, [intent("week_published",
      [{ userId: a.id, locale: null }, { userId: b.id, locale: "en" }, { userId: c.id, locale: "fr" }],
      { ...prog, monday: "2026-10-12" }, { programId: "p1" })], sender);
    const body = (endpoint: string) => calls.find((x) => x.endpoint === endpoint)!.payload.body;
    expect(body(sa.endpoint)).toContain("Semana del 12 oct");
    expect(body(sb.endpoint)).toMatch(/^.{0,3}Week of /);
    expect(body(sc.endpoint)).toContain("Semana del");
  });

  it("makes a coach kind an inbox row without a push", async () => {
    const u = await makeUser(tdb.prisma);
    await makeSubscription(tdb.prisma, u.id);
    const { sender, calls } = fakePush();
    const r = await deliver(tdb.prisma, [intent("coach_approved", [{ userId: u.id, locale: null }], {})], sender);
    expect(r).toEqual({ created: 1, refreshed: 0, pushed: 0 });
    expect((await tdb.prisma.notification.findFirstOrThrow()).audience).toBe("coach");
    expect(calls).toHaveLength(0);
  });

  it("skips recipients who turned the kind off", async () => {
    const u = await makeUser(tdb.prisma);
    await makeSubscription(tdb.prisma, u.id);
    await tdb.prisma.notificationPreference.create({ data: { userId: u.id, kind: "announcement", enabled: false } });
    const { sender, calls } = fakePush();
    const r = await deliver(tdb.prisma, [announce([{ userId: u.id, locale: null }])], sender);
    expect(r.created).toBe(0);
    expect(await tdb.prisma.notification.count()).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("de-duplicates recipients by user id", async () => {
    const u = await makeUser(tdb.prisma);
    await deliver(tdb.prisma, [announce([{ userId: u.id, locale: null }, { userId: u.id, locale: "en" }])], null);
    expect(await tdb.prisma.notification.count()).toBe(1);
  });

  it("attempts every endpoint and tolerates gone and throwing senders", async () => {
    const u = await makeUser(tdb.prisma);
    const A = await makeSubscription(tdb.prisma, u.id, "https://push.test/A");
    const B = await makeSubscription(tdb.prisma, u.id, "https://push.test/B");
    const C = await makeSubscription(tdb.prisma, u.id, "https://push.test/C");
    const { sender, calls } = fakePush({ [A.endpoint]: "gone", [B.endpoint]: "throw", [C.endpoint]: "ok" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await deliver(tdb.prisma, [announce([{ userId: u.id, locale: null }])], sender);
      expect(r.created).toBe(1);
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
    expect(calls.map((c) => c.endpoint).sort()).toEqual([A.endpoint, B.endpoint, C.endpoint]);
    expect(await tdb.prisma.pushSubscription.findUnique({ where: { id: A.id } })).toBeNull();
    expect((await tdb.prisma.pushSubscription.findUniqueOrThrow({ where: { id: B.id } })).lastOkAt).toBeNull();
    expect((await tdb.prisma.pushSubscription.findUniqueOrThrow({ where: { id: C.id } })).lastOkAt).not.toBeNull();
  });

  it("creates rows without pushing when there is no sender", async () => {
    const u = await makeUser(tdb.prisma);
    await makeSubscription(tdb.prisma, u.id);
    const r = await deliver(tdb.prisma, [announce([{ userId: u.id, locale: null }])], null);
    expect(r).toEqual({ created: 1, refreshed: 0, pushed: 0 });
  });

  it("skips an existing groupKey row for a skip kind", async () => {
    const u = await makeUser(tdb.prisma);
    await makeSubscription(tdb.prisma, u.id);
    const { sender, calls } = fakePush();
    const i = announce([{ userId: u.id, locale: null }], "k1");
    await deliver(tdb.prisma, [i], sender);
    const r = await deliver(tdb.prisma, [i], sender);
    expect(r).toEqual({ created: 0, refreshed: 0, pushed: 0 });
    expect(await tdb.prisma.notification.count()).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("refreshes an existing groupKey row: unread, new data, same tag", async () => {
    const u = await makeUser(tdb.prisma);
    await makeSubscription(tdb.prisma, u.id);
    const { sender, calls } = fakePush();
    await deliver(tdb.prisma, [bump(u.id, "Ana", 1)], sender);
    const first = await tdb.prisma.notification.findFirstOrThrow();
    await tdb.prisma.notification.update({ where: { id: first.id }, data: { readAt: new Date() } });
    const r = await deliver(tdb.prisma, [bump(u.id, "Luis", 2)], sender);
    expect(r).toEqual({ created: 0, refreshed: 1, pushed: 1 });
    const rows = await tdb.prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].readAt).toBeNull();
    expect((rows[0].data as { latestName: string }).latestName).toBe("Luis");
    expect(calls).toHaveLength(2);
    expect(calls[0].payload.tag).toBe("bump:r1");
    expect(calls[1].payload.tag).toBe("bump:r1");
  });

  it("bumps updatedAt even when data is unchanged", async () => {
    const u = await makeUser(tdb.prisma);
    await deliver(tdb.prisma, [bump(u.id, "Ana", 1)], null);
    const first = await tdb.prisma.notification.findFirstOrThrow();
    await new Promise((r) => setTimeout(r, 5));
    await deliver(tdb.prisma, [bump(u.id, "Ana", 1)], null);
    const second = await tdb.prisma.notification.findFirstOrThrow();
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
  });
});
