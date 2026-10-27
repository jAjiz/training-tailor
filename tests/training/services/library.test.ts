import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAdmin } from "../../helpers/factories";
import { testContraindication, testDomain, testMovement } from "../../helpers/library-builders";
import { emptyLibrary, type DomainLibrary } from "@/lib/domain/library";
import { validateLibrary } from "@/lib/domain/validate-library";
import { toJson } from "@/lib/json";
import {
  deleteMovement, discardDraft, ensureState, exportVersion, importLibrary, libraryOverview,
  listVersions, openDraft, readDraft, renameMovement, restoreVersion, saveContraindication,
  saveDocument, saveMovement,
} from "@/lib/training/services/library";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

function testLibrary(): DomainLibrary {
  const base = testDomain({
    movements: [
      testMovement("Test A", { substitutes: [] }),
      testMovement("Test B", { substitutes: ["Test A"] }),
    ],
    contraindications: [testContraindication("test_knee", { avoidMovements: ["Test A"] })],
  });
  return {
    ...base,
    expectations: [{ kind: "substitutes", movement: "Test A", includes: ["Test B"] }],
    evalCases: [],
  };
}

/** Writes a published version straight into the tables and points the live state at it. */
async function seedLive(library: DomainLibrary, number = 1) {
  await ensureState(tdb.prisma);
  const row = await tdb.prisma.domainLibraryVersion.create({
    data: {
      number,
      movements: toJson(library.movements),
      contraindications: toJson(library.contraindications),
      taxonomy: toJson(library.taxonomy),
      conversions: toJson(library.conversions),
      expectations: toJson(library.expectations),
      evalCases: toJson(library.evalCases),
      publishedAt: new Date("2026-10-01T00:00:00Z"),
    },
  });
  await tdb.prisma.domainLibraryState.update({ where: { id: 1 }, data: { publishedVersionId: row.id } });
  return row;
}

describe("library drafts", () => {
  it("opens a draft from the live version, or from an empty library", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const empty = await openDraft(tdb.prisma, admin.id);
    expect(empty).toMatchObject({ number: 1, revision: 0, basedOnNumber: null, library: emptyLibrary(), renames: [] });
    await discardDraft(tdb.prisma, admin.id);

    await seedLive(testLibrary(), 4);
    const draft = await openDraft(tdb.prisma, admin.id);
    expect(draft).toMatchObject({ number: 5, basedOnNumber: 4, library: testLibrary() });
    expect(await openDraft(tdb.prisma, admin.id)).toEqual(draft);
    expect(await readDraft(tdb.prisma)).toEqual(draft);

    const overview = await libraryOverview(tdb.prisma);
    expect(overview.live).toMatchObject({ number: 4, state: "live" });
    expect(overview.draft).toMatchObject({ number: 5, state: "draft" });
    expect((await listVersions(tdb.prisma)).map((v) => v.number)).toEqual([5, 4]);
  });

  it("refuses a save with a stale revision", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    const draft = await openDraft(tdb.prisma, admin.id);
    const first = await saveMovement(tdb.prisma, admin.id, {
      revision: draft.revision, originalName: null, movement: testMovement("Test C"),
    });
    expect(first).toBe(draft.revision + 1);
    await expect(saveMovement(tdb.prisma, admin.id, {
      revision: draft.revision, originalName: null, movement: testMovement("Test D"),
    })).rejects.toMatchObject({ code: "library_conflict" });
    const after = await readDraft(tdb.prisma);
    expect(after?.library.movements.map((m) => m.name)).toEqual(["Test A", "Test B", "Test C"]);
  });

  it("rename rewrites references inside the draft and keeps the old name as an alias", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    const draft = await openDraft(tdb.prisma, admin.id);
    const revision = await saveDocument(tdb.prisma, admin.id, {
      revision: draft.revision,
      document: "expectations",
      value: [
        { kind: "substitutes", movement: "Test B", startsWith: ["Test A"], includes: ["Test A"] },
        { kind: "candidates", movement: "Test B", conditions: [{ key: "test_knee" }], excludes: ["Test A"] },
      ],
    });
    await renameMovement(tdb.prisma, admin.id, { revision, from: "Test A", to: "Test A2" });
    const after = (await readDraft(tdb.prisma))!;
    expect(after.library.expectations).toMatchObject([
      { startsWith: ["Test A2"], includes: ["Test A2"] },
      { excludes: ["Test A2"] },
    ]);
    expect(validateLibrary(after.library).map((f) => f.code)).not.toContain("expectation_failed");
    expect(after.library.movements.find((m) => m.name === "Test B")?.substitutes).toEqual(["Test A2"]);
    expect(after.library.movements.find((m) => m.name === "Test A2")?.aliases).toContain("Test A");
    expect(after.library.contraindications[0].avoidMovements).toEqual(["Test A2"]);
    expect(after.renames).toEqual([{ from: "Test A", to: "Test A2" }]);
    const audit = await tdb.prisma.adminAuditLog.findFirstOrThrow({ where: { action: "library.rename" } });
    expect(audit).toMatchObject({ targetType: "library", targetLabel: "v2" });
  });

  it("refuses to change a name through a save", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    const draft = await openDraft(tdb.prisma, admin.id);
    await expect(saveMovement(tdb.prisma, admin.id, {
      revision: draft.revision, originalName: "Test A", movement: testMovement("Test Z"),
    })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("refuses restore and import while a draft exists", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    await openDraft(tdb.prisma, admin.id);
    await expect(restoreVersion(tdb.prisma, admin.id, 1)).rejects.toMatchObject({ code: "library_draft_exists" });
    const file = await exportVersion(tdb.prisma, 1);
    await expect(importLibrary(tdb.prisma, admin.id, file)).rejects.toMatchObject({ code: "library_draft_exists" });
  });

  it("refuses an invalid movement", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const draft = await openDraft(tdb.prisma, admin.id);
    await expect(saveMovement(tdb.prisma, admin.id, {
      revision: draft.revision, originalName: null, movement: { name: "" },
    })).rejects.toMatchObject({ code: "library_invalid" });
    await expect(saveDocument(tdb.prisma, admin.id, {
      revision: draft.revision, document: "conversions", value: { effort: 3 },
    })).rejects.toMatchObject({ code: "library_invalid" });
  });

  it("saves and deletes entries and documents", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    let { revision } = await openDraft(tdb.prisma, admin.id);
    revision = await saveContraindication(tdb.prisma, admin.id, {
      revision, originalKey: "test_knee", contraindication: testContraindication("test_knee", { label: "Knee" }),
    });
    revision = await saveDocument(tdb.prisma, admin.id, {
      revision, document: "expectations", value: [],
    });
    revision = await deleteMovement(tdb.prisma, admin.id, { revision, name: "Test B" });
    const after = (await readDraft(tdb.prisma))!;
    expect(after.revision).toBe(revision);
    expect(after.library.contraindications[0].label).toBe("Knee");
    expect(after.library.expectations).toEqual([]);
    expect(after.library.movements.map((m) => m.name)).toEqual(["Test A"]);
  });

  it("export sets lastExportedAt and round-trips through import", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    const file = await exportVersion(tdb.prisma, 1);
    expect(file).toMatchObject({ format: 1, number: 1, library: testLibrary() });
    expect((await libraryOverview(tdb.prisma)).lastExportedAt).toBeInstanceOf(Date);
    const draft = await importLibrary(tdb.prisma, admin.id, file);
    expect(draft.library).toEqual(testLibrary());
    await expect(importLibrary(tdb.prisma, admin.id, { format: 2 })).rejects.toMatchObject({ code: "library_draft_exists" });
    await discardDraft(tdb.prisma, admin.id);
    await expect(importLibrary(tdb.prisma, admin.id, { format: 2 })).rejects.toMatchObject({ code: "library_invalid" });
  });

  it("restores a version into a draft and discards a draft", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    const draft = await restoreVersion(tdb.prisma, admin.id, 1);
    expect(draft).toMatchObject({ number: 2, basedOnNumber: 1, library: testLibrary() });
    await discardDraft(tdb.prisma, admin.id);
    expect(await readDraft(tdb.prisma)).toBeNull();
    expect(await tdb.prisma.domainLibraryVersion.count()).toBe(1);
    await expect(discardDraft(tdb.prisma, admin.id)).rejects.toMatchObject({ code: "library_no_draft" });
    await expect(restoreVersion(tdb.prisma, admin.id, 9)).rejects.toMatchObject({ code: "not_found" });
  });

  it("never deletes a published row when the draft pointer is stale", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const live = await seedLive(testLibrary());
    await tdb.prisma.domainLibraryState.update({ where: { id: 1 }, data: { draftVersionId: live.id } });
    await expect(discardDraft(tdb.prisma, admin.id)).rejects.toMatchObject({ code: "library_no_draft" });
    expect(await tdb.prisma.domainLibraryVersion.count({ where: { id: live.id } })).toBe(1);
    expect((await libraryOverview(tdb.prisma)).live?.id).toBe(live.id);
  });

  it("renaming onto an existing name leaves a duplicate_name finding", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await seedLive(testLibrary());
    const draft = await openDraft(tdb.prisma, admin.id);
    await renameMovement(tdb.prisma, admin.id, { revision: draft.revision, from: "Test A", to: "Test B" });
    const after = (await readDraft(tdb.prisma))!;
    expect(validateLibrary(after.library).map((f) => f.code)).toContain("duplicate_name");
  });
});
