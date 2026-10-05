import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { EngineUnsafeError, runRefinePipeline, runTailorPipeline, type ProgressStage } from "@/lib/engine/pipeline";
import { emptyProfile, emptyRequest, type TailoringDraft } from "@/lib/engine/types";
import { FRAN_TEXT, component, fran, franDraft, sprint, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulderToday = { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro derecho" };
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

const run = (provider: FakeProvider, stages: ProgressStage[] = [], situation = "me duele el hombro derecho") =>
  runTailorPipeline(provider, {
    input: { kind: "paste", rawText: FRAN_TEXT },
    profile: emptyProfile(),
    request: { ...emptyRequest(), situation },
    domain,
    onProgress: (s) => stages.push(s),
  });

describe("runTailorPipeline", () => {
  it("analyzes, tailors and validates in two model calls", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: safeDraft() });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["analyzing", "tailoring", "validating"]);
    expect(provider.calls).toHaveLength(2);
    expect(r.conditions).toEqual([{ ...shoulderToday, source: "today" }]);
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
    expect(r.findings.filter((f) => f.severity === "violation")).toEqual([]);
    expect(r.feedbackHistory).toEqual([]);
    expect(r.model).toBe("fake");
  });

  it("retries once with the violations and returns the corrected result", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: sequence(unsafeDraft(), safeDraft()) });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["analyzing", "tailoring", "validating", "retrying", "validating"]);
    expect(provider.calls[2].prompt).toContain("REJECTED BY THE SAFETY CHECK");
    expect(r.tailored.blocks[0].components[0].canonical).toBe("Kettlebell Goblet Squat");
  });

  it("fails closed when a contraindicated movement survives the retry", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    await expect(run(provider)).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("returns non-safety violations that survive the retry as findings", async () => {
    const slow = () => {
      const d = safeDraft();
      d.blocks[0].timeDomainMinutes = 30;
      return d;
    };
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: sequence(slow(), slow()) });
    const r = await runTailorPipeline(provider, {
      input: { kind: "paste", rawText: FRAN_TEXT }, profile: emptyProfile(),
      request: { ...emptyRequest(), situation: "me duele el hombro derecho", timeCapMinutes: 10 }, domain,
    });
    expect(r.findings).toContainEqual(expect.objectContaining({ kind: "time_cap_exceeded", severity: "violation" }));
  });

  it("applies profile injuries even when today's situation is empty", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis([]), TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    const profile = { ...emptyProfile(), injuries: [{ key: "no_hanging", side: null, severity: "moderate" as const, notes: "cast", since: null }] };
    await expect(runTailorPipeline(provider, {
      input: { kind: "paste", rawText: FRAN_TEXT }, profile, request: emptyRequest(), domain,
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("accepts a manual workout", async () => {
    const provider = new FakeProvider({
      ManualAnalysis: { stimuli: [sprint], conditions: [], unavailableEquipment: [] },
      TailoringResult: (() => {
        const d = toTailoringDraft(fran());
        d.blocks[0].rawText = "21-15-9 for time";
        return d;
      })(),
    });
    const r = await runTailorPipeline(provider, {
      input: { kind: "manual", workout: { name: "Fran", blocks: [{
        title: "Fran", format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
        components: franDraft().blocks[0].components,
      }] } },
      profile: emptyProfile(), request: emptyRequest(), domain,
    });
    expect(r.original.source).toBe("manual");
    expect(r.original.blocks[0].stimulus).toEqual(sprint);
  });
});

describe("runRefinePipeline", () => {
  it("re-tailors the original with the feedback, keeping and extending the conditions", async () => {
    const first = await run(new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: safeDraft() }));
    const provider = new FakeProvider({
      SituationAnalysis: { conditions: [{ key: "knee_pain", side: "left", severity: "mild", evidence: "la rodilla también" }], unavailableEquipment: ["kettlebell"] },
      TailoringResult: (() => {
        const d = safeDraft();
        d.blocks[0].components[0] = component("Dumbbell Goblet Squat", { reps: "15-12-9" });
        d.changes = [{ blockIndex: 0, original: "Thruster", modified: "Dumbbell Goblet Squat", reason: "No kettlebell today." }];
        return d;
      })(),
    });
    const stages: ProgressStage[] = [];
    const r = await runRefinePipeline(provider, {
      previous: first, feedback: "too heavy, and my knee hurts too", profile: emptyProfile(), request: emptyRequest(), domain,
      onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual(["analyzing", "tailoring", "validating"]);
    expect(r.original).toEqual(first.original);
    expect(r.conditions.map((c) => c.key)).toEqual(["shoulder_impingement", "knee_pain"]);
    expect(r.unavailableEquipment).toEqual(["kettlebell"]);
    expect(r.feedbackHistory).toEqual(["too heavy, and my knee hurts too"]);
    expect(provider.calls[1].prompt).toContain("PREVIOUS ATTEMPT");
    expect(provider.calls[1].prompt).toContain("- too heavy, and my knee hurts too");
  });

  it("re-applies profile injuries even if the client dropped them from the previous result", async () => {
    const first = await run(new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: safeDraft() }));
    const tampered = { ...first, conditions: [] };
    const provider = new FakeProvider({
      SituationAnalysis: { conditions: [], unavailableEquipment: [] },
      TailoringResult: safeDraft(),
    });
    const profile = { ...emptyProfile(), injuries: [{ key: "hand_tear", side: null, severity: "moderate" as const, notes: null, since: null }] };
    const r = await runRefinePipeline(provider, { previous: tampered, feedback: "more volume", profile, request: emptyRequest(), domain });
    expect(r.conditions.map((c) => c.key)).toEqual(["hand_tear"]);
  });
});
