import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import {
  enroll, makeAthlete, makeBarbellBlock, makeCoach, makeContinuous, makeCustomBlock, makeResult, publishWeek,
} from "../../helpers/factories";
import { component, couplet, coupletDraft, fixtureDomain, identityResult, toTailoringDraft } from "../../fixtures/workouts";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { workoutHash } from "@/lib/training/block-engine";
import { RestrictionDraftSchema, emptyProfile, type Restriction, type TailoringDraft, type WorkoutDraft } from "@/lib/engine/types";
import {
  acceptAdaptation, adaptAnalyze, adaptTailor, discardAdaptation, getAdaptation, snapshotOf,
} from "@/lib/training/services/adaptations";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const NOW = new Date("2026-10-05T10:00:00Z"); // Monday, day 0 of the program
const domain = fixtureDomain();
const ctx = { profile: emptyProfile(), domain, libraryVersion: 1, locale: "en" as const };

const restriction = (patch: Partial<Restriction>) => RestrictionDraftSchema.parse({
  site: null, side: null, movements: [], mechanisms: [], positions: [], evidence: "x", ...patch,
});
const situation = (restrictions: unknown[] = []) => ({ restrictions, conditions: [], unavailableEquipment: [] });
const overheadToday = restriction({ site: "shoulder", side: "right", mechanisms: ["overhead"], evidence: "my shoulder hurts overhead" });

/** Test Combo → Test Goblet and Test Pull → Test Row: nothing overhead, nothing hanging. */
function safeDraft(): TailoringDraft {
  const d = toTailoringDraft(couplet());
  d.blocks[0].components = [
    component("Test Goblet", { reps: "21-15-9", loadKg: { male: 24, female: 16 } }),
    component("Test Row", { reps: "21-15-9" }),
  ];
  d.changes = [{ blockIndex: 0, original: "Test Combo", modified: "Test Goblet", reason: "No overhead." }];
  d.rawText = "Test Workout\n21-15-9 for time\nTest Goblet\nTest Row";
  return d;
}
const unsafeDraft = () => toTailoringDraft(couplet()); // keeps the overhead Test Combo

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  await tdb.prisma.coachAccount.update({ where: { id: coach.id }, data: { tailoringEnabled: true } });
  const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
  await tdb.prisma.program.update({ where: { id: program.id }, data: { tailoringEnabled: true } });
  await publishWeek(tdb.prisma, program.id, 0);
  const athlete = await makeAthlete(tdb.prisma);
  await enroll(tdb.prisma, program.id, athlete.id);
  const block = await makeCustomBlock(tdb.prisma, program.id, 0);
  return { program, athlete, block };
}

type Athlete = { id: string; timezone: string };
const say = (p: FakeProvider, a: Athlete, blockId: string, text: string) =>
  adaptAnalyze(tdb.prisma, p, a, blockId, { text }, ctx, NOW);
const tailorNow = (p: FakeProvider, a: Athlete, blockId: string) =>
  adaptTailor(tdb.prisma, p, a, blockId, { ...ctx, onProgress: () => {} }, NOW);

/** First message with no questions, then a proposal. */
async function proposed(scripts: Record<string, unknown> = {}) {
  const s = await setup();
  const p = new FakeProvider({ BlockAnalysis: coupletDraft(), SituationAnalysis: situation([overheadToday]), TailoringResult: safeDraft(), ...scripts });
  await say(p, s.athlete, s.block.id, "my shoulder hurts overhead");
  const result = await tailorNow(p, s.athlete, s.block.id);
  return { ...s, p, result };
}

describe("adaptation conversation", () => {
  it("first message with no questions then tailor gives a proposal", async () => {
    const { athlete, block } = await setup();
    const p = new FakeProvider({ BlockAnalysis: coupletDraft(), SituationAnalysis: situation([overheadToday]), TailoringResult: safeDraft() });
    const analyzed = await say(p, athlete, block.id, "my shoulder hurts overhead");
    expect(analyzed.questions).toEqual([]);
    expect(analyzed.reanalyzed).toBe(true);

    const result = await tailorNow(p, athlete, block.id);
    expect(result.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Test Goblet", "Test Row"]);
    // the tailor prompt carries the athlete's words and the block's locked format
    const tailorCall = p.calls.find((c) => c.schemaName === "TailoringResult")!;
    expect(tailorCall.prompt).toContain("my shoulder hurts overhead");

    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.messages.map((m) => m.role)).toEqual(["athlete", "proposal"]);
    expect(a.messages[0]).toMatchObject({ role: "athlete", text: "my shoulder hurts overhead", at: NOW.toISOString() });
    expect(a.state!.last!.tailored).toEqual(result.tailored);
    expect(a.state!.pendingQuestions).toEqual([]);
    expect(a.state!.feedback).toBeNull();
    expect(a.accepted).toBeNull();
  });

  it("a site question is stored, answered by button, then tailored", async () => {
    const { athlete, block } = await setup();
    const vague = restriction({ site: "shoulder", evidence: "my shoulder hurts" });
    const p = new FakeProvider({ BlockAnalysis: coupletDraft(), SituationAnalysis: situation([vague]), TailoringResult: safeDraft() });
    const { questions } = await say(p, athlete, block.id, "my shoulder hurts");
    expect(questions).toEqual([expect.objectContaining({ kind: "site", restriction: 0, site: "shoulder" })]);
    expect((await getAdaptation(tdb.prisma, athlete.id, block.id))!.state!.pendingQuestions).toEqual(questions);

    await expect(tailorNow(p, athlete, block.id)).rejects.toMatchObject({ code: "invalid_state" });

    const calls = p.calls.length;
    const answered = await adaptAnalyze(tdb.prisma, p, athlete, block.id, {
      answers: [{ kind: "site", restriction: 0, mechanisms: ["overhead"] }],
    }, ctx, NOW);
    expect(answered).toEqual({ questions: [], reanalyzed: false });
    expect(p.calls).toHaveLength(calls); // a button answer calls no model

    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.state!.restrictions[0].mechanisms).toEqual(["overhead"]);
    expect(a.state!.pendingQuestions).toEqual([]);

    await tailorNow(p, athlete, block.id);
    const after = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(after.messages.map((m) => m.role)).toEqual(["athlete", "question", "answer", "proposal"]);
    expect(after.state!.last!.restrictions[0].mechanisms).toEqual(["overhead"]);
  });

  it("a typed answer to a site question is read once and replaces the vague restriction", async () => {
    const { athlete, block } = await setup();
    const vague = restriction({ site: "shoulder", evidence: "my shoulder hurts" });
    const hanging = restriction({ positions: ["hanging"], evidence: "only when I hang" });
    const p = new FakeProvider({ BlockAnalysis: coupletDraft(), SituationAnalysis: sequence(situation([vague]), situation([hanging])) });
    await say(p, athlete, block.id, "my shoulder hurts");
    const { questions } = await say(p, athlete, block.id, "only when I hang");
    expect(questions).toEqual([]);
    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.state!.restrictions).toEqual([expect.objectContaining({ site: "shoulder", positions: ["hanging"] })]);
    expect(a.state!.feedback).toBe("my shoulder hurts"); // the answer is not new feedback
    expect(a.messages.map((m) => m.role)).toEqual(["athlete", "question", "answer"]);
    const accepted = { tailored: identityResult(couplet()), findings: [], workoutHash: "h", acceptedAt: NOW.toISOString() };
    expect(snapshotOf(accepted, a.messages).situation).toEqual(["my shoulder hurts", "only when I hang"]);
  });

  it("a message after a coach edit starts the engine session again and keeps the conversation", async () => {
    const { athlete, block } = await proposed();
    await tdb.prisma.block.update({ where: { id: block.id }, data: { description: "Test edited description" } });
    const p = new FakeProvider({ BlockAnalysis: coupletDraft(), SituationAnalysis: situation() });
    expect((await say(p, athlete, block.id, "again please")).reanalyzed).toBe(true);
    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.state!.last).toBeNull();
    expect(a.state!.feedback).toBe("my shoulder hurts overhead\nagain please");
    expect(a.messages.map((m) => m.role)).toEqual(["athlete", "proposal", "athlete"]);
  });

  it("the restart keeps the athlete's restrictions and missing equipment, and they still bind the proposal", async () => {
    const { athlete, block } = await proposed({
      SituationAnalysis: { restrictions: [overheadToday], conditions: [], unavailableEquipment: ["box"] },
    });
    await tdb.prisma.block.update({ where: { id: block.id }, data: { description: "Test edited description" } });
    const p = new FakeProvider({
      BlockAnalysis: coupletDraft(), SituationAnalysis: situation(), TailoringResult: sequence(unsafeDraft(), unsafeDraft()),
    });
    await say(p, athlete, block.id, "again please");
    const { state } = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(state!.restrictions).toEqual([expect.objectContaining({ site: "shoulder", mechanisms: ["overhead"], replacements: [] })]);
    expect(state!.unavailableEquipment).toEqual(["box"]);

    // the kept overhead restriction still refuses a proposal with the overhead Test Combo
    await expect(tailorNow(p, athlete, block.id)).rejects.toMatchObject({ name: "EngineUnsafeError" });
    const prompt = p.calls.find((c) => c.schemaName === "TailoringResult")!.prompt;
    expect(prompt).toContain("today_0: shoulder");
    expect(prompt).toContain("my shoulder hurts overhead");
  });

  it("second message refines", async () => {
    const { athlete, block } = await proposed();
    const p = new FakeProvider({ SituationAnalysis: situation(), TailoringResult: safeDraft() });
    const analyzed = await say(p, athlete, block.id, "too heavy");
    expect(analyzed).toEqual({ questions: [], reanalyzed: false }); // the stored block analysis is reused
    await tailorNow(p, athlete, block.id);

    expect(p.calls.map((c) => c.schemaName)).toEqual(["SituationAnalysis", "TailoringResult"]);
    const prompt = p.calls[1].prompt;
    expect(prompt).toContain("PREVIOUS ATTEMPT");
    expect(prompt).toContain("- too heavy");
    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.messages.map((m) => m.role)).toEqual(["athlete", "proposal", "athlete", "proposal"]);
    expect(a.state!.last!.feedbackHistory).toEqual(["too heavy"]);
    expect(a.state!.last!.restrictions.map((r) => r.site)).toEqual(["shoulder"]); // the first turn's restriction is kept
  });

  it("accept stores the current workoutHash and is idempotent", async () => {
    const { athlete, block } = await proposed();
    const result = await makeResult(tdb.prisma, block.id, athlete.id);
    const first = await acceptAdaptation(tdb.prisma, athlete, block.id, NOW);
    const row1 = await tdb.prisma.result.findUniqueOrThrow({ where: { id: result.id } });

    const second = await acceptAdaptation(tdb.prisma, athlete, block.id, new Date(NOW.getTime() + 60_000));
    const row2 = await tdb.prisma.result.findUniqueOrThrow({ where: { id: result.id } });

    expect(second).toEqual(first);
    expect(await tdb.prisma.blockAdaptation.count()).toBe(1);
    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.accepted).toEqual(first);
    expect(a.accepted!.acceptedAt).toBe(NOW.toISOString());
    expect(a.accepted!.workoutHash).toBe(workoutHash(await tdb.prisma.block.findUniqueOrThrow({ where: { id: block.id } })));
    expect(row2.updatedAt).toEqual(row1.updatedAt); // the result was updated once
  });

  it("accept after a coach edit throws block_changed", async () => {
    const { athlete, block } = await proposed();
    await tdb.prisma.block.update({ where: { id: block.id }, data: { description: "Test edited description" } });
    await expect(acceptAdaptation(tdb.prisma, athlete, block.id, NOW)).rejects.toMatchObject({ code: "block_changed" });
    expect((await getAdaptation(tdb.prisma, athlete.id, block.id))!.accepted).toBeNull();
  });

  it("accept turns an existing custom result into scaled with a snapshot", async () => {
    const { athlete, block } = await proposed();
    const result = await makeResult(tdb.prisma, block.id, athlete.id);
    const accepted = await acceptAdaptation(tdb.prisma, athlete, block.id, NOW);
    const row = await tdb.prisma.result.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.division).toBe("scaled");
    const { messages } = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(row.adaptation).toEqual(snapshotOf(accepted, messages));
    expect(row.adaptation).toEqual({
      text: safeDraft().rawText,
      changes: [{ blockIndex: 0, original: "Test Combo", modified: "Test Goblet", reason: "No overhead." }],
      safetyNote: null,
      situation: ["my shoulder hurts overhead"],
    });
  });

  it("keeps barbell results rx with a snapshot", async () => {
    const { program, athlete } = await setup();
    const barbell = await makeBarbellBlock(tdb.prisma, program.id, 0, "Test Squat");
    await tdb.prisma.personalRecord.create({
      data: { athleteId: athlete.id, movement: "Test Squat", kg: 100, achievedOn: new Date("2026-09-01T00:00:00Z") },
    });
    const draft: WorkoutDraft = {
      name: null,
      blocks: [{
        title: "Test Squat", rawText: "Test Squat 5 @ 80%", day: null, format: "strength", scheme: "5 @ 80%",
        timeDomainMinutes: 10, coachingNotes: null, stimulus: null,
        components: [component("Test Squat", { reps: 5, percent1RM: 80 })],
      }],
    };
    const tailored = toTailoringDraft({
      name: null, rawText: "Test Squat 5 @ 80%", source: "paste",
      blocks: [{ ...draft.blocks[0], components: [{ ...component("Test Squat", { reps: 5, percent1RM: 80 }), canonical: "Test Squat" }] }],
    });
    const p = new FakeProvider({ BlockAnalysis: draft, SituationAnalysis: situation(), TailoringResult: tailored });
    await say(p, athlete, barbell.id, "tired today");
    const pipeline = await tailorNow(p, athlete, barbell.id);
    expect(pipeline.original.blocks[0].components[0].loadKg).toEqual({ male: 80, female: 80 }); // the athlete's 1RM

    const result = await makeResult(tdb.prisma, barbell.id, athlete.id);
    await acceptAdaptation(tdb.prisma, athlete, barbell.id, NOW);
    const row = await tdb.prisma.result.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.division).toBe("rx");
    expect(row.adaptation).toMatchObject({ text: "Test Squat 5 @ 80%", situation: ["tired today"] });
  });

  it("discard keeps messages and leaves the result tagged", async () => {
    const { athlete, block } = await proposed();
    const result = await makeResult(tdb.prisma, block.id, athlete.id);
    await acceptAdaptation(tdb.prisma, athlete, block.id, NOW);
    const before = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;

    await discardAdaptation(tdb.prisma, athlete.id, block.id);
    const after = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(after.accepted).toBeNull();
    expect(after.messages).toEqual(before.messages);
    expect(after.state).toEqual(before.state);
    const row = await tdb.prisma.result.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.division).toBe("scaled");
    expect(row.adaptation).not.toBeNull();
  });

  it("switching the program off refuses the next message", async () => {
    const { program, athlete, block, p } = await proposed();
    await acceptAdaptation(tdb.prisma, athlete, block.id, NOW);
    await tdb.prisma.program.update({ where: { id: program.id }, data: { tailoringEnabled: false } });
    await expect(say(p, athlete, block.id, "more")).rejects.toMatchObject({ code: "tailoring_off" });
    expect((await getAdaptation(tdb.prisma, athlete.id, block.id))!.accepted).not.toBeNull();
  });

  it("unsafe proposal appends an error message and no proposal", async () => {
    const { athlete, block } = await setup();
    const p = new FakeProvider({
      BlockAnalysis: coupletDraft(), SituationAnalysis: situation([overheadToday]),
      TailoringResult: sequence(unsafeDraft(), unsafeDraft()),
    });
    await say(p, athlete, block.id, "my shoulder hurts overhead");
    await expect(tailorNow(p, athlete, block.id)).rejects.toMatchObject({ name: "EngineUnsafeError" });
    const a = (await getAdaptation(tdb.prisma, athlete.id, block.id))!;
    expect(a.messages.map((m) => m.role)).toEqual(["athlete", "error"]);
    expect(a.messages[1]).toMatchObject({ role: "error", code: "engine_unsafe" });
    expect(a.state!.last).toBeNull();
    expect(a.state!.feedback).toBe("my shoulder hurts overhead"); // the turn is kept, so it can be retried
  });
});
