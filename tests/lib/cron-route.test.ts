import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";

let tdb: TestDb;
vi.mock("@/lib/db", () => ({ get prisma() { return tdb.prisma; } }));
vi.mock("@/lib/notifications/push", () => ({ webPushSender: () => null }));

import { GET } from "@/app/api/cron/weekly/route";

beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });
afterEach(() => { vi.unstubAllEnvs(); });

const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/weekly", { headers: authorization ? { authorization } : {} }));

describe("GET /api/cron/weekly", () => {
  it("answers 401 without a header", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
  });

  it("answers 401 with a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("answers 401 when CRON_SECRET is unset and the header is 'Bearer undefined'", async () => {
    vi.stubEnv("CRON_SECRET", "");
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("answers 401 when CRON_SECRET is empty", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("runs the job with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reminders: 0, deleted: 0 });
  });
});
