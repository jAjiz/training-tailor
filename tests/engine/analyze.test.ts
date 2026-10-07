import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { EngineTimeoutError } from "@/lib/ai/provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { analyzePaste, analyzeSituation } from "@/lib/engine/analyze";
import { FRAN_TEXT, component, franDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulder = { site: "shoulder", side: "right", movements: [], mechanisms: [], positions: [], evidence: "me duele el hombro derecho" };
const pregnancy = { key: "pregnancy", side: null, severity: "moderate", evidence: "estoy embarazada" };

describe("analyzePaste", () => {
  it("returns a resolved session, restrictions, non-pain conditions and unavailable equipment", async () => {
    const draft = franDraft();
    draft.blocks[0].components[1] = component("Pull-ups", { reps: "21-15-9" });
    const provider = new FakeProvider({
      PasteAnalysis: {
        workout: draft,
        restrictions: [shoulder, { ...shoulder, movements: ["thrusters", "Made-up Lift", "Thruster", "Snatch"], evidence: "no thrusters" }],
        conditions: [
          pregnancy, { key: "made_up_key", side: null, severity: "mild", evidence: "?" },
          { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "hombro" },
        ],
        unavailableEquipment: ["rower", "rower"],
      },
    });
    const a = await analyzePaste(provider, FRAN_TEXT, "Me duele el hombro derecho. Hoy no hay remo.", domain);
    expect(a.analyzed).toBe(true);
    expect(a.workout.source).toBe("paste");
    expect(a.workout.rawText).toBe(FRAN_TEXT);
    expect(a.workout.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster", "Pull-up"]);
    // Pain is a restriction; only non-pain catalog conditions are read today.
    expect(a.conditions.map((c) => c.key)).toEqual(["pregnancy"]);
    // Movement names resolve to the library; a general name covers its variants; unknown names are dropped.
    expect(a.restrictions[0].movements).toEqual([]);
    expect(a.restrictions[1].movements).toEqual(expect.arrayContaining(["Thruster", "Power Snatch", "Hang Power Snatch", "Dumbbell Snatch"]));
    expect(a.restrictions[1].movements).not.toContain("Made-up Lift");
    expect(a.restrictions[0]).toEqual({ ...shoulder, replacements: [] });
    expect(a.unavailableEquipment).toEqual(["rower"]);
  });

  it("sends the library, the non-pain catalog, the taxonomy and the situation to the model", async () => {
    const provider = new FakeProvider({ PasteAnalysis: { workout: franDraft(), restrictions: [], conditions: [], unavailableEquipment: [] } });
    await analyzePaste(provider, FRAN_TEXT, "Sore right shoulder", domain);
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("- Toes-to-Bar (aka T2B, TTB)");
    expect(prompt).toContain("- pregnancy: Pregnancy [condition]");
    expect(prompt).not.toContain("shoulder_impingement");
    expect(prompt).toContain("- glycolytic:");
    expect(prompt).toContain("Sore right shoulder");
    expect(prompt).toContain(FRAN_TEXT);
  });

  it("forces verbatim block text: a paraphrased slice falls back to the session text", async () => {
    const draft = franDraft();
    draft.blocks[0].rawText = "a paraphrase, not a slice";
    const a = await analyzePaste(new FakeProvider({ PasteAnalysis: { workout: draft, restrictions: [], conditions: [], unavailableEquipment: [] } }), FRAN_TEXT, "", domain);
    expect(a.workout.blocks[0].rawText).toBe(FRAN_TEXT);
  });

  it("degrades to one raw block and still analyzes the situation", async () => {
    const provider = new FakeProvider({
      PasteAnalysis: new Error("model returned garbage"),
      SituationAnalysis: { restrictions: [shoulder], conditions: [], unavailableEquipment: [] },
    });
    const a = await analyzePaste(provider, "cryptic programming", "me duele el hombro derecho", domain);
    expect(a.analyzed).toBe(false);
    expect(a.workout.blocks).toEqual([{
      title: null, rawText: "cryptic programming", day: null, format: "other", scheme: null,
      timeDomainMinutes: null, coachingNotes: null, stimulus: null, components: [],
    }]);
    expect(a.restrictions.map((r) => r.site)).toEqual(["shoulder"]);
  });

  it("skips the situation call when there is no situation", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new Error("garbage") });
    const a = await analyzePaste(provider, "cryptic", "   ", domain);
    expect(a.restrictions).toEqual([]);
    expect(provider.calls).toHaveLength(1);
  });

  it("fails rather than ignore stated pain when both calls fail", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new Error("garbage"), SituationAnalysis: new Error("down") });
    await expect(analyzePaste(provider, "cryptic", "me duele la rodilla", domain)).rejects.toThrow("down");
  });
});

describe("analyzeSituation", () => {
  it("returns nothing for an empty situation without calling the model", async () => {
    const provider = new FakeProvider({});
    expect(await analyzeSituation(provider, "", domain)).toEqual({ restrictions: [], conditions: [], unavailableEquipment: [] });
    expect(provider.calls).toHaveLength(0);
  });

  it("sends the movement library, so a named movement maps to its library variants", async () => {
    const provider = new FakeProvider({ SituationAnalysis: { restrictions: [], conditions: [], unavailableEquipment: [] } });
    await analyzeSituation(provider, "no puedo hacer snatch", domain);
    expect(provider.calls[0].prompt).toContain("- Hang Power Snatch");
    expect(provider.calls[0].systemPrompt).toContain("every snatch variant");
  });
});

describe("analysis out of time", () => {
  it("does not degrade to a raw block when the model ran out of time", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new EngineTimeoutError(), SituationAnalysis: { restrictions: [], conditions: [], unavailableEquipment: [] } });
    await expect(analyzePaste(provider, "cryptic", "", domain)).rejects.toBeInstanceOf(EngineTimeoutError);
  });
});
