import type { LlmProvider } from "@/lib/ai/provider";
import { Equipment, type Contraindication, type Movement, type StimulusDef, type StimulusTaxonomy } from "@/lib/domain/types";
import { createMovementResolver } from "@/lib/domain/resolve";
import {
  ManualAnalysisSchema, PasteAnalysisSchema, SituationAnalysisSchema,
  type DetectedCondition, type ManualWorkout, type SituationAnalysis, type StimulusProfile, type StructuredWorkout,
} from "./types";
import { renderBlock, renderManualWorkout } from "./render-text";
import { resolveBlocks } from "./resolve-blocks";

export interface AnalyzeContext {
  movements: Movement[];
  contraindications: Contraindication[];
  taxonomy: StimulusTaxonomy;
}

export interface WorkoutAnalysis extends SituationAnalysis {
  workout: StructuredWorkout;
  analyzed: boolean; // false = degraded to a raw block
}

const SITUATION_RULES = `From the SITUATION text (any language) report:
- "conditions": each injury, limitation or condition it describes, as a key from the CONDITION CATALOG only; never invent keys and omit what does not fit. "side": left/right/both when stated, else null. "severity": "mild" (a niggle), "moderate" (pain that limits training; the default when unclear) or "acute" (recent injury, sharp pain, told to rest). "evidence": the athlete's own words.
- "unavailableEquipment": equipment the athlete says they lack today, only from: ${Equipment.options.join(", ")}.`;

const STIMULUS_RULES = `"stimulus" per block is the intended training effect, using only TAXONOMY keys: "quality", "energySystem" (null when not metabolic, e.g. skill work) and "loadIntensity" (null when unloaded), plus a one-sentence "rationale". Use null for the whole stimulus only for a pure rest block.`;

const PASTE_SYSTEM = `You analyze a functional-fitness training session for a coaching engine. Return JSON only.

WORKOUT
- A session often has several blocks with different formats (strength, conditioning, accessory). Split it into ordered "blocks".
- "rawText" of each block is its exact slice of the input. Never paraphrase.
- If the text spans several days ("Day 1", "Monday", ...), set "day" (1-based) on every block; otherwise null.
- "format": amrap | for_time | emom | intervals | strength | skill | partner | rest | other. "scheme": the prescription as written. "timeDomainMinutes": estimated working time.
- "components": one per movement, including accessory, activation and warm-up movements; never drop one. "movement": the MOVEMENT LIBRARY name only when it is the SAME movement (a spelling, abbreviation or translation of it); a related variant that is not in the library keeps its own name as written (a "snatch pull" is not a Hang Power Snatch, a "Bulgarian split squat" is not a Lunge). Mobility drills, stretches and technique drills (the Sots press, anything done with a PVC pipe) are not movements: leave them out. "load" as written (e.g. "61/43 kg"); "loadKg" male/female kilograms when explicit (convert lb); "percent1RM" when prescribed as a percentage.
- Keep intensity cues, tempo, rest and scaling tiers (Rx+/Rx/Int, M/F) in "coachingNotes".
- ${STIMULUS_RULES}

SITUATION
${SITUATION_RULES}`;

const MANUAL_SYSTEM = `You classify an athlete-entered training session for a coaching engine. Return JSON only.
- "stimuli": one entry per block, in the given order. ${STIMULUS_RULES}

SITUATION
${SITUATION_RULES}`;

const SITUATION_SYSTEM = `You read an athlete's description of their situation for a coaching engine. Return JSON only.
${SITUATION_RULES}`;

const defs = (title: string, list: StimulusDef[]) => `${title}:\n${list.map((d) => `- ${d.key}: ${d.description}`).join("\n")}`;

function catalogText(ctx: AnalyzeContext): string {
  return `CONDITION CATALOG:\n${ctx.contraindications.map((c) => `- ${c.key}: ${c.label} [${c.kind}]`).join("\n")}`;
}

function vocabularyText(ctx: AnalyzeContext): string {
  const library = ctx.movements
    .map((m) => (m.aliases.length > 0 ? `- ${m.name} (aka ${m.aliases.join(", ")})` : `- ${m.name}`))
    .join("\n");
  const taxonomy = [
    defs("quality", ctx.taxonomy.qualities),
    defs("energySystem", ctx.taxonomy.energySystems),
    defs("loadIntensity", ctx.taxonomy.loadIntensities),
  ].join("\n\n");
  return `MOVEMENT LIBRARY:\n${library}\n\n${catalogText(ctx)}\n\nTAXONOMY:\n${taxonomy}`;
}

const situationText = (situation: string) => `SITUATION:\n"""\n${situation.trim() || "(none)"}\n"""`;

function knownConditions(detected: DetectedCondition[], ctx: AnalyzeContext): DetectedCondition[] {
  const keys = new Set(ctx.contraindications.map((c) => c.key));
  const seen = new Set<string>();
  return detected.filter((d) => {
    if (!keys.has(d.key)) {
      console.warn(`analyze: dropped unknown condition key "${d.key}"`);
      return false;
    }
    if (seen.has(d.key)) return false;
    seen.add(d.key);
    return true;
  });
}

function clean(s: SituationAnalysis, ctx: AnalyzeContext): SituationAnalysis {
  return { conditions: knownConditions(s.conditions, ctx), unavailableEquipment: [...new Set(s.unavailableEquipment)] };
}

export async function analyzeSituation(provider: LlmProvider, situation: string, ctx: AnalyzeContext): Promise<SituationAnalysis> {
  if (situation.trim() === "") return { conditions: [], unavailableEquipment: [] };
  const out = await provider.generateStructured({
    systemPrompt: SITUATION_SYSTEM,
    prompt: `${catalogText(ctx)}\n\n${situationText(situation)}`,
    schema: SituationAnalysisSchema,
    schemaName: "SituationAnalysis",
  });
  return clean(out, ctx);
}

export async function analyzePaste(
  provider: LlmProvider, rawText: string, situation: string, ctx: AnalyzeContext,
): Promise<WorkoutAnalysis> {
  const resolve = createMovementResolver(ctx.movements);
  try {
    const out = await provider.generateStructured({
      systemPrompt: PASTE_SYSTEM,
      prompt: `${vocabularyText(ctx)}\n\n${situationText(situation)}\n\nSESSION:\n"""\n${rawText}\n"""`,
      schema: PasteAnalysisSchema,
      schemaName: "PasteAnalysis",
    });
    // Models paraphrase: a block slice that is not in the input falls back to the session text.
    const blocks = out.workout.blocks.map((b) => (rawText.includes(b.rawText) ? b : { ...b, rawText }));
    return {
      workout: { name: out.workout.name, rawText, source: "paste", blocks: resolveBlocks(blocks, resolve) },
      ...clean(out, ctx),
      analyzed: true,
    };
  } catch (e) {
    console.error("analyzePaste failed; degrading to a raw block", e);
    const s = await analyzeSituation(provider, situation, ctx); // stated pain is never ignored
    return {
      workout: {
        name: null, rawText, source: "paste",
        blocks: [{
          title: null, rawText, day: null, format: "other", scheme: null,
          timeDomainMinutes: null, coachingNotes: null, stimulus: null, components: [],
        }],
      },
      ...s,
      analyzed: false,
    };
  }
}

export async function analyzeManual(
  provider: LlmProvider, manual: ManualWorkout, situation: string, ctx: AnalyzeContext,
): Promise<WorkoutAnalysis> {
  const resolve = createMovementResolver(ctx.movements);
  const rawText = renderManualWorkout(manual);
  const build = (stimuli: (StimulusProfile | null)[]): StructuredWorkout => ({
    name: manual.name, rawText, source: "manual",
    blocks: resolveBlocks(
      manual.blocks.map((b, i) => ({ ...b, rawText: renderBlock(b), day: null, stimulus: stimuli[i] ?? null })),
      resolve,
    ),
  });
  try {
    const out = await provider.generateStructured({
      systemPrompt: MANUAL_SYSTEM,
      prompt: `${vocabularyText(ctx)}\n\n${situationText(situation)}\n\nSESSION (one entry per block, in order):\n${
        manual.blocks.map((b, i) => `[block ${i}]\n${renderBlock(b)}`).join("\n\n")
      }`,
      schema: ManualAnalysisSchema,
      schemaName: "ManualAnalysis",
    });
    return { workout: build(out.stimuli), ...clean(out, ctx), analyzed: true };
  } catch (e) {
    console.error("analyzeManual failed; continuing without stimulus", e);
    const s = await analyzeSituation(provider, situation, ctx);
    return { workout: build([]), ...s, analyzed: false };
  }
}
