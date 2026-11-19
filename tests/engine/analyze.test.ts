import { describe, it, expect } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { analyzeBlock, analyzePaste, analyzeSituation } from "@/lib/engine/analyze";
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
  it("tells the model that only one kind of equipment means every other one is missing", async () => {
    const provider = new FakeProvider({ SituationAnalysis: { restrictions: [], conditions: [], unavailableEquipment: [] } });
    await analyzeSituation(provider, "solo tengo mancuernas", domain);
    expect(provider.calls[0].systemPrompt).toMatch(/"only X" \/ "solo X"[^\n]*every other equipment[^\n]*unavailable/);
  });


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

describe("analyzeBlock", () => {
  const blockText = "Test Squat 5x3 @ 80%\nTest Row";
  const draft = () => ({
    name: null,
    blocks: [{
      ...coupletDraft().blocks[0], rawText: blockText,
      components: [component("Test Squat", { percent1RM: 80 }), component("Test Row")],
    }],
  });

  it("sends no situation", async () => {
    const provider = new FakeProvider({ BlockAnalysis: draft() });
    await analyzeBlock(provider, blockText, domain, null);
    expect(provider.calls[0].prompt).not.toContain("SITUATION:");
    expect(provider.calls[0].systemPrompt).not.toContain("SITUATION");
    expect(provider.calls[0].prompt).toContain(blockText);
  });

  it("sends the coach metadata as context outside the SESSION", async () => {
    const provider = new FakeProvider({ BlockAnalysis: draft() });
    await analyzeBlock(provider, blockText, domain, null, "for_time", {
      title: "Test Strength", scoring: "for_time", timeCapMinutes: 10, coachingTips: "Keep it fast\nTest note",
    });
    const { prompt, systemPrompt } = provider.calls[0];
    const metadata = prompt.indexOf("COACH METADATA");
    const session = prompt.indexOf("SESSION:");
    expect(metadata).toBeGreaterThan(-1);
    expect(metadata).toBeLessThan(session);
    expect(prompt.slice(metadata, session)).toMatch(/Test Strength[\s\S]*for_time[\s\S]*10 min/);
    expect(prompt.slice(metadata, session)).toContain("- coaching tips: Keep it fast\nTest note");
    expect(prompt.slice(session)).not.toMatch(/Test Strength|for_time|10 min|Keep it fast/);
    expect(systemPrompt).toMatch(/COACH METADATA[^\n]*coaching tips/);
    expect(systemPrompt).toMatch(/COACH METADATA[^\n]*never part of any "rawText"/);
  });

  it("sends no metadata section when there is none", async () => {
    const provider = new FakeProvider({ BlockAnalysis: draft() });
    await analyzeBlock(provider, blockText, domain, null, "other", { title: null, scoring: null, timeCapMinutes: null, coachingTips: null });
    expect(provider.calls[0].prompt).not.toContain("COACH METADATA:");
  });

  it("forces the barbell movement on percent components only", async () => {
    const provider = new FakeProvider({ BlockAnalysis: draft() });
    const { workout, analyzed } = await analyzeBlock(provider, blockText, domain, { movement: "Test Combo" });
    expect(analyzed).toBe(true);
    expect(workout.blocks[0].components.map((c) => c.canonical)).toEqual(["Test Combo", "Test Row"]);
  });

  it("degrades to a raw block on a model error", async () => {
    const { workout, analyzed } = await analyzeBlock(new FakeProvider({ BlockAnalysis: new Error("garbage") }), blockText, domain, null);
    expect(analyzed).toBe(false);
    expect(workout.blocks).toHaveLength(1);
    expect(workout.blocks[0].rawText).toBe(blockText);
    expect(workout.blocks[0].components).toEqual([]);
  });
});
