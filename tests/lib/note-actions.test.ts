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

import { revalidatePath } from "next/cache";
import { setDayNoteAction, setWeekNoteAction } from "@/app/coach/note-actions";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); holder.db = tdb.prisma; }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); vi.clearAllMocks(); });

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  requireCoach.mockResolvedValue(coach);
  const program = await makeClosed(tdb.prisma, coach.id, 4, false);
  return program;
}

describe("setDayNoteAction", () => {
  it("stores the trimmed note and revalidates the planner", async () => {
    const p = await setup();
    expect(await setDayNoteAction({ programId: p.id, dayIndex: 2, body: "  Test goal  " })).toEqual({ ok: true, value: undefined });
    expect((await tdb.prisma.dayNote.findMany()).map((n) => [n.dayIndex, n.body])).toEqual([[2, "Test goal"]]);
    expect(revalidatePath).toHaveBeenCalledWith("/coach/programs/[id]", "page");
  });

  it("deletes the note when the body is blank", async () => {
    const p = await setup();
    await tdb.prisma.dayNote.create({ data: { programId: p.id, dayIndex: 0, body: "Test goal" } });
    expect(await setDayNoteAction({ programId: p.id, dayIndex: 0, body: "   " })).toEqual({ ok: true, value: undefined });
    expect(await tdb.prisma.dayNote.count()).toBe(0);
  });

  it("refuses a body over 2000 characters", async () => {
    const p = await setup();
    expect(await setDayNoteAction({ programId: p.id, dayIndex: 0, body: "a".repeat(2001) })).toEqual({ ok: false, code: "invalid_request" });
    expect(await tdb.prisma.dayNote.count()).toBe(0);
  });
});

describe("setWeekNoteAction", () => {
  it("stores and then deletes the week note", async () => {
    const p = await setup();
    expect(await setWeekNoteAction({ programId: p.id, weekIndex: 1, body: "Test week" })).toEqual({ ok: true, value: undefined });
    expect((await tdb.prisma.weekNote.findMany()).map((n) => [n.weekIndex, n.body])).toEqual([[1, "Test week"]]);
    await setWeekNoteAction({ programId: p.id, weekIndex: 1, body: "" });
    expect(await tdb.prisma.weekNote.count()).toBe(0);
  });

  it("refuses a body over 2000 characters", async () => {
    const p = await setup();
    expect(await setWeekNoteAction({ programId: p.id, weekIndex: 0, body: "a".repeat(2001) })).toEqual({ ok: false, code: "invalid_request" });
  });
});
