import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { analyzeManual, analyzePaste, analyzeSituation } from "@/lib/engine/analyze";
import { FRAN_TEXT, component, franDraft, sprint } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulder = { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro derecho" };

describe("analyzePaste", () => {
  it("returns a resolved session, known conditions and unavailable equipment", async () => {
    const draft = franDraft();
    draft.blocks[0].components[1] = component("Pull-ups", { reps: "21-15-9" });
    const provider = new FakeProvider({
      PasteAnalysis: {
        workout: draft,
        conditions: [shoulder, { key: "made_up_key", side: null, severity: "mild", evidence: "?" }],
        unavailableEquipment: ["rower", "rower"],
      },
    });
    const a = await analyzePaste(provider, FRAN_TEXT, "Me duele el hombro derecho. Hoy no hay remo.", domain);
    expect(a.analyzed).toBe(true);
    expect(a.workout.source).toBe("paste");
    expect(a.workout.rawText).toBe(FRAN_TEXT);
    expect(a.workout.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster", "Pull-up"]);
    expect(a.conditions.map((c) => c.key)).toEqual(["shoulder_impingement"]);
    expect(a.unavailableEquipment).toEqual(["rower"]);
  });

  it("sends the library, the catalog, the taxonomy and the situation to the model", async () => {
    const provider = new FakeProvider({ PasteAnalysis: { workout: franDraft(), conditions: [], unavailableEquipment: [] } });
    await analyzePaste(provider, FRAN_TEXT, "Sore right shoulder", domain);
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("- Toes-to-Bar (aka T2B, TTB)");
    expect(prompt).toContain("- shoulder_impingement: Shoulder impingement [injury]");
    expect(prompt).toContain("- glycolytic:");
    expect(prompt).toContain("Sore right shoulder");
    expect(prompt).toContain(FRAN_TEXT);
  });

  it("forces verbatim block text: a paraphrased slice falls back to the session text", async () => {
    const draft = franDraft();
    draft.blocks[0].rawText = "a paraphrase, not a slice";
    const a = await analyzePaste(new FakeProvider({ PasteAnalysis: { workout: draft, conditions: [], unavailableEquipment: [] } }), FRAN_TEXT, "", domain);
    expect(a.workout.blocks[0].rawText).toBe(FRAN_TEXT);
  });

  it("degrades to one raw block and still analyzes the situation", async () => {
    const provider = new FakeProvider({
      PasteAnalysis: new Error("model returned garbage"),
      SituationAnalysis: { conditions: [shoulder], unavailableEquipment: [] },
    });
    const a = await analyzePaste(provider, "cryptic programming", "me duele el hombro derecho", domain);
    expect(a.analyzed).toBe(false);
    expect(a.workout.blocks).toEqual([{
      title: null, rawText: "cryptic programming", day: null, format: "other", scheme: null,
      timeDomainMinutes: null, coachingNotes: null, stimulus: null, components: [],
    }]);
    expect(a.conditions.map((c) => c.key)).toEqual(["shoulder_impingement"]);
  });

  it("skips the situation call when there is no situation", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new Error("garbage") });
    const a = await analyzePaste(provider, "cryptic", "   ", domain);
    expect(a.conditions).toEqual([]);
    expect(provider.calls).toHaveLength(1);
  });

  it("fails rather than ignore stated pain when both calls fail", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new Error("garbage"), SituationAnalysis: new Error("down") });
    await expect(analyzePaste(provider, "cryptic", "me duele la rodilla", domain)).rejects.toThrow("down");
  });
});

describe("analyzeManual", () => {
  const manual = {
    name: "Manual",
    blocks: [
      { title: "A", format: "strength" as const, scheme: "5x5", timeDomainMinutes: 15, coachingNotes: null, components: [component("Back Squat")] },
      { title: "B", format: "amrap" as const, scheme: "AMRAP 8", timeDomainMinutes: 8, coachingNotes: null, components: [component("T2B", { reps: 10 })] },
    ],
  };

  it("renders text, aligns stimuli by block and resolves names", async () => {
    const provider = new FakeProvider({ ManualAnalysis: { stimuli: [null, sprint], conditions: [], unavailableEquipment: [] } });
    const a = await analyzeManual(provider, manual, "", domain);
    expect(a.workout.source).toBe("manual");
    expect(a.workout.blocks[0].rawText).toBe("A\n5x5\nBack Squat");
    expect(a.workout.blocks[1].stimulus).toEqual(sprint);
    expect(a.workout.blocks[1].components[0].canonical).toBe("Toes-to-Bar");
  });

  it("fills missing stimuli with null when the model returns too few", async () => {
    const provider = new FakeProvider({ ManualAnalysis: { stimuli: [sprint], conditions: [], unavailableEquipment: [] } });
    const a = await analyzeManual(provider, manual, "", domain);
    expect(a.workout.blocks[1].stimulus).toBeNull();
  });
});

describe("analyzeSituation", () => {
  it("returns nothing for an empty situation without calling the model", async () => {
    const provider = new FakeProvider({});
    expect(await analyzeSituation(provider, "", domain)).toEqual({ conditions: [], unavailableEquipment: [] });
    expect(provider.calls).toHaveLength(0);
  });
});
