import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { fakePush } from "../../helpers/fake-push";
import {
  enroll, makeAthlete, makeBarbellBlock, makeClosed, makeCoach, makeContinuous, makeCustomBlock, makeSubscription, publishWeek,
} from "../../helpers/factories";
import {
  adaptationToKeep, deleteResult, getCoachBlockResults, getDayResults, getLeaderboard, getMyResult, listAthleteResults, listBlockResults, saveResult, toggleFistBump,
} from "@/lib/training/services/results";
import { deliver } from "@/lib/notifications/notify";
import { component, coupletDraft, fixtureDomain, toTailoringDraft, couplet } from "../../fixtures/workouts";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { RestrictionDraftSchema, emptyProfile } from "@/lib/engine/types";
import { acceptAdaptation, adaptAnalyze, adaptTailor, discardAdaptation, getAdaptation, snapshotOf } from "@/lib/training/services/adaptations";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });
afterEach(() => { vi.restoreAllMocks(); });

const NOW = new Date("2026-10-07T18:00:00Z"); // Wednesday of week 0 (program starts Monday 2026-10-05)

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
  await publishWeek(tdb.prisma, program.id, 0);
  const [ana, ben, cai] = [await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma)];
  for (const a of [ana, ben, cai]) await enroll(tdb.prisma, program.id, a.id);
  const wod = await makeCustomBlock(tdb.prisma, program.id, 2, { scoring: "for_time", timeCapSeconds: 900 });
  return { coach, program, ana, ben, cai, wod };
}
const log = (athlete: { id: string; timezone: string }, blockId: string, score: unknown, division: "rx" | "scaled" = "rx") =>
  saveResult(tdb.prisma, athlete, { blockId, division, score, notes: null }, NOW);

describe("results", () => {
  it("saves one result per athlete and block, editing it in place", async () => {
    const { ana, wod } = await setup();
    await log(ana, wod.id, { seconds: 600 });
    await log(ana, wod.id, { seconds: 580 });
    expect(await tdb.prisma.result.count()).toBe(1);
    const mine = await getMyResult(tdb.prisma, ana.id, wod.id);
    expect(mine).toMatchObject({ sortKey: -580, capped: false });
    expect(mine?.performedOn.toISOString().slice(0, 10)).toBe("2026-10-07");
  });

  it("refuses future days, unscored blocks, invalid scores and strangers", async () => {
    const { program, ana, wod } = await setup();
    const tomorrow = await makeCustomBlock(tdb.prisma, program.id, 3);
    const noScore = await makeCustomBlock(tdb.prisma, program.id, 2, { scoring: "none", position: 1 });
    const stranger = await makeAthlete(tdb.prisma);
    await expect(log(ana, tomorrow.id, { seconds: 600 })).rejects.toMatchObject({ code: "not_loggable" });
    await expect(log(ana, noScore.id, {})).rejects.toMatchObject({ code: "not_loggable" });
    await expect(log(ana, wod.id, { seconds: 901 })).rejects.toMatchObject({ code: "invalid_score" });
    await expect(log(stranger, wod.id, { seconds: 600 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("ranks the leaderboard and keeps removed athletes out of it", async () => {
    const { coach, ana, ben, cai, wod } = await setup();
    await log(ana, wod.id, { seconds: 640 });
    await log(ben, wod.id, { seconds: 600 }, "scaled");
    await log(cai, wod.id, { capped: true, reps: 90 });
    const board = await getLeaderboard(tdb.prisma, { athlete: ana }, wod.id);
    expect(board.date).toBe("2026-10-07");
    expect(board.entries.map((e) => [e.displayName === ana.displayName, e.formatted, e.rank])).toEqual([
      [true, "10:40", 1], [false, "CAP · 90", 2], [false, "10:00", 3],
    ]);
    expect(board.entries[0].own).toBe(true);
    await tdb.prisma.enrollment.updateMany({ where: { athleteId: cai.id }, data: { removedAt: new Date() } });
    const coachView = await getLeaderboard(tdb.prisma, { coachId: coach.id }, wod.id);
    expect(coachView.entries).toHaveLength(2);
  });

  it("has no leaderboard for barbell blocks or closed programs", async () => {
    const { program, ana } = await setup();
    const squat = await makeBarbellBlock(tdb.prisma, program.id, 2);
    await expect(getLeaderboard(tdb.prisma, { athlete: ana }, squat.id)).rejects.toMatchObject({ code: "not_found" });
    const closed = await makeClosed(tdb.prisma, program.coachId!, 2, true);
    await enroll(tdb.prisma, closed.id, ana.id, "2026-10-05");
    const wod = await makeCustomBlock(tdb.prisma, closed.id, 0);
    await expect(getLeaderboard(tdb.prisma, { athlete: ana }, wod.id)).rejects.toMatchObject({ code: "not_found" });
    await log(ana, wod.id, { seconds: 300 }); // results are still stored in closed programs
    expect(await getMyResult(tdb.prisma, ana.id, wod.id)).not.toBeNull();
  });

  it("toggles fist bumps but never on your own result", async () => {
    const { ana, ben, wod } = await setup();
    const { resultId } = await log(ana, wod.id, { seconds: 640 });
    expect(await toggleFistBump(tdb.prisma, ben, resultId)).toMatchObject({ bumped: true, count: 1 });
    expect(await toggleFistBump(tdb.prisma, ben, resultId)).toMatchObject({ bumped: false, count: 0, intents: [] });
    await expect(toggleFistBump(tdb.prisma, ana, resultId)).rejects.toMatchObject({ code: "own_result" });
    await toggleFistBump(tdb.prisma, ben, resultId);
    const board = await getLeaderboard(tdb.prisma, { athlete: ben }, wod.id);
    expect(board.entries[0]).toMatchObject({ bumps: 1, bumpedByViewer: true });
  });

  it("offers to record the logged set that beats its rep count with the highest estimate", async () => {
    const { program, ana } = await setup();
    const squat = await makeBarbellBlock(tdb.prisma, program.id, 2, "Test Back Squat", [{ reps: 1, percent: 90, kg: null }]);
    await tdb.prisma.personalRecord.create({ data: { athleteId: ana.id, movement: "Test Back Squat", kind: "lift", kg: 150, reps: 1, achievedOn: new Date("2026-09-01T00:00:00Z") } });
    await tdb.prisma.personalRecord.create({ data: { athleteId: ana.id, movement: "Test Back Squat", kind: "lift", kg: 95, reps: 3, achievedOn: new Date("2026-09-01T00:00:00Z") } });
    const lighter = await log(ana, squat.id, { sets: [{ kg: 140, reps: 1 }] });
    expect(lighter.singlePrompt).toBeNull();
    const heavier = await log(ana, squat.id, { sets: [{ kg: 155, reps: 1 }] });
    expect(heavier.singlePrompt).toEqual({ movement: "Test Back Squat", reps: 1, from: 150, to: 155 });
    // 100x3 beats the stored 95x3 (estimate 110); 90x5 is a first 5RM but estimates only 105.
    const triple = await log(ana, squat.id, { sets: [{ kg: 100, reps: 3 }, { kg: 90, reps: 5 }] });
    expect(triple.singlePrompt).toEqual({ movement: "Test Back Squat", reps: 3, from: 95, to: 100 });
    expect((await getMyResult(tdb.prisma, ana.id, squat.id))?.division).toBe("rx");
  });

  it("offers no record for a barbell movement outside the records catalog", async () => {
    const { program, ana } = await setup();
    const bench = await makeBarbellBlock(tdb.prisma, program.id, 2, "Test Bench Press", [{ reps: 1, percent: null, kg: 100 }]);
    expect((await log(ana, bench.id, { sets: [{ kg: 100, reps: 1 }] })).singlePrompt).toBeNull();
  });

  it("deletes a result and counts the day's scores", async () => {
    const { program, ana, ben, wod } = await setup();
    await log(ana, wod.id, { seconds: 640 });
    await log(ben, wod.id, { seconds: 600 });
    const day = await getDayResults(tdb.prisma, ana.id, program.id, [wod.id]);
    expect(day.counts.get(wod.id)).toBe(2);
    expect(day.mine.get(wod.id)?.sortKey).toBe(-640);
    await deleteResult(tdb.prisma, ana, wod.id, NOW);
    expect(await getMyResult(tdb.prisma, ana.id, wod.id)).toBeNull();
    await expect(deleteResult(tdb.prisma, ana, wod.id, NOW)).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses deleting a result the athlete can no longer see", async () => {
    const { program, ana, wod } = await setup();
    await log(ana, wod.id, { seconds: 640 });
    await tdb.prisma.enrollment.updateMany({ where: { programId: program.id, athleteId: ana.id }, data: { removedAt: NOW } });
    await expect(deleteResult(tdb.prisma, ana, wod.id, NOW)).rejects.toMatchObject({ code: "not_found" });
    expect(await getMyResult(tdb.prisma, ana.id, wod.id)).not.toBeNull();
  });

  it("exposes what an untitled block needs to be labelled in coach rows", async () => {
    const { coach, program, ana, wod } = await setup();
    await tdb.prisma.block.update({ where: { id: wod.id }, data: { title: null } });
    await log(ana, wod.id, { seconds: 640 });
    const row = (await listAthleteResults(tdb.prisma, coach.id, program.id, ana.id)).results[0];
    expect(row).toMatchObject({ blockTitle: null, blockMovement: null, blockKind: "custom", blockScoring: "for_time" });
  });

  it("lists results for the coach, by block and by athlete", async () => {
    const { coach, program, ana, wod } = await setup();
    const other = await makeCoach(tdb.prisma);
    await log(ana, wod.id, { seconds: 640 });
    expect((await listBlockResults(tdb.prisma, coach.id, wod.id)).results[0]).toMatchObject({ formatted: "10:40", performedOn: "2026-10-07" });
    expect((await listAthleteResults(tdb.prisma, coach.id, program.id, ana.id)).results).toHaveLength(1);
    await expect(listBlockResults(tdb.prisma, other.id, wod.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listAthleteResults(tdb.prisma, other.id, program.id, ana.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("gives the coach the leaderboard for leaderboard blocks and the list otherwise", async () => {
    const { coach, program, ana, wod } = await setup();
    const squat = await makeBarbellBlock(tdb.prisma, program.id, 1);
    await log(ana, wod.id, { seconds: 640 });
    expect(await getCoachBlockResults(tdb.prisma, coach.id, wod.id)).toMatchObject({ results: null, entries: [{ rank: 1, formatted: "10:40" }] });
    expect(await getCoachBlockResults(tdb.prisma, coach.id, squat.id)).toMatchObject({ entries: null, results: [] });
  });

  it("hides a disabled athlete's results from leaderboards, counts and coach views", async () => {
    const { coach, program, ana, ben, wod } = await setup();
    await log(ana, wod.id, { seconds: 600 });
    await log(ben, wod.id, { seconds: 700 });
    const anaResult = await tdb.prisma.result.findFirstOrThrow({ where: { athleteId: ana.id } });
    await toggleFistBump(tdb.prisma, ben, anaResult.id);
    const benResult = await tdb.prisma.result.findFirstOrThrow({ where: { athleteId: ben.id } });
    await tdb.prisma.fistBump.create({ data: { resultId: benResult.id, athleteId: ana.id } });

    await tdb.prisma.athleteAccount.update({ where: { id: ana.id }, data: { disabledAt: new Date() } });

    const board = await getLeaderboard(tdb.prisma, { athlete: ben }, wod.id);
    expect(board.entries).toHaveLength(1);
    expect(board.entries[0]).toMatchObject({ athleteId: ben.id, bumps: 1 }); // the disabled athlete's bump still counts
    const { counts } = await getDayResults(tdb.prisma, ben.id, program.id, [wod.id]);
    expect(counts.get(wod.id)).toBe(1);
    expect((await listBlockResults(tdb.prisma, coach.id, wod.id)).results).toHaveLength(1);
    expect((await getCoachBlockResults(tdb.prisma, coach.id, wod.id)).entries).toHaveLength(1);
    expect((await listAthleteResults(tdb.prisma, coach.id, program.id, ana.id)).results).toHaveLength(0);
  });

  it("leaves results of athletes removed from the program out of the coach's block list", async () => {
    const { coach, program, ana, ben, wod } = await setup();
    await log(ana, wod.id, { seconds: 600 });
    await log(ben, wod.id, { seconds: 700 });
    await tdb.prisma.enrollment.update({
      where: { programId_athleteId: { programId: program.id, athleteId: ana.id } }, data: { removedAt: new Date() },
    });
    expect((await listBlockResults(tdb.prisma, coach.id, wod.id)).results.map((r) => r.athleteId)).toEqual([ben.id]);
  });
});

describe("fist bump notifications", () => {
  it("returns one intent to the result's athlete only when bumping", async () => {
    const { ana, ben, wod } = await setup();
    const { resultId } = await log(ana, wod.id, { seconds: 640 });
    const on = await toggleFistBump(tdb.prisma, ben, resultId);
    expect(on.intents).toHaveLength(1);
    expect(on.intents[0]).toMatchObject({
      kind: "fist_bump", entityId: resultId, programId: null, groupKey: `fist_bump:${resultId}`,
      data: {
        resultId, blockId: wod.id, latestName: ben.displayName, count: 1,
        block: { title: "WOD", movement: null, kind: "custom", scoring: "for_time" },
      },
    });
    expect(on.intents[0].recipients.map((r) => r.userId)).toEqual([ana.userId]);
    expect((await toggleFistBump(tdb.prisma, ben, resultId)).intents).toEqual([]);
  });

  it("gives no intent when the result's athlete is disabled", async () => {
    const { ana, ben, wod } = await setup();
    const { resultId } = await log(ana, wod.id, { seconds: 640 });
    await tdb.prisma.athleteAccount.update({ where: { id: ana.id }, data: { disabledAt: new Date() } });
    const r = await toggleFistBump(tdb.prisma, ben, resultId);
    expect(r).toMatchObject({ bumped: true, count: 1, intents: [] });
  });

  it("refuses to bump the result of an athlete who left or was removed", async () => {
    const { program, ana, ben, cai, wod } = await setup();
    const { resultId: anaResult } = await log(ana, wod.id, { seconds: 640 });
    const { resultId: caiResult } = await log(cai, wod.id, { seconds: 700 });
    await tdb.prisma.enrollment.updateMany({ where: { programId: program.id, athleteId: ana.id }, data: { leftAt: new Date() } });
    await tdb.prisma.enrollment.updateMany({ where: { programId: program.id, athleteId: cai.id }, data: { removedAt: new Date() } });
    await expect(toggleFistBump(tdb.prisma, ben, anaResult)).rejects.toMatchObject({ code: "not_found" });
    await expect(toggleFistBump(tdb.prisma, ben, caiResult)).rejects.toMatchObject({ code: "not_found" });
    expect(await tdb.prisma.fistBump.count()).toBe(0);
  });

  it("keeps one unread row per result through bump, bump, unbump, bump", async () => {
    const { ana, ben, cai, wod } = await setup();
    const { resultId } = await log(ana, wod.id, { seconds: 640 });
    await makeSubscription(tdb.prisma, ana.userId, "https://push.test/ana");
    const { sender, calls } = fakePush();
    const send = async (who: typeof ben) => {
      const r = await toggleFistBump(tdb.prisma, who, resultId);
      await deliver(tdb.prisma, r.intents, sender);
      return r;
    };
    await send(ben);
    await send(cai);
    await tdb.prisma.notification.updateMany({ data: { readAt: new Date() } });
    expect((await send(ben)).intents).toEqual([]); // unbump
    const again = await send(ben);
    expect(again.count).toBe(2);
    const rows = await tdb.prisma.notification.findMany({ where: { kind: "fist_bump" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ana.userId, readAt: null, groupKey: `fist_bump:${resultId}` });
    expect(rows[0].data).toMatchObject({ latestName: ben.displayName, count: 2 });
    expect(calls.map((c) => c.payload.tag)).toEqual(Array(3).fill(`fist_bump:${resultId}`));
  });

  it("deleting the result removes the grouped inbox row", async () => {
    const { ana, ben, wod } = await setup();
    const { resultId } = await log(ana, wod.id, { seconds: 640 });
    await deliver(tdb.prisma, (await toggleFistBump(tdb.prisma, ben, resultId)).intents, null);
    expect(await tdb.prisma.notification.count()).toBe(1);
    await deleteResult(tdb.prisma, ana, wod.id, NOW);
    expect(await tdb.prisma.notification.count()).toBe(0);
  });
});

describe("results with adaptations", () => {
  const ctx = { profile: emptyProfile(), domain: fixtureDomain(), libraryVersion: 1, locale: "en" as const };
  const overhead = RestrictionDraftSchema.parse({
    site: "shoulder", side: "right", movements: [], mechanisms: ["overhead"], positions: [], evidence: "my shoulder hurts overhead",
  });

  /** Runs the conversation to an accepted adaptation for a custom block (barbell blocks reuse the same draft). */
  async function adapt(athlete: { id: string; timezone: string }, blockId: string) {
    const draft = toTailoringDraft(couplet());
    draft.blocks[0].components = [component("Test Goblet", { reps: "21-15-9" }), component("Test Row", { reps: "21-15-9" })];
    draft.changes = [{ blockIndex: 0, original: "Test Combo", modified: "Test Goblet", reason: "No overhead." }];
    draft.rawText = "Test Workout\n21-15-9 for time\nTest Goblet\nTest Row";
    const p = new FakeProvider({
      BlockAnalysis: coupletDraft(),
      SituationAnalysis: { restrictions: [overhead], conditions: [], unavailableEquipment: [] },
      TailoringResult: draft,
    });
    await adaptAnalyze(tdb.prisma, p, athlete, blockId, { text: "my shoulder hurts overhead" }, ctx, NOW);
    await adaptTailor(tdb.prisma, p, athlete, blockId, { ...ctx, onProgress: () => {} }, NOW);
    return acceptAdaptation(tdb.prisma, athlete, blockId, NOW);
  }
  async function enableTailoring(coachId: string, programId: string) {
    await tdb.prisma.coachAccount.update({ where: { id: coachId }, data: { tailoringEnabled: true } });
    await tdb.prisma.program.update({ where: { id: programId }, data: { tailoringEnabled: true } });
  }

  it("saving with an active adaptation stores scaled and the snapshot", async () => {
    const { coach, program, ana, wod } = await setup();
    await enableTailoring(coach.id, program.id);
    const accepted = await adapt(ana, wod.id);
    const { messages } = (await getAdaptation(tdb.prisma, ana.id, wod.id))!;
    const r = await log(ana, wod.id, { seconds: 600 }, "rx");
    expect(r.singlePrompt).toBeNull();
    const row = await getMyResult(tdb.prisma, ana.id, wod.id);
    expect(row?.division).toBe("scaled");
    expect(row?.adaptation).toEqual(snapshotOf(accepted, messages));
  });

  it("sticky: after discard, saving rx stays scaled", async () => {
    const { coach, program, ana, wod } = await setup();
    await enableTailoring(coach.id, program.id);
    await adapt(ana, wod.id);
    await log(ana, wod.id, { seconds: 600 });
    const before = (await getMyResult(tdb.prisma, ana.id, wod.id))!;
    await discardAdaptation(tdb.prisma, ana.id, wod.id);
    await log(ana, wod.id, { seconds: 590 }, "rx");
    const after = (await getMyResult(tdb.prisma, ana.id, wod.id))!;
    expect(after.division).toBe("scaled");
    expect(after.adaptation).toEqual(before.adaptation);
    expect(after.adaptation).not.toBeNull();
  });

  it("sticky: a stored snapshot the schema no longer accepts is kept as stored, and the result stays scaled", async () => {
    const { ana, wod } = await setup();
    await log(ana, wod.id, { seconds: 600 });
    const legacy = { text: "Test legacy snapshot" };
    await tdb.prisma.result.updateMany({ where: { blockId: wod.id, athleteId: ana.id }, data: { adaptation: legacy, division: "scaled" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await adaptationToKeep(tdb.prisma, ana.id, wod)).toEqual(legacy);
    await log(ana, wod.id, { seconds: 590 }, "rx");
    const row = await tdb.prisma.result.findUniqueOrThrow({ where: { blockId_athleteId: { blockId: wod.id, athleteId: ana.id } } });
    expect(row.division).toBe("scaled");
    expect(row.adaptation).toEqual(legacy);
    expect(logged).toHaveBeenCalled();
  });

  it("stale adaptation does not tag a new result", async () => {
    const { coach, program, ana, wod } = await setup();
    await enableTailoring(coach.id, program.id);
    await adapt(ana, wod.id);
    await tdb.prisma.block.update({ where: { id: wod.id }, data: { description: "Test edited description" } });
    await log(ana, wod.id, { seconds: 600 }, "rx");
    const row = (await getMyResult(tdb.prisma, ana.id, wod.id))!;
    expect(row.adaptation).toBeNull();
    expect(row.division).toBe("rx");
  });

  it("barbell with adaptation: rx, snapshot, no 1RM prompt", async () => {
    const { coach, program, ana } = await setup();
    await enableTailoring(coach.id, program.id);
    const bar = await makeBarbellBlock(tdb.prisma, program.id, 2);
    await adapt(ana, bar.id);
    const r = await saveResult(tdb.prisma, ana, {
      blockId: bar.id, division: "rx", score: { sets: [{ kg: 400, reps: 1 }] }, notes: null,
    }, NOW);
    expect(r.singlePrompt).toBeNull();
    const row = (await getMyResult(tdb.prisma, ana.id, bar.id))!;
    expect(row.division).toBe("rx");
    expect(row.adaptation).not.toBeNull();
  });

  it("coach rows expose the snapshot; athlete leaderboard entries do not", async () => {
    const { coach, program, ana, ben, wod } = await setup();
    await enableTailoring(coach.id, program.id);
    await adapt(ana, wod.id);
    await log(ana, wod.id, { seconds: 600 });
    await log(ben, wod.id, { seconds: 610 });
    const board = await getLeaderboard(tdb.prisma, { athlete: ben }, wod.id);
    expect(board.entries.map((e) => [e.athleteId === ana.id, e.adapted])).toEqual([[false, false], [true, true]]); // scaled ranks below rx
    expect(board.entries.every((e) => !("adaptation" in e))).toBe(true);
    const { results } = await listBlockResults(tdb.prisma, coach.id, wod.id);
    expect(results.find((x) => x.athleteId === ana.id)?.adaptation?.situation).toEqual(["my shoulder hurts overhead"]);
    expect(results.find((x) => x.athleteId === ben.id)?.adaptation).toBeNull();
    // The coach's leaderboard path carries the snapshot too (wod has a leaderboard).
    const coachView = await getCoachBlockResults(tdb.prisma, coach.id, wod.id);
    expect(coachView.entries?.find((e) => e.athleteId === ana.id)?.adaptation?.situation).toEqual(["my shoulder hurts overhead"]);
    expect(coachView.entries?.find((e) => e.athleteId === ben.id)?.adaptation).toBeNull();
  });
});
