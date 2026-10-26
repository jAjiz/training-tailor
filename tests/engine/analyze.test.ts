import { describe, it, expect } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { analyzePaste, analyzeSituation } from "@/lib/engine/analyze";
import { COUPLET_TEXT, component, coupletDraft, fixtureDomain } from "../fixtures/workouts";

const domain = fixtureDomain();

const shoulder = { site: "shoulder", side: "right", movements: [], mechanisms: [], positions: [], evidence: "me duele el hombro derecho" };
const condition = { key: "test_condition", side: null, severity: "moderate", evidence: "test evidence" };

describe("analyzePaste", () => {
  it("returns a resolved session, restrictions, non-pain conditions and unavailable equipment", async () => {
    const draft = coupletDraft();
    draft.blocks[0].components[1] = component("Test Pulls", { reps: "21-15-9" });
    const provider = new FakeProvider({
      PasteAnalysis: {
        workout: draft,
        restrictions: [shoulder, { ...shoulder, movements: ["test combos", "Made-up Lift", "Test Combo", "Test Hoist"], evidence: "no combos" }],
        conditions: [
          condition, { key: "made_up_key", side: null, severity: "mild", evidence: "?" },
          { key: "test_shoulder", side: "right", severity: "moderate", evidence: "hombro" },
        ],
        unavailableEquipment: ["rower", "rower"],
      },
    });
    const a = await analyzePaste(provider, COUPLET_TEXT, "Me duele el hombro derecho. Hoy no hay remo.", domain);
    expect(a.analyzed).toBe(true);
    expect(a.workout.source).toBe("paste");
    expect(a.workout.rawText).toBe(COUPLET_TEXT);
    // A plural spelling resolves to the library row.
    expect(a.workout.blocks[0].components.map((c) => c.canonical)).toEqual(["Test Combo", "Test Pull"]);
    // Pain is a restriction; only non-pain catalog conditions are read today. Unknown keys are dropped.
    expect(a.conditions.map((c) => c.key)).toEqual(["test_condition"]);
    // Movement names resolve to the library, a general name covers its variants, unknown names are dropped.
    expect(a.restrictions[0].movements).toEqual([]);
    expect(a.restrictions[1].movements).toEqual(["Test Combo", "Test Hoist"]);
    expect(a.restrictions[0]).toEqual({ ...shoulder, replacements: [] });
    expect(a.unavailableEquipment).toEqual(["rower"]);
  });

  it("sends the library, the non-pain catalog, the taxonomy and the situation to the model", async () => {
    const provider = new FakeProvider({ PasteAnalysis: { workout: coupletDraft(), restrictions: [], conditions: [], unavailableEquipment: [] } });
    await analyzePaste(provider, COUPLET_TEXT, "Sore right shoulder", domain);
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("- Test Hang Raise (aka THR)");
    expect(prompt).toContain("- Test Combo\n");
    expect(prompt).toContain("- test_condition: Test Condition [condition]");
    expect(prompt).not.toContain("test_shoulder");
    expect(prompt).toContain("- glycolytic:");
    expect(prompt).toContain("Sore right shoulder");
    expect(prompt).toContain(COUPLET_TEXT);
  });

  it("forces verbatim block text: a paraphrased slice falls back to the session text", async () => {
    const draft = coupletDraft();
    draft.blocks[0].rawText = "a paraphrase, not a slice";
    const a = await analyzePaste(new FakeProvider({ PasteAnalysis: { workout: draft, restrictions: [], conditions: [], unavailableEquipment: [] } }), COUPLET_TEXT, "", domain);
    expect(a.workout.blocks[0].rawText).toBe(COUPLET_TEXT);
  });

  it("keeps a block slice that appears in the session text", async () => {
    const draft = coupletDraft();
    draft.blocks[0].rawText = "21-15-9 for time";
    const a = await analyzePaste(new FakeProvider({ PasteAnalysis: { workout: draft, restrictions: [], conditions: [], unavailableEquipment: [] } }), COUPLET_TEXT, "", domain);
    expect(a.workout.blocks[0].rawText).toBe("21-15-9 for time");
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
    await analyzeSituation(provider, "no puedo hacer hoist", domain);
    expect(provider.calls[0].prompt).toContain("- Test Hang Hoist");
    expect(provider.calls[0].systemPrompt).toContain("A general name covers every library variant");
  });

  it("covers every library variant of a general movement name and drops names it cannot place", async () => {
    const provider = new FakeProvider({
      SituationAnalysis: {
        restrictions: [{ ...shoulder, movements: ["hoist", "Made-up Lift"] }], conditions: [], unavailableEquipment: [],
      },
    });
    const s = await analyzeSituation(provider, "no puedo hacer hoist", domain);
    expect(s.restrictions[0].movements).toEqual(["Test Hoist", "Test Hang Hoist", "Test Dumbbell Hoist"]);
  });
});
