import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeUser } from "../../helpers/factories";
import { grantAdmin } from "@/lib/training/services/admin";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("grantAdmin", () => {
  it("grants the admin role by email", async () => {
    const user = await makeUser(tdb.prisma);
    expect(await grantAdmin(tdb.prisma, user.email)).toBe("granted");
    expect((await tdb.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("admin");
    expect(await grantAdmin(tdb.prisma, "nobody@test.local")).toBe("not_found");
  });
});
