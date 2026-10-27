import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { listAudit, writeAudit } from "@/lib/training/services/audit";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb({ library: false }); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("audit log", () => {
  it("lists newest first and pages by 50", async () => {
    const base = Date.parse("2026-01-01T00:00:00Z");
    await tdb.prisma.adminAuditLog.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({ action: `a${i}`, createdAt: new Date(base + i * 1000) })),
    });
    const first = await listAudit(tdb.prisma, { page: 0 });
    expect(first.rows).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.rows[0].action).toBe("a50");
    const second = await listAudit(tdb.prisma, { page: 1 });
    expect(second.rows.map((r) => r.action)).toEqual(["a0"]);
    expect(second.hasMore).toBe(false);
  });

  it("filters by target user and action", async () => {
    await writeAudit(tdb.prisma, { actorUserId: null, action: "coach.approve", targetUserId: "u1" });
    await writeAudit(tdb.prisma, { actorUserId: null, action: "athlete.delete", targetUserId: "u1" });
    await writeAudit(tdb.prisma, { actorUserId: null, action: "coach.approve", targetUserId: "u2" });
    expect((await listAudit(tdb.prisma, { page: 0, targetUserId: "u1" })).rows).toHaveLength(2);
    const both = await listAudit(tdb.prisma, { page: 0, targetUserId: "u1", action: "coach.approve" });
    expect(both.rows).toHaveLength(1);
    expect(both.rows[0].targetUserId).toBe("u1");
  });
});
