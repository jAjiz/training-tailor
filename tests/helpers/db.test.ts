import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./db";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("createTestDb", () => {
  it("applies the migrations and runs queries through Prisma", async () => {
    await tdb.prisma.user.create({ data: { id: "u1", name: "A", email: "a@test.local" } });
    expect(await tdb.prisma.user.count()).toBe(1);
  });

  it("starts every test from empty tables", async () => {
    expect(await tdb.prisma.user.count()).toBe(0);
  });

  it("rolls back interactive transactions and reports unique violations as P2002", async () => {
    await tdb.prisma.user.create({ data: { id: "u1", name: "A", email: "a@test.local" } });
    await expect(tdb.prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: "u2", name: "B", email: "b@test.local" } });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await tdb.prisma.user.count()).toBe(1);
    await expect(tdb.prisma.user.create({ data: { id: "u3", name: "C", email: "a@test.local" } }))
      .rejects.toMatchObject({ code: "P2002" });
    expect(await tdb.prisma.user.count()).toBe(1); // the connection survives the error
  });
});
