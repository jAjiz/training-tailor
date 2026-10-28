import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import type { LlmProvider } from "@/lib/ai/provider";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeClosed, makeCoach, makeUser } from "../helpers/factories";
import { testDomain, testMovement } from "../helpers/library-builders";

let tdb: TestDb;
const getSessionContext = vi.fn();
const getProvider = vi.fn();
const countSince = vi.fn();
const record = vi.fn();
vi.mock("@/lib/db", () => ({ get prisma() { return tdb.prisma; } }));
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("@/lib/ai", () => ({ getProvider: () => getProvider() }));
vi.mock("@/lib/quota-store", () => ({
  prismaQuotaStore: {
    countSince: (...a: unknown[]) => countSince(...a),
    record: (...a: unknown[]) => record(...a),
  },
}));
vi.mock("@/lib/domain/repository", () => ({
  getDomainData: async () => testDomain({
    movements: [testMovement("Test Back Squat", { equipment: ["barbell"] }), testMovement("Test Burpee")],
  }),
}));

import { POST } from "@/app/api/coach/import/route";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7 test");
const OVER_LIMIT = 4 * 1024 * 1024 + 1;
const block = {
  kind: "custom", title: "Test Block", color: "neutral", coachingTips: null, description: "Test work",
  scoring: "none", timeCapSeconds: null, movement: null, sets: null, instructions: null, sourceText: "Test work",
};
const response = (blocks: unknown[] = [block]) => ({
  weeksFound: 1, daysNamed: true, weeks: [{ label: "Week 1", days: [{ day: 1, blocks }] }],
});

let coachId: string;
let coachUserId: string;
let programId: string;
let fake: FakeProvider;

beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => {
  await tdb.reset();
  const coach = await makeCoach(tdb.prisma);
  coachId = coach.id;
  coachUserId = coach.userId;
  programId = (await makeClosed(tdb.prisma, coachId)).id;
  getSessionContext.mockReset().mockResolvedValue({ user: { id: coachUserId }, role: null, impersonatedBy: null });
  fake = new FakeProvider({ WeekImport: response() });
  getProvider.mockReset().mockReturnValue(fake);
  countSince.mockReset().mockResolvedValue(0);
  record.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function call(over: { programId?: string | null; pdf?: Blob | string | null } = {}) {
  const form = new FormData();
  const id = over.programId === undefined ? programId : over.programId;
  if (id !== null) form.set("programId", id);
  const pdf = over.pdf === undefined ? new File([PDF_BYTES], "plan.pdf", { type: "application/pdf" }) : over.pdf;
  if (pdf !== null) form.set("pdf", pdf);
  return POST(new Request("http://localhost/api/coach/import", { method: "POST", body: form }));
}
const code = async (res: Response) => (await res.json()).error;

describe("POST /api/coach/import", () => {
  it("answers 401 without a session", async () => {
    getSessionContext.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(await code(res)).toBe("unauthorized");
  });

  it("answers 403 during an impersonation", async () => {
    getSessionContext.mockResolvedValue({ user: { id: coachUserId }, role: null, impersonatedBy: "admin1" });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("forbidden");
  });

  it("answers 403 to a user who is not a coach", async () => {
    const user = await makeUser(tdb.prisma);
    getSessionContext.mockResolvedValue({ user: { id: user.id }, role: null, impersonatedBy: null });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("unauthorized");
  });

  it("answers 403 to a coach who is not approved", async () => {
    const pending = await makeCoach(tdb.prisma, "pending");
    getSessionContext.mockResolvedValue({ user: { id: pending.userId }, role: null, impersonatedBy: null });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("coach_pending");
  });

  it("answers 404 for a program the coach does not own", async () => {
    const other = await makeClosed(tdb.prisma, (await makeCoach(tdb.prisma)).id);
    const res = await call({ programId: other.id });
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("not_found");
  });

  it("answers 409 for an archived program", async () => {
    await tdb.prisma.program.update({ where: { id: programId }, data: { archivedAt: new Date() } });
    const res = await call();
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("program_archived");
  });

  it("answers 400 without a file, with a non-PDF file or without a program id", async () => {
    for (const over of [
      { pdf: null },
      { pdf: new File(["not a pdf"], "plan.pdf", { type: "application/pdf" }) },
      { pdf: "plain text" },
      { programId: null },
    ]) {
      const res = await call(over);
      expect(res.status).toBe(400);
      expect(await code(res)).toBe("import_pdf_invalid");
    }
  });

  it("answers 400 to a body that is not a form", async () => {
    const res = await POST(new Request("http://localhost/api/coach/import", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("import_pdf_invalid");
  });

  it("answers 413 for a file over 4 MB", async () => {
    const big = new Uint8Array(OVER_LIMIT);
    big.set(PDF_BYTES);
    const res = await call({ pdf: new File([big], "plan.pdf", { type: "application/pdf" }) });
    expect(res.status).toBe(413);
    expect(await code(res)).toBe("import_pdf_too_large");
  });

  it("checks size and type before spending quota", async () => {
    await call({ pdf: new File([new Uint8Array(OVER_LIMIT)], "plan.pdf") });
    await call({ pdf: new File(["not a pdf"], "plan.pdf") });
    expect(record).not.toHaveBeenCalled();
    expect(countSince).not.toHaveBeenCalled();
  });

  it("answers 503 when no provider is configured", async () => {
    getProvider.mockImplementation(() => { throw new Error("GEMINI_API_KEY is not set"); });
    const res = await call();
    expect(res.status).toBe(503);
    expect(await code(res)).toBe("import_unavailable");
    expect(record).not.toHaveBeenCalled();
  });

  it("answers 429 when the quota is exhausted", async () => {
    countSince.mockResolvedValue(1000);
    const res = await call();
    expect(res.status).toBe(429);
    expect(await code(res)).toBe("import_quota");
    expect(record).not.toHaveBeenCalled();
  });

  it("answers 422 when no block is found", async () => {
    getProvider.mockReturnValue(new FakeProvider({ WeekImport: response([]) }));
    const res = await call();
    expect(res.status).toBe(422);
    expect(await code(res)).toBe("import_empty");
  });

  it("spends quota before calling the model", async () => {
    const failing: LlmProvider = {
      model: "fake",
      generateStructured: async () => { throw new Error("boom: secret detail"); },
    };
    getProvider.mockReturnValue(failing);
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "import_failed" });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(coachUserId, "import");
  });

  it("returns the preview", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const preview = await res.json();
    expect(preview.weeksFound).toBe(1);
    expect(preview.weeks).toHaveLength(1);
    expect(preview.weeks[0].days[0].blocks[0].title).toBe("Test Block");
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("gives the model the barbell movements and the PDF bytes", async () => {
    await call();
    expect(fake.calls[0].systemPrompt).toContain("Test Back Squat");
    expect(fake.calls[0].systemPrompt).not.toContain("Test Burpee");
    expect(Array.from(fake.calls[0].attachments![0].data)).toEqual(Array.from(PDF_BYTES));
  });
});
