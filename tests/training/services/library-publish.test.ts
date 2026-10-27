import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAdmin, makeAthlete, makeBarbellBlock, makeContinuous, makeCoach } from "../../helpers/factories";
import { testContraindication, testDomain, testMovement } from "../../helpers/library-builders";
import type { DomainLibrary } from "@/lib/domain/library";
import { emptyProfile, type AthleteProfile } from "@/lib/engine/types";
import { toJson } from "@/lib/json";
import {
  deleteMovement, importLibrary, listVersions, openDraft, readDraft, renameMovement, saveMovement,
} from "@/lib/training/services/library";
import { publishDraft } from "@/lib/training/services/library-publish";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

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

const publishInput = (revision: number, over: Partial<{ note: string; acceptWarnings: boolean }> = {}) =>
  ({ revision, note: "Test note", acceptWarnings: true, ...over });

async function importDraft(admin: { id: string }, library: DomainLibrary) {
  return importLibrary(tdb.prisma, admin.id, {
    format: 1, number: null, exportedAt: new Date().toISOString(), library,
  });
}

async function publishLive(admin: { id: string }, library: DomainLibrary = testLibrary()) {
  const draft = await importDraft(admin, library);
  const outcome = await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision));
  expect(outcome.ok).toBe(true);
}

// Rows are written with prisma: the PR service still checks lifts against the files, which know no `Test ` names.
async function makePr(movement: string) {
  const athlete = await makeAthlete(tdb.prisma);
  await tdb.prisma.personalRecord.create({
    data: { athleteId: athlete.id, movement, kg: 100, achievedOn: new Date("2026-10-01T00:00:00Z") },
  });
  return athlete;
}

async function makeProfile(over: Partial<AthleteProfile>) {
  const athlete = await makeAthlete(tdb.prisma);
  return tdb.prisma.athleteProfile.create({
    data: { userId: athlete.userId, data: toJson({ ...emptyProfile(), ...over }) },
  });
}

const state = () => tdb.prisma.domainLibraryState.findUniqueOrThrow({ where: { id: 1 } });

describe("publishDraft", () => {
  it("bootstraps the first version", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const draft = await importDraft(admin, testLibrary());
    const outcome = await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision, { note: " First " }));
    expect(outcome).toEqual({ ok: true, number: 1 });
    const after = await state();
    expect(after.publishedVersionId).toBe(draft.id);
    expect(after.draftVersionId).toBeNull();
    const row = await tdb.prisma.domainLibraryVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row).toMatchObject({ note: "First", publishedByUserId: admin.id, renames: [] });
    expect(row.publishedAt).not.toBeNull();
    const audit = await tdb.prisma.adminAuditLog.findFirstOrThrow({ where: { action: "library.publish" } });
    expect(audit).toMatchObject({ targetType: "library", targetLabel: "v1", actorUserId: admin.id });
  });

  it("refuses a missing draft, a stale revision and an empty note", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await expect(publishDraft(tdb.prisma, admin.id, publishInput(0))).rejects.toMatchObject({ code: "library_no_draft" });
    const draft = await importDraft(admin, testLibrary());
    await expect(publishDraft(tdb.prisma, admin.id, publishInput(draft.revision + 1)))
      .rejects.toMatchObject({ code: "library_conflict" });
    await expect(publishDraft(tdb.prisma, admin.id, publishInput(draft.revision, { note: "  " })))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect((await state()).publishedVersionId).toBeNull();
  });

  it("refuses removing a contraindication an athlete profile uses", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    await makeProfile({ injuries: [{ key: "test_knee", side: null, severity: "moderate", notes: null, since: null }] });
    const before = await state();
    const draft = await importDraft(admin, { ...testLibrary(), contraindications: [] });
    const outcome = await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.findings).toContainEqual(expect.objectContaining({
      code: "contraindication_in_use", ref: "test_knee", entity: "reference", level: "error",
    }));
    expect(await state()).toEqual({ ...before, draftVersionId: draft.id });
  });

  it("refuses removing a movement a PR uses, unless a rename covers it", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    await makePr("Test Squat");

    const draft = await openDraft(tdb.prisma, admin.id);
    const removed = await deleteMovement(tdb.prisma, admin.id, { revision: draft.revision, name: "Test Squat" });
    const refused = await publishDraft(tdb.prisma, admin.id, publishInput(removed));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.findings).toContainEqual(expect.objectContaining({ code: "movement_in_use", ref: "Test Squat" }));
  });

  it("accepts a removal covered by a rename", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    await makePr("Test Squat");
    const draft = await openDraft(tdb.prisma, admin.id);
    const revision = await renameMovement(tdb.prisma, admin.id, {
      revision: draft.revision, from: "Test Squat", to: "Test Deep Squat",
    });
    expect((await publishDraft(tdb.prisma, admin.id, publishInput(revision))).ok).toBe(true);
  });

  it("refuses a rename whose target is deleted", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    await makePr("Test Squat");
    const draft = await openDraft(tdb.prisma, admin.id);
    const renamedRevision = await renameMovement(tdb.prisma, admin.id, {
      revision: draft.revision, from: "Test Squat", to: "Test Deep Squat",
    });
    const revision = await deleteMovement(tdb.prisma, admin.id, { revision: renamedRevision, name: "Test Deep Squat" });
    const outcome = await publishDraft(tdb.prisma, admin.id, publishInput(revision));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.findings).toContainEqual(expect.objectContaining({ code: "movement_in_use", ref: "Test Squat" }));
  });

  it("refuses a save against the revision that was published", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const draft = await importDraft(admin, testLibrary());
    await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision));
    await expect(saveMovement(tdb.prisma, admin.id, {
      revision: draft.revision, originalName: null, movement: testMovement("Test Extra"),
    })).rejects.toMatchObject({ code: "library_no_draft" });
    const row = await tdb.prisma.domainLibraryVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.movements).toHaveLength(2);
  });

  it("refuses turning a lift with PRs into a non-lift", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    await makePr("Test Squat");
    const draft = await openDraft(tdb.prisma, admin.id);
    const revision = await saveMovement(tdb.prisma, admin.id, {
      revision: draft.revision, originalName: "Test Squat",
      movement: testMovement("Test Squat", { equipment: [], substitutes: ["Test Press"] }),
    });
    const outcome = await publishDraft(tdb.prisma, admin.id, publishInput(revision));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.findings).toContainEqual(expect.objectContaining({ code: "lift_in_use", ref: "Test Squat" }));
  });

  it("checks references created after the draft was opened", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    const draft = await openDraft(tdb.prisma, admin.id);
    const revision = await deleteMovement(tdb.prisma, admin.id, { revision: draft.revision, name: "Test Squat" });
    await makePr("Test Squat");
    const outcome = await publishDraft(tdb.prisma, admin.id, publishInput(revision));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.findings).toContainEqual(expect.objectContaining({ code: "movement_in_use", ref: "Test Squat" }));
  });

  it("applies renames to PRs, barbell blocks and profiles", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    const athlete = await makePr("Test Squat");
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const block = await makeBarbellBlock(tdb.prisma, program.id, 0, "Test Squat");
    const profile = await makeProfile({
      benchmarks: [{ movement: "Test Squat", kind: "1rm", value: 100, unit: "kg", recordedAt: null }],
      goals: [{ movement: "Test Squat", description: "Test goal" }, { movement: null, description: "Test other" }],
    });

    const draft = await openDraft(tdb.prisma, admin.id);
    const first = await renameMovement(tdb.prisma, admin.id, {
      revision: draft.revision, from: "Test Squat", to: "Test Deep Squat",
    });
    const revision = await renameMovement(tdb.prisma, admin.id, {
      revision: first, from: "Test Deep Squat", to: "Test Low Squat",
    });
    expect(await publishDraft(tdb.prisma, admin.id, publishInput(revision))).toEqual({ ok: true, number: 2 });

    const pr = await tdb.prisma.personalRecord.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(pr.movement).toBe("Test Low Squat");
    expect((await tdb.prisma.block.findUniqueOrThrow({ where: { id: block.id } })).movement).toBe("Test Low Squat");
    const stored = await tdb.prisma.athleteProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const data = stored.data as unknown as AthleteProfile;
    expect(data.benchmarks[0].movement).toBe("Test Low Squat");
    expect(data.goals.map((g) => g.movement)).toEqual(["Test Low Squat", null]);
    const version = await tdb.prisma.domainLibraryVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(version.renames).toEqual([]);
  });

  it("needs acceptWarnings when only warnings are found", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const library = testLibrary();
    const lonely = { ...library, movements: [...library.movements, testMovement("Test Lonely")] };
    const draft = await importDraft(admin, lonely);
    const refused = await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision, { acceptWarnings: false }));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.findings.length).toBeGreaterThan(0);
    expect(refused.findings.every((f) => f.level === "warning")).toBe(true);
    expect((await state()).publishedVersionId).toBeNull();
    expect(await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision))).toEqual({ ok: true, number: 1 });
  });

  it("refuses a publish when the live version changed since the draft was opened", async () => {
    const admin = await makeAdmin(tdb.prisma);
    const stale = await importDraft(admin, testLibrary());
    const other = await tdb.prisma.domainLibraryVersion.create({
      data: {
        number: 9, movements: [], contraindications: [], taxonomy: {}, conversions: {}, expectations: [], evalCases: [],
        publishedAt: new Date(),
      },
    });
    await tdb.prisma.domainLibraryState.update({ where: { id: 1 }, data: { publishedVersionId: other.id } });
    await expect(publishDraft(tdb.prisma, admin.id, publishInput(stale.revision)))
      .rejects.toMatchObject({ code: "library_conflict" });
    expect((await state()).publishedVersionId).toBe(other.id);
    expect((await readDraft(tdb.prisma))?.id).toBe(stale.id);
  });

  it("archives the previous live version", async () => {
    const admin = await makeAdmin(tdb.prisma);
    await publishLive(admin);
    const draft = await openDraft(tdb.prisma, admin.id);
    expect(await publishDraft(tdb.prisma, admin.id, publishInput(draft.revision))).toEqual({ ok: true, number: 2 });
    expect((await listVersions(tdb.prisma)).map((v) => [v.number, v.state])).toEqual([[2, "live"], [1, "archived"]]);
  });
});
