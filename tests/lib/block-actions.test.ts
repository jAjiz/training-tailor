import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeClosed, makeCoach } from "../helpers/factories";

const holder = vi.hoisted(() => ({ db: null as unknown }));
const requireCoach = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: (_t, k) => (holder.db as Record<string | symbol, unknown>)[k] }) }));
vi.mock("@/lib/accounts", () => ({ requireCoach: () => requireCoach() }));
vi.mock("@/lib/session", () => ({ getSessionContext: () => Promise.resolve(null) }));
vi.mock("@/lib/training/services/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), unstable_rethrow: vi.fn() }));

import { importBlocksAction } from "@/app/coach/block-actions";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); holder.db = tdb.prisma; }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); vi.clearAllMocks(); });

describe("importBlocksAction", () => {
  it("names the day of a single imported note over 2000 characters", async () => {
    const coach = await makeCoach(tdb.prisma);
    requireCoach.mockResolvedValue(coach);
    const p = await makeClosed(tdb.prisma, coach.id, 4, false);
    expect(await importBlocksAction({
      programId: p.id, items: [], notes: [{ scope: "day", index: 3, text: "a".repeat(2001) }],
    })).toEqual({ ok: false, code: "note_too_long", issues: ["day:3"] });
    expect(await tdb.prisma.dayNote.count()).toBe(0);
  });
});
