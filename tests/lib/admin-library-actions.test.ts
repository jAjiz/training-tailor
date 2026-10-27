import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeAdmin } from "../helpers/factories";
import { testContraindication, testDomain, testMovement } from "../helpers/library-builders";
import { TrainingError } from "@/lib/training/errors";
import type { DomainLibrary } from "@/lib/domain/library";
import { openDraft } from "@/lib/training/services/library";

const requireAdmin = vi.fn();
const db = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: (_t, k) => (db.current as Record<string | symbol, unknown>)[k] }) }));
vi.mock("@/lib/accounts", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/session", () => ({ getSessionContext: async () => null }));
vi.mock("@/lib/training/services/audit", async (orig) => ({ ...(await orig<object>()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), unstable_rethrow: vi.fn() }));

import {
  deleteContraindicationAction, deleteMovementAction, discardLibraryDraftAction, importLibraryAction, openLibraryDraftAction,
  publishLibraryAction, renameMovementAction, restoreLibraryVersionAction, saveContraindicationAction, saveDocumentAction,
  saveMovementAction,
} from "@/app/admin/library/actions";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); db.current = tdb.prisma; }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => {
  await tdb.reset();
  requireAdmin.mockReset();
});

function testLibrary(): DomainLibrary {
  const base = testDomain({
    movements: [
      testMovement("Test Squat", { equipment: ["barbell"], substitutes: ["Test Press"] }),
      testMovement("Test Press", { substitutes: ["Test Squat"] }),
    ],
    contraindications: [testContraindication("test_knee", { avoidMovements: ["Test Press"] })],
  });
  return { ...base, expectations: [], evalCases: [] };
}

const file = (library: DomainLibrary) =>
  JSON.stringify({ format: 1, number: null, exportedAt: new Date().toISOString(), library });

describe("admin library actions", () => {
  it("answers not_found to anyone who is not an admin", async () => {
    requireAdmin.mockRejectedValue(new TrainingError("not_found"));
    const denied = { ok: false, code: "not_found" };
    expect(await publishLibraryAction(1, "Test note", true)).toEqual(denied);
    expect(await discardLibraryDraftAction()).toEqual(denied);
    expect(await importLibraryAction(file(testLibrary()))).toEqual(denied);
    expect(await restoreLibraryVersionAction(1)).toEqual(denied);
  });

  it("refuses an import that is not JSON", async () => {
    const admin = await makeAdmin(tdb.prisma);
    requireAdmin.mockResolvedValue(admin);
    expect(await importLibraryAction("not json")).toEqual({ ok: false, code: "library_invalid" });
    expect(await importLibraryAction(42)).toEqual({ ok: false, code: "invalid_request" });
  });

  it("imports a file as a draft and publishes it", async () => {
    const admin = await makeAdmin(tdb.prisma);
    requireAdmin.mockResolvedValue(admin);
    expect(await importLibraryAction(file(testLibrary()))).toEqual({ ok: true, value: undefined });
    const draft = await tdb.prisma.domainLibraryVersion.findFirstOrThrow();
    expect(await publishLibraryAction(draft.revision, "Test note", true)).toEqual({ ok: true, value: { ok: true, number: 1 } });
  });

  it("returns the findings of a publish that is held back", async () => {
    const admin = await makeAdmin(tdb.prisma);
    requireAdmin.mockResolvedValue(admin);
    const draft = await openDraft(tdb.prisma, admin.id);
    const r = await publishLibraryAction(draft.revision, "Test note", false);
    expect(r.ok).toBe(true);
    expect(r.ok && !r.value.ok && r.value.findings.length > 0).toBe(true);
  });

  it("discards a draft and restores a version as a new one", async () => {
    const admin = await makeAdmin(tdb.prisma);
    requireAdmin.mockResolvedValue(admin);
    await importLibraryAction(file(testLibrary()));
    const draft = await tdb.prisma.domainLibraryVersion.findFirstOrThrow();
    await publishLibraryAction(draft.revision, "Test note", true);
    expect(await discardLibraryDraftAction()).toEqual({ ok: false, code: "library_no_draft" });
    expect(await restoreLibraryVersionAction(99)).toEqual({ ok: false, code: "not_found" });
    expect(await restoreLibraryVersionAction(1)).toEqual({ ok: true, value: undefined });
    expect(await discardLibraryDraftAction()).toEqual({ ok: true, value: undefined });
  });

  it("refuses malformed publish input", async () => {
    requireAdmin.mockResolvedValue({ id: "a" });
    expect(await publishLibraryAction("1", "x", true)).toEqual({ ok: false, code: "invalid_request" });
    expect(await publishLibraryAction(1, "x", "yes")).toEqual({ ok: false, code: "invalid_request" });
  });

  describe("entry editors", () => {
    async function openWithLibrary() {
      const admin = await makeAdmin(tdb.prisma);
      requireAdmin.mockResolvedValue(admin);
      await importLibraryAction(file(testLibrary()));
      return tdb.prisma.domainLibraryVersion.findFirstOrThrow();
    }
    const squat = (extra: object = {}) => JSON.stringify({ ...testMovement("Test Squat", { equipment: ["barbell"], substitutes: ["Test Press"] }), ...extra });

    it("answers not_found to anyone who is not an admin", async () => {
      requireAdmin.mockRejectedValue(new TrainingError("not_found"));
      const denied = { ok: false, code: "not_found" };
      expect(await openLibraryDraftAction()).toEqual(denied);
      expect(await saveMovementAction(1, null, "{}")).toEqual(denied);
      expect(await deleteMovementAction(1, "Test Squat")).toEqual(denied);
      expect(await renameMovementAction(1, "Test Squat", "Test Back Squat")).toEqual(denied);
      expect(await saveContraindicationAction(1, null, "{}")).toEqual(denied);
      expect(await deleteContraindicationAction(1, "test_knee")).toEqual(denied);
      expect(await saveDocumentAction(1, "taxonomy", "{}")).toEqual(denied);
    });

    it("opens a draft only when asked", async () => {
      requireAdmin.mockResolvedValue(await makeAdmin(tdb.prisma));
      expect(await tdb.prisma.domainLibraryVersion.count()).toBe(0);
      expect(await openLibraryDraftAction()).toEqual({ ok: true, value: undefined });
      expect(await tdb.prisma.domainLibraryVersion.count()).toBe(1);
    });

    it("refuses a stale revision", async () => {
      const draft = await openWithLibrary();
      expect(await saveMovementAction(draft.revision + 1, "Test Squat", squat())).toEqual({ ok: false, code: "library_conflict" });
    });

    it("says which fields of an invalid entry are wrong, at most five", async () => {
      const draft = await openWithLibrary();
      const r = await saveMovementAction(draft.revision, null, JSON.stringify({ ...testMovement("Test New"), equipment: "barbell" }));
      expect(r).toMatchObject({ ok: false, code: "library_invalid" });
      const issues = !r.ok ? r.issues ?? [] : [];
      expect(issues.some((i) => i.startsWith("equipment: "))).toBe(true);
      const empty = await saveMovementAction(draft.revision, null, "{}");
      expect(!empty.ok && empty.issues?.length).toBeGreaterThan(0);
      expect(!empty.ok && empty.issues?.length).toBeLessThanOrEqual(5);
    });

    it("says what is wrong with an invalid import file", async () => {
      requireAdmin.mockResolvedValue(await makeAdmin(tdb.prisma));
      const r = await importLibraryAction(JSON.stringify({ format: 1, library: { movements: "none" } }));
      expect(r).toMatchObject({ ok: false, code: "library_invalid" });
      expect(!r.ok && r.issues?.some((i) => i.startsWith("library.movements: "))).toBe(true);
    });

    it("refuses JSON that does not parse and documents that do not exist", async () => {
      const draft = await openWithLibrary();
      expect(await saveMovementAction(draft.revision, null, "{")).toEqual({ ok: false, code: "library_invalid" });
      expect(await saveContraindicationAction(draft.revision, null, "{")).toEqual({ ok: false, code: "library_invalid" });
      expect(await saveDocumentAction(draft.revision, "taxonomy", "{")).toEqual({ ok: false, code: "library_invalid" });
      expect(await saveDocumentAction(draft.revision, "unknown", "{}")).toEqual({ ok: false, code: "invalid_request" });
      expect(await saveMovementAction("1", null, "{}")).toEqual({ ok: false, code: "invalid_request" });
    });

    it("saves, renames and deletes entries, returning the new revision", async () => {
      const draft = await openWithLibrary();
      const saved = await saveMovementAction(draft.revision, "Test Squat", squat({ aliases: ["Test Sq"] }));
      expect(saved.ok && saved.value.revision).toBeGreaterThan(draft.revision);
      const rev = saved.ok ? saved.value.revision : 0;
      const renamed = await renameMovementAction(rev, "Test Squat", "Test Back Squat");
      expect(renamed.ok).toBe(true);
      const rev2 = renamed.ok ? renamed.value.revision : 0;
      const contra = await saveContraindicationAction(rev2, "test_knee", JSON.stringify(testContraindication("test_knee", { avoidMovements: ["Test Press"] })));
      expect(contra.ok).toBe(true);
      const rev3 = contra.ok ? contra.value.revision : 0;
      const doc = await saveDocumentAction(rev3, "conversions", JSON.stringify({ effort: [], implementLoad: [] }));
      expect(doc.ok).toBe(true);
      const rev4 = doc.ok ? doc.value.revision : 0;
      expect((await deleteContraindicationAction(rev4, "test_knee")).ok).toBe(true);
      expect(await deleteMovementAction(rev4 + 1, "Test Press")).toEqual({ ok: true, value: { revision: rev4 + 2 } });
    });
  });
});
