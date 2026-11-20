import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { Prisma, type BlockAdaptation } from "@/generated/prisma/client";
import type { LlmProvider } from "@/lib/ai/provider";
import type { DomainData } from "@/lib/domain/repository";
import { applyAnswers, mergeFreeText, type ClarifyAnswer } from "@/lib/engine/clarify";
import {
  EngineEmptyError, EngineUnsafeError, analyzeFeedback, runRefinePipeline, runTailorPipeline,
  type FeedbackSession, type ProgressStage,
} from "@/lib/engine/pipeline";
import {
  emptyRequest, type AthleteProfile, type ClarifyQuestion, type ConfirmedCondition, type PipelineResult, type Restriction,
  type StructuredWorkout,
} from "@/lib/engine/types";
import type { CoachIntent } from "@/lib/engine/tailor";
import { toJson } from "@/lib/json";
import {
  AcceptedAdaptation, AdaptationMessage, AdaptationState, type AdaptationSnapshot, type AdaptMessageInput,
} from "../adaptation-types";
import { applyAthleteLoads, contentHash, lockedFormatsFor, workoutHash } from "../block-engine";
import { TrainingError } from "../errors";
import { weekIndexOf } from "../dates";
import { ensureBlockAnalysis } from "./block-analysis";
import { oneRmMap } from "./prs";
import { getAdaptableBlock } from "./tailoring";
import type { Db } from "./types";

type AthleteRef = { id: string; timezone: string };

/** What every engine step of the conversation needs besides the block. */
export interface AdaptContext {
  profile: AthleteProfile;
  domain: DomainData;
  libraryVersion: number;
  locale: "es" | "en";
}

export interface Adaptation {
  messages: AdaptationMessage[];
  state: AdaptationState | null;
  accepted: AcceptedAdaptation | null;
  /** The library version of the conversation's last analyzed message. */
  libraryVersion: number | null;
}

const StoredAdaptation = z.object({
  messages: z.array(AdaptationMessage),
  state: AdaptationState.nullable(),
  accepted: AcceptedAdaptation.nullable(),
});

/** The stored row, or null (logged) when the schemas no longer accept it: it reads as no adaptation. */
function parseRow(row: BlockAdaptation): Adaptation | null {
  const parsed = StoredAdaptation.safeParse(row);
  if (!parsed.success) {
    console.error(`adaptation ${row.id} no longer parses; read as absent`, parsed.error);
    return null;
  }
  return { ...parsed.data, libraryVersion: row.libraryVersion };
}

const key = (athleteId: string, blockId: string) => ({ blockId_athleteId: { blockId, athleteId } });

export async function getAdaptation(db: Db, athleteId: string, blockId: string): Promise<Adaptation | null> {
  const row = await db.blockAdaptation.findUnique({ where: key(athleteId, blockId) });
  return row ? parseRow(row) : null;
}

/** The athlete's adaptations of the given blocks, by block id, in one query. Rows that no longer parse are left out. */
export async function listAdaptations(db: Db, athleteId: string, blockIds: string[]): Promise<Map<string, Adaptation>> {
  const rows = await db.blockAdaptation.findMany({ where: { athleteId, blockId: { in: blockIds } } });
  return new Map(rows.flatMap((row) => {
    const adaptation = parseRow(row);
    return adaptation ? [[row.blockId, adaptation] as const] : [];
  }));
}

async function save(
  db: Db, athleteId: string, blockId: string, messages: AdaptationMessage[], state: AdaptationState,
  extra: { model?: string; libraryVersion?: number } = {},
) {
  const data = { messages: toJson(messages), state: toJson(state), ...extra };
  await db.blockAdaptation.upsert({ where: key(athleteId, blockId), create: { blockId, athleteId, ...data }, update: data });
}

/** The athlete's own words in the conversation: their messages and free-text answers. */
function athleteWords(messages: AdaptationMessage[]): string[] {
  return messages.flatMap((m) => {
    if (m.role === "athlete") return [m.text];
    if (m.role === "answer" && "text" in m.answer) return [m.answer.text];
    return [];
  });
}

/**
 * The athlete's messages before the latest proposal: the situation the current session was tailored for, including
 * turns from before a restart (a coach edit), whose words the restarted session carries.
 */
function situationSoFar(messages: AdaptationMessage[]): string {
  const latest = messages.findLastIndex((m) => m.role === "proposal");
  return (latest < 0 ? messages : messages.slice(0, latest)).flatMap((m) => (m.role === "athlete" ? [m.text] : [])).join("\n");
}

const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];

/** The session as the next analysis must see it: the last proposal's inputs plus this turn's, with `restrictions` as given. */
function sessionOf(state: AdaptationState, restrictions: Restriction[]): FeedbackSession {
  const today = (c: ConfirmedCondition) => ({ key: c.key, side: c.side, severity: c.severity, source: "today" as const, evidence: c.evidence });
  return {
    original: state.original,
    conditions: [...(state.last?.conditions ?? []), ...state.conditions.map(today)],
    restrictions: [...(state.last?.restrictions ?? []), ...restrictions],
    unavailableEquipment: union(state.last?.unavailableEquipment ?? [], state.unavailableEquipment),
  };
}

const freshState = (analysisHash: string, original: StructuredWorkout): AdaptationState => ({
  analysisHash, original, conditions: [], restrictions: [], unavailableEquipment: [], pendingQuestions: [], feedback: null, last: null,
});

/**
 * A new engine session for the edited block that keeps what the athlete already said: their conditions, restrictions
 * (without replacement picks, which point into the old workout), missing equipment and words, as the first turn.
 */
function restartedState(stored: AdaptationState, analysisHash: string, original: StructuredWorkout, messages: AdaptationMessage[]): AdaptationState {
  const earlier = (stored.last?.conditions ?? []).flatMap((c): ConfirmedCondition[] =>
    c.source === "today" ? [{ key: c.key, side: c.side, severity: c.severity, evidence: c.evidence }] : []);
  const words = messages.flatMap((m) => (m.role === "athlete" ? [m.text] : [])).join("\n");
  return {
    ...freshState(analysisHash, original),
    conditions: [...earlier, ...stored.conditions],
    restrictions: [...(stored.last?.restrictions ?? []), ...stored.restrictions].map((r) => ({ ...r, replacements: [] })),
    unavailableEquipment: union(stored.last?.unavailableEquipment ?? [], stored.unavailableEquipment),
    feedback: words === "" ? null : words,
  };
}

const answers = (q: ClarifyQuestion, a: ClarifyAnswer): boolean => {
  if (q.restriction !== a.restriction) return false;
  if (q.kind === "site") return a.kind === "site";
  return a.kind === "replacement" && q.blockIndex === a.blockIndex && q.componentIndex === a.componentIndex
    && q.options.some((o) => o.name === a.replacement);
};

/** Button answers: applied to this turn's restrictions with no model call. */
function applyButtonAnswers(state: AdaptationState, given: ClarifyAnswer[]): AdaptationState {
  const pending = [...state.pendingQuestions];
  for (const a of given) {
    const i = pending.findIndex((q) => answers(q, a));
    if (i < 0) throw new TrainingError("invalid_request");
    pending.splice(i, 1);
  }
  return { ...state, restrictions: applyAnswers(state.restrictions, given), pendingQuestions: pending };
}

/**
 * One athlete message: a typed text (a new message, or a free-text answer to an open site question) or button answers.
 * Returns the questions still open; `reanalyzed` is true when the block itself had to be analyzed again.
 * A text on a block the coach changed, or under a library version republished, since the conversation's analysis (or
 * that retries a degraded analysis) starts the engine session again on the new analysis, carrying what the athlete
 * already said (the messages stay); button answers to questions about the older block are refused with `block_changed`.
 */
export async function adaptAnalyze(
  db: Db, provider: LlmProvider, athlete: AthleteRef, blockId: string, message: AdaptMessageInput, ctx: AdaptContext,
  now: Date = new Date(),
): Promise<{ questions: ClarifyQuestion[]; reanalyzed: boolean }> {
  const { block } = await getAdaptableBlock(db, athlete, blockId, now);
  const hash = contentHash(block);
  const current = await getAdaptation(db, athlete.id, blockId);
  const messages = [...(current?.messages ?? [])];
  const at = now.toISOString();
  const stored = current?.state ?? null;

  if ("answers" in message) {
    if (!stored || stored.pendingQuestions.length === 0) throw new TrainingError("invalid_state");
    if (stored.analysisHash !== hash) throw new TrainingError("block_changed");
    const state = applyButtonAnswers(stored, message.answers);
    messages.push(...message.answers.map((answer): AdaptationMessage => ({ role: "answer", at, answer })));
    await save(db, athlete.id, blockId, messages, state);
    return { questions: state.pendingQuestions, reanalyzed: false };
  }

  const ensured = await ensureBlockAnalysis(db, provider, block, ctx.domain, ctx.libraryVersion, ctx.locale);
  // A new analysis (a coach edit, a library republish, a retry of a degraded one) restarts the session on it.
  const upToDate = stored && !ensured.fresh && stored.analysisHash === hash && current?.libraryVersion === ctx.libraryVersion;
  let state = !stored ? freshState(hash, ensured.workout)
    : upToDate ? stored : restartedState(stored, hash, ensured.workout, messages);
  const { text } = message;
  const read = (restrictions: Restriction[]) => analyzeFeedback(provider, {
    feedback: text, session: sessionOf(state, restrictions), request: emptyRequest(), profile: ctx.profile, domain: ctx.domain,
  });

  let asked: ClarifyQuestion[];
  if (state.pendingQuestions.length > 0) {
    // A free-text answer to the first open site question; replacement questions take buttons only.
    const site = state.pendingQuestions.find((q) => q.kind === "site");
    if (!site) throw new TrainingError("invalid_state");
    const index = site.restriction;
    const reading = await read(state.restrictions.filter((_, i) => i !== index));
    const merged = mergeFreeText(state.restrictions, index, reading);
    const rest = state.pendingQuestions
      .filter((q) => q !== site)
      .map((q) => (q.restriction > index ? { ...q, restriction: q.restriction - 1 } : q));
    asked = merged.questions;
    state = {
      ...state, restrictions: merged.restrictions, pendingQuestions: [...rest, ...asked],
      conditions: [...state.conditions, ...reading.suggested],
      unavailableEquipment: union(state.unavailableEquipment, reading.unavailableEquipment),
    };
    messages.push({ role: "answer", at, answer: { text } });
  } else {
    const reading = await read(state.restrictions);
    const shift = state.restrictions.length;
    asked = reading.questions.map((q) => ({ ...q, restriction: q.restriction + shift }));
    state = {
      ...state, restrictions: [...state.restrictions, ...reading.restrictions], pendingQuestions: asked,
      conditions: [...state.conditions, ...reading.suggested],
      unavailableEquipment: union(state.unavailableEquipment, reading.unavailableEquipment),
      feedback: state.feedback ? `${state.feedback}\n${text}` : text,
    };
    messages.push({ role: "athlete", at, text });
  }
  messages.push(...asked.map((question): AdaptationMessage => ({ role: "question", at, question })));
  await save(db, athlete.id, blockId, messages, state, { libraryVersion: ctx.libraryVersion });
  return { questions: state.pendingQuestions, reanalyzed: ensured.fresh };
}

/** The checks a tailoring run needs, before any quota is spent. */
async function tailorable(db: Db, athlete: AthleteRef, blockId: string, now: Date) {
  const { block } = await getAdaptableBlock(db, athlete, blockId, now);
  const current = await getAdaptation(db, athlete.id, blockId);
  const state = current?.state;
  if (!current || !state || state.pendingQuestions.length > 0) throw new TrainingError("invalid_state");
  if (state.last !== null && state.feedback === null) throw new TrainingError("invalid_state"); // nothing new to refine with
  if (state.analysisHash !== contentHash(block)) throw new TrainingError("block_changed");
  return { block, messages: current.messages, state };
}

const textOrNull = (t: string | null | undefined) => t?.trim() || null;

/** The coach's intent around a block: its tips and its day's and week's notes, read now so every run sees the latest. */
async function coachIntentFor(
  db: Db, block: { programId: string; dayIndex: number; coachingTips: string | null },
): Promise<CoachIntent> {
  const { programId, dayIndex } = block;
  const [day, week] = await Promise.all([
    db.dayNote.findUnique({ where: { programId_dayIndex: { programId, dayIndex } } }),
    db.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex: weekIndexOf(dayIndex) } } }),
  ]);
  return { blockTips: textOrNull(block.coachingTips), dayNote: textOrNull(day?.body), weekNote: textOrNull(week?.body) };
}

/** Whether the next run is the first proposal (`tailor`) or a refinement (`refine`); throws what adaptTailor would refuse. */
export async function adaptTailorKind(
  db: Db, athlete: AthleteRef, blockId: string, now: Date = new Date(),
): Promise<"tailor" | "refine"> {
  const { state } = await tailorable(db, athlete, blockId, now);
  return state.last === null ? "tailor" : "refine";
}

const errorCode = (e: unknown) =>
  e instanceof EngineUnsafeError ? "engine_unsafe" : e instanceof EngineEmptyError ? "engine_empty" : "engine_failed";

/**
 * Tailors the block for this turn: the first proposal, or a refinement of the last one with the turn's feedback.
 * The athlete's 1RMs fill percentage loads. An engine refusal is kept in the conversation and rethrown.
 */
export async function adaptTailor(
  db: Db, provider: LlmProvider, athlete: AthleteRef, blockId: string,
  ctx: AdaptContext & { onProgress?: (stage: ProgressStage) => void }, now: Date = new Date(),
): Promise<PipelineResult> {
  const { block, messages, state } = await tailorable(db, athlete, blockId, now);
  const lifts = state.original.blocks.flatMap((b) => b.components.flatMap((c) => (c.percent1RM !== null && c.canonical ? [c.canonical] : [])));
  const original = applyAthleteLoads(state.original, new Map([...await oneRmMap(db, athlete.id, [...new Set(lifts)])].map(([m, r]) => [m, r.kg])));
  const common = {
    confirmed: state.conditions, restrictions: state.restrictions, unavailableEquipment: state.unavailableEquipment,
    profile: ctx.profile, domain: ctx.domain, onProgress: ctx.onProgress, locale: ctx.locale, lockedFormats: lockedFormatsFor(block.scoring),
    coachIntent: await coachIntentFor(db, block),
  };
  const at = now.toISOString();
  let result: PipelineResult;
  try {
    result = state.last === null
      ? await runTailorPipeline(provider, { ...common, original, request: { ...emptyRequest(), situation: state.feedback ?? "" } })
      : await runRefinePipeline(provider, {
        ...common, previous: { ...state.last, original }, feedback: state.feedback!,
        request: { ...emptyRequest(), situation: situationSoFar(messages) },
      });
  } catch (e) {
    await save(db, athlete.id, blockId, [...messages, { role: "error", at, code: errorCode(e) }], state)
      .catch((err) => console.error("adaptation error not stored", err));
    throw e;
  }
  const next: AdaptationState = {
    ...state, conditions: [], restrictions: [], unavailableEquipment: [], pendingQuestions: [], feedback: null, last: result,
  };
  const proposal: AdaptationMessage = { role: "proposal", at, tailored: result.tailored, findings: result.findings };
  await save(db, athlete.id, blockId, [...messages, proposal], next, { model: provider.model });
  return result;
}

export function snapshotOf(accepted: AcceptedAdaptation, messages: AdaptationMessage[]): AdaptationSnapshot {
  const { rawText, changes, safetyNote } = accepted.tailored;
  return { text: rawText, changes, safetyNote, situation: athleteWords(messages) };
}

/**
 * Accepts the last proposal for the block as it is now. An existing result becomes Scaled (barbell results stay Rx)
 * and keeps the snapshot. Accepting the same proposal again changes nothing.
 */
export async function acceptAdaptation(
  db: Db, athlete: AthleteRef, blockId: string, now: Date = new Date(),
): Promise<AcceptedAdaptation> {
  const { block } = await getAdaptableBlock(db, athlete, blockId, now);
  const current = await getAdaptation(db, athlete.id, blockId);
  const last = current?.state?.last;
  if (!current?.state || !last) throw new TrainingError("invalid_state");
  if (current.state.analysisHash !== contentHash(block)) throw new TrainingError("block_changed");
  const hash = workoutHash(block);
  const proposal = { tailored: last.tailored, findings: last.findings };
  const prior = current.accepted;
  if (prior && prior.workoutHash === hash && isDeepStrictEqual({ tailored: prior.tailored, findings: prior.findings }, proposal)) {
    return prior;
  }
  const accepted: AcceptedAdaptation = { ...proposal, workoutHash: hash, acceptedAt: now.toISOString() };
  const snapshot = snapshotOf(accepted, current.messages);
  await db.$transaction(async (tx) => {
    await tx.blockAdaptation.update({ where: key(athlete.id, blockId), data: { accepted: toJson(accepted) } });
    await tx.result.updateMany({
      where: { blockId, athleteId: athlete.id },
      data: { adaptation: toJson(snapshot), ...(block.kind === "barbell" ? {} : { division: "scaled" }) },
    });
  });
  return accepted;
}

/** Clears the accepted version; the conversation and any tagged result stay as they are. */
export async function discardAdaptation(db: Db, athleteId: string, blockId: string): Promise<void> {
  const { count } = await db.blockAdaptation.updateMany({ where: { blockId, athleteId }, data: { accepted: Prisma.DbNull } });
  if (count === 0) throw new TrainingError("not_found");
}
