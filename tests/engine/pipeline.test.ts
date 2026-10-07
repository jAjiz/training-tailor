import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import {
  EngineUnsafeError, analyzeFeedback, analyzeWorkout, runRefinePipeline, runTailorPipeline,
  type PipelineArgs, type ProgressStage,
} from "@/lib/engine/pipeline";
import {
  RestrictionDraftSchema, WorkoutDraftSchema, emptyProfile, emptyRequest, type Restriction, type TailoringDraft,
} from "@/lib/engine/types";
import { FRAN_TEXT, SNATCH_TEXT, component, fran, franDraft, snatchSession, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const restriction = (patch: Partial<Restriction>): Restriction => ({
  site: null, side: null, movements: [], mechanisms: [], positions: [], evidence: "x", replacements: [], ...patch,
});
// "Me duele el hombro derecho al levantar el brazo": no overhead load on the right shoulder.
const overheadToday = restriction({
  site: "shoulder", side: "right", mechanisms: ["overhead"], evidence: "me duele el hombro derecho al levantar el brazo",
});
const asDraft = (r: Restriction) => RestrictionDraftSchema.parse(r); // zod strips the replacements
const pasteAnalysis = (restrictions: unknown[] = [asDraft(overheadToday)]) => ({
  workout: franDraft(), restrictions, conditions: [], unavailableEquipment: [],
});

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
const snatchUnchanged = () => sequence(toTailoringDraft(snatchSession()), toTailoringDraft(snatchSession()));

const run = (provider: FakeProvider, stages: ProgressStage[] = [], overrides: Partial<PipelineArgs> = {}) =>
  runTailorPipeline(provider, {
    original: fran(),
    confirmed: [],
    restrictions: [overheadToday],
    unavailableEquipment: [],
    profile: emptyProfile(),
    request: { ...emptyRequest(), situation: overheadToday.evidence },
    domain,
    onProgress: (s) => stages.push(s),
    ...overrides,
  });

describe("analyzeWorkout", () => {
  const analyze = (provider: FakeProvider, rawText: string, situation: string) => analyzeWorkout(provider, {
    rawText, request: { ...emptyRequest(), situation }, profile: emptyProfile(), domain,
  });

  it("reads today's restrictions without tailoring, in one model call", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis() });
    const a = await analyze(provider, FRAN_TEXT, overheadToday.evidence);
    expect(provider.calls).toHaveLength(1);
    expect(a.restrictions).toEqual([overheadToday]);
    expect(a.questions).toEqual([]);
    expect(a.original.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster", "Pull-up"]);
    expect(a.analyzed).toBe(true);
  });

  it("asks which loads bother a painful site when nothing was named", async () => {
    const session = snatchSession();
    const provider = new FakeProvider({ PasteAnalysis: {
      workout: WorkoutDraftSchema.parse(session), // zod strips the resolved names
      restrictions: [asDraft(restriction({ site: "shoulder", evidence: "me duele el hombro" }))],
      conditions: [], unavailableEquipment: [],
    } });
    const a = await analyze(provider, SNATCH_TEXT, "me duele el hombro");
    expect(a.questions).toHaveLength(1);
    const [q] = a.questions;
    expect(q.kind === "site" && q.options.map((o) => o.movements)).toEqual([["Power Snatch"], ["Toes-to-Bar"]]);
  });

});

describe("analyzeFeedback", () => {
  it("reads the feedback's restrictions and missing equipment, asking about the session's movements", async () => {
    const knee = asDraft(restriction({ site: "knee", side: "left", evidence: "la rodilla también" }));
    const provider = new FakeProvider({ SituationAnalysis: { restrictions: [knee], conditions: [], unavailableEquipment: ["kettlebell"] } });
    const a = await analyzeFeedback(provider, {
      feedback: "la rodilla también, y no hay kettlebell",
      session: { original: fran(), conditions: [], restrictions: [overheadToday], unavailableEquipment: [] },
      request: emptyRequest(), profile: emptyProfile(), domain,
    });
    expect(a.restrictions).toEqual([{ ...knee, replacements: [] }]);
    expect(a.unavailableEquipment).toEqual(["kettlebell"]);
    // The Thruster loads the knee; the question indexes the feedback's restriction, not the session's.
    expect(a.questions).toEqual([expect.objectContaining({ kind: "site", restriction: 0, site: "knee" })]);
  });
});

describe("runTailorPipeline", () => {
  it("tailors and validates against today's restrictions in one model call", async () => {
    const provider = new FakeProvider({ TailoringResult: safeDraft() });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["tailoring", "validating"]);
    expect(provider.calls).toHaveLength(1);
    expect(r.conditions).toEqual([]);
    expect(r.restrictions).toEqual([overheadToday]);
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
    expect(r.findings.filter((f) => f.severity === "violation")).toEqual([]);
    expect(r.feedbackHistory).toEqual([]);
    expect(r.model).toBe("fake");
  });

  it("an overhead restriction fails closed on a kept Thruster, and leaves the Pull-up alone", async () => {
    const provider = new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    await expect(run(provider)).rejects.toBeInstanceOf(EngineUnsafeError);
    expect(provider.calls[0].prompt).toContain("[b0.c1] Pull-up → OK");
  });

  it("a restriction bans only what the athlete named: a snatch ban leaves toes-to-bar alone", async () => {
    const provider = new FakeProvider({ TailoringResult: snatchUnchanged() });
    await expect(run(provider, [], {
      original: snatchSession(),
      restrictions: [restriction({ site: "shoulder", movements: ["Power Snatch"], evidence: "no puedo hacer snatch" })],
    })).rejects.toBeInstanceOf(EngineUnsafeError);
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("[b0.c0] Power Snatch → AVOID; (today_0: explicit = avoid); MUST CHANGE; candidates: Power Clean (ok)");
    expect(prompt).toContain("[b0.c2] Toes-to-Bar → OK");
    expect(prompt).toContain('- today_0: shoulder; cannot do: Power Snatch — "no puedo hacer snatch"');
  });

  it("makes the athlete's pick the only candidate", async () => {
    const provider = new FakeProvider({ TailoringResult: snatchUnchanged() });
    await expect(run(provider, [], {
      original: snatchSession(),
      restrictions: [restriction({
        site: "shoulder", movements: ["Power Snatch"], replacements: [{ blockIndex: 0, componentIndex: 0, replacement: "Kettlebell Swing" }],
      })],
    })).rejects.toBeInstanceOf(EngineUnsafeError);
    expect(provider.calls[0].prompt).toContain("MUST CHANGE; candidates: Kettlebell Swing (ok, chosen by the athlete)");
  });

  it("marks a restriction with nothing named as context only", async () => {
    const provider = new FakeProvider({ TailoringResult: unsafeDraft() });
    const r = await run(provider, [], { restrictions: [restriction({ site: "shoulder", evidence: "algo de hombro" })] });
    expect(provider.calls[0].prompt).toContain('- today_0: shoulder; context only (the athlete can do everything) — "algo de hombro"');
    expect(r.findings.filter((f) => f.severity === "violation")).toEqual([]);
  });

  it("applies a non-pain condition read today", async () => {
    const provider = new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    await expect(run(provider, [], {
      restrictions: [], confirmed: [{ key: "no_hanging", side: null, severity: "moderate", evidence: null }],
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
      request: { ...emptyRequest(), timeCapMinutes: 10 },
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
      restrictions: [restriction({ positions: ["hanging"] })],
      request: { ...emptyRequest(), equipmentToday: ["barbell", "pullup_bar"] },
    });
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster"]);
    expect(r.tailored.changes).toEqual([
      { blockIndex: 0, original: "Pull-up", modified: "(removed)", reason: expect.stringMatching(/no alternative.*equipment/i) },
    ]);
    expect(r.findings.filter((f) => f.kind === "equipment_unavailable")).toEqual([]);
  });

  it("applies profile injuries even with nothing today", async () => {
    const profile = { ...emptyProfile(), injuries: [{ key: "no_hanging", side: null, severity: "moderate" as const, notes: "cast", since: null }] };
    await expect(run(new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) }), [], {
      restrictions: [], profile, request: emptyRequest(),
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });
});

describe("runRefinePipeline", () => {
  it("re-tailors the original with the feedback, keeping earlier restrictions and adding new ones", async () => {
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
      previous: first, feedback: "too heavy, and my knee hurts too", confirmed: [],
      restrictions: [restriction({ site: "knee", side: "left", movements: ["Box Jump"], evidence: "my knee hurts too" })],
      unavailableEquipment: ["kettlebell"],
      profile: emptyProfile(), request: emptyRequest(), domain, onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual(["tailoring", "validating"]);
    expect(provider.calls).toHaveLength(1);
    expect(r.original).toEqual(first.original);
    expect(r.restrictions.map((x) => x.site)).toEqual(["shoulder", "knee"]);
    expect(provider.calls[0].prompt).toContain("- today_1: knee (left); cannot do: Box Jump");
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
      previous: tampered, feedback: "more volume", confirmed: [], restrictions: [], unavailableEquipment: [],
      profile, request: emptyRequest(), domain,
    });
    expect(r.conditions.map((c) => c.key)).toEqual(["hand_tear"]);
  });
});
