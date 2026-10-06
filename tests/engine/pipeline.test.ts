import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import {
  EngineUnsafeError, analyzeFeedback, analyzeWorkout, runRefinePipeline, runTailorPipeline,
  type PipelineArgs, type ProgressStage,
} from "@/lib/engine/pipeline";
import { emptyProfile, emptyRequest, type ConfirmedCondition, type TailoringDraft } from "@/lib/engine/types";
import { FRAN_TEXT, component, fran, franDraft, sprint, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulderToday: ConfirmedCondition = { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro derecho" };
const pasteAnalysis = (conditions: unknown[] = [shoulderToday]) => ({ workout: franDraft(), conditions, unavailableEquipment: [] });

function safeDraft(): TailoringDraft {
  const d = toTailoringDraft(fran());
  d.blocks[0].components = [
    component("Kettlebell Goblet Squat", { reps: "21-15-9", loadKg: { male: 24, female: 16 } }),
    component("Ring Row", { reps: "21-15-9" }),
  ];
  d.changes = [{ blockIndex: 0, original: "Thruster", modified: "Kettlebell Goblet Squat", reason: "No overhead." }];
  return d;
}
const unsafeDraft = () => toTailoringDraft(fran()); // keeps Thruster and Pull-up

const run = (provider: FakeProvider, stages: ProgressStage[] = [], overrides: Partial<PipelineArgs> = {}) =>
  runTailorPipeline(provider, {
    original: fran(),
    confirmed: [shoulderToday],
    unavailableEquipment: [],
    profile: emptyProfile(),
    request: { ...emptyRequest(), situation: "me duele el hombro derecho" },
    domain,
    onProgress: (s) => stages.push(s),
    ...overrides,
  });

describe("analyzeWorkout", () => {
  it("suggests today's conditions without applying them, in one model call", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis() });
    const a = await analyzeWorkout(provider, { input: { kind: "paste", rawText: FRAN_TEXT }, situation: "me duele el hombro derecho", domain });
    expect(provider.calls).toHaveLength(1);
    expect(a.suggested).toEqual([shoulderToday]);
    expect(a.original.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster", "Pull-up"]);
    expect(a.analyzed).toBe(true);
  });

  it("analyzes a manual workout", async () => {
    const provider = new FakeProvider({ ManualAnalysis: { stimuli: [sprint], conditions: [], unavailableEquipment: [] } });
    const a = await analyzeWorkout(provider, {
      input: { kind: "manual", workout: { name: "Fran", blocks: [{
        title: "Fran", format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
        components: franDraft().blocks[0].components,
      }] } },
      situation: "", domain,
    });
    expect(a.original.source).toBe("manual");
    expect(a.original.blocks[0].stimulus).toEqual(sprint);
    expect(a.suggested).toEqual([]);
  });
});

describe("analyzeFeedback", () => {
  it("suggests the feedback's conditions and missing equipment", async () => {
    const knee = { key: "knee_pain", side: "left", severity: "mild", evidence: "la rodilla también" };
    const provider = new FakeProvider({ SituationAnalysis: { conditions: [knee], unavailableEquipment: ["kettlebell"] } });
    expect(await analyzeFeedback(provider, "la rodilla también, y no hay kettlebell", domain)).toEqual({
      suggested: [knee], unavailableEquipment: ["kettlebell"],
    });
  });
});

describe("runTailorPipeline", () => {
  it("tailors and validates against the confirmed conditions in one model call", async () => {
    const provider = new FakeProvider({ TailoringResult: safeDraft() });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["tailoring", "validating"]);
    expect(provider.calls).toHaveLength(1);
    expect(r.conditions).toEqual([{ ...shoulderToday, source: "today" }]);
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
    expect(r.findings.filter((f) => f.severity === "violation")).toEqual([]);
    expect(r.feedbackHistory).toEqual([]);
    expect(r.model).toBe("fake");
  });

  it("the confirmed severity decides: mild keeps the Thruster with a caution, moderate fails closed", async () => {
    const mild = await run(new FakeProvider({ TailoringResult: unsafeDraft() }), [], { confirmed: [{ ...shoulderToday, severity: "mild" }] });
    expect(mild.findings).toContainEqual(expect.objectContaining({ kind: "caution_movement", movement: "Thruster", severity: "warning" }));
    await expect(run(new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) }))).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("cuts a ruled-out condition's words from the situation, so the tailor never reads them", async () => {
    const provider = new FakeProvider({ TailoringResult: safeDraft() });
    await run(provider, [], {
      confirmed: [], dismissed: [{ key: "shoulder_impingement", evidence: "me duele el hombro derecho" }],
      request: { ...emptyRequest(), situation: "Cansado, me duele el hombro derecho." },
    });
    expect(provider.calls[0].prompt).not.toMatch(/hombro|shoulder/);
    expect(provider.calls[0].prompt).toContain("Cansado");
  });

  it("names a ruled-out condition when the analyzer paraphrased the athlete's words", async () => {
    const provider = new FakeProvider({ TailoringResult: safeDraft() });
    await run(provider, [], { confirmed: [], dismissed: [{ key: "shoulder_impingement", evidence: "right shoulder pain" }] });
    expect(provider.calls[0].prompt).toMatch(/RULED OUT BY THE ATHLETE:\n- shoulder_impingement/);
  });

  it("cuts ruled-out words from the refine feedback sent to the tailor, but keeps the athlete's history intact", async () => {
    const first = await run(new FakeProvider({ TailoringResult: safeDraft() }));
    const provider = new FakeProvider({ TailoringResult: safeDraft() });
    const r = await runRefinePipeline(provider, {
      previous: first, feedback: "too easy, and my knee hurts", confirmed: [],
      dismissed: [{ key: "knee_pain", evidence: "my knee hurts" }], unavailableEquipment: [],
      profile: emptyProfile(), request: emptyRequest(), domain,
    });
    expect(provider.calls[0].prompt).not.toContain("knee hurts");
    expect(r.feedbackHistory).toEqual(["too easy, and my knee hurts"]);
  });

  it("applies a condition the athlete added (no evidence)", async () => {
    const provider = new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    await expect(run(provider, [], {
      confirmed: [{ key: "no_hanging", side: null, severity: "moderate", evidence: null }],
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("retries once with the violations and returns the corrected result", async () => {
    const provider = new FakeProvider({ TailoringResult: sequence(unsafeDraft(), safeDraft()) });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["tailoring", "validating", "retrying", "validating"]);
    expect(provider.calls[1].prompt).toContain("REJECTED BY THE SAFETY CHECK");
    expect(r.tailored.blocks[0].components[0].canonical).toBe("Kettlebell Goblet Squat");
  });

  it("returns non-safety violations that survive the retry as findings", async () => {
    const slow = () => {
      const d = safeDraft();
      d.blocks[0].timeDomainMinutes = 30;
      return d;
    };
    const r = await run(new FakeProvider({ TailoringResult: sequence(slow(), slow()) }), [], {
      request: { ...emptyRequest(), situation: "me duele el hombro derecho", timeCapMinutes: 10 },
    });
    expect(r.findings).toContainEqual(expect.objectContaining({ kind: "time_cap_exceeded", severity: "violation" }));
  });

  it("removes a movement that still needs missing equipment after the retry, and says why", async () => {
    // No dumbbells today, yet the model insists on a dumbbell row through the retry.
    const insists = () => {
      const d = toTailoringDraft(fran());
      d.blocks[0].components = [component("Thruster", { reps: "21-15-9" }), component("Dumbbell Row", { reps: "21-15-9" })];
      d.changes = [{ blockIndex: 0, original: "Pull-up", modified: "Dumbbell Row", reason: "No hanging." }];
      return d;
    };
    const r = await run(new FakeProvider({ TailoringResult: sequence(insists(), insists()) }), [], {
      confirmed: [{ key: "no_hanging", side: null, severity: "moderate", evidence: null }],
      request: { ...emptyRequest(), equipmentToday: ["barbell", "pullup_bar"] },
    });
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster"]);
    expect(r.tailored.changes).toEqual([
      { blockIndex: 0, original: "Pull-up", modified: "(removed)", reason: expect.stringMatching(/no alternative.*equipment/i) },
    ]);
    expect(r.findings.filter((f) => f.kind === "equipment_unavailable")).toEqual([]);
  });

  it("applies profile injuries even with nothing confirmed today", async () => {
    const profile = { ...emptyProfile(), injuries: [{ key: "no_hanging", side: null, severity: "moderate" as const, notes: "cast", since: null }] };
    await expect(run(new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) }), [], {
      confirmed: [], profile, request: emptyRequest(),
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });
});

describe("runRefinePipeline", () => {
  it("re-tailors the original with the feedback and the newly confirmed conditions", async () => {
    const first = await run(new FakeProvider({ TailoringResult: safeDraft() }));
    const provider = new FakeProvider({
      TailoringResult: (() => {
        const d = safeDraft();
        d.blocks[0].components[0] = component("Dumbbell Goblet Squat", { reps: "15-12-9" });
        d.changes = [{ blockIndex: 0, original: "Thruster", modified: "Dumbbell Goblet Squat", reason: "No kettlebell today." }];
        return d;
      })(),
    });
    const stages: ProgressStage[] = [];
    const r = await runRefinePipeline(provider, {
      previous: first, feedback: "too heavy, and my knee hurts too",
      confirmed: [{ key: "knee_pain", side: "left", severity: "mild", evidence: "my knee hurts too" }],
      unavailableEquipment: ["kettlebell"],
      profile: emptyProfile(), request: emptyRequest(), domain, onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual(["tailoring", "validating"]);
    expect(provider.calls).toHaveLength(1);
    expect(r.original).toEqual(first.original);
    expect(r.conditions.map((c) => c.key)).toEqual(["shoulder_impingement", "knee_pain"]);
    expect(r.unavailableEquipment).toEqual(["kettlebell"]);
    expect(r.feedbackHistory).toEqual(["too heavy, and my knee hurts too"]);
    expect(provider.calls[0].prompt).toContain("PREVIOUS ATTEMPT");
    expect(provider.calls[0].prompt).toContain("- too heavy, and my knee hurts too");
  });

  it("re-applies profile injuries even if the client dropped them from the previous result", async () => {
    const first = await run(new FakeProvider({ TailoringResult: safeDraft() }));
    const tampered = { ...first, conditions: [] };
    const profile = { ...emptyProfile(), injuries: [{ key: "hand_tear", side: null, severity: "moderate" as const, notes: null, since: null }] };
    const r = await runRefinePipeline(new FakeProvider({ TailoringResult: safeDraft() }), {
      previous: tampered, feedback: "more volume", confirmed: [], unavailableEquipment: [],
      profile, request: emptyRequest(), domain,
    });
    expect(r.conditions.map((c) => c.key)).toEqual(["hand_tear"]);
  });
});
