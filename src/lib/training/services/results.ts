import type { Prisma } from "@/generated/prisma/client";
import { toJson } from "@/lib/json";
import { AdaptationSnapshot } from "../adaptation-types";
import { workoutHash } from "../block-engine";
import { intent, type NotificationIntent } from "@/lib/notifications/notify";
import { activeAthleteIn, athleteTimeline, hasLeaderboard } from "../access";
import { addDays, canLogDay, dateOfDay, fromDbDate, isDayVisible, toDbDate, todayIn, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { rank } from "../leaderboard";
import { getDomainData } from "@/lib/domain/repository";
import { bestSetAbove, findRecordEntry } from "../records";
import type { ResultInputValue } from "../schemas";
import { evaluateScore, formatScore, scoreTarget, type BarbellResult } from "../scoring";
import { getAdaptation, snapshotOf } from "./adaptations";
import { getOwnedProgram, publishedWeeks } from "./programs";
import { liftRows } from "./prs";
import type { Db } from "./types";

type AthleteRef = { id: string; timezone: string };

/** A block the athlete may see: active enrollment not blocked by payment (`payment_required`), program not archived, day visible. */
export async function getVisibleBlock(db: Db, athlete: AthleteRef, blockId: string, now: Date = new Date()) {
  const block = await db.block.findUnique({ where: { id: blockId }, include: { program: true } });
  if (!block || block.program.archivedAt) throw new TrainingError("not_found");
  const enrollment = await db.enrollment.findFirst({ where: { programId: block.programId, athleteId: athlete.id, removedAt: null, leftAt: null } });
  if (!enrollment) throw new TrainingError("not_found");
  if (enrollment.access === "blocked") throw new TrainingError("payment_required");
  const timeline = athleteTimeline(block.program, enrollment, await publishedWeeks(db, block.programId));
  if (!isDayVisible(timeline, block.dayIndex)) throw new TrainingError("not_found");
  const scored = block.kind === "barbell" || (block.scoring !== null && block.scoring !== "none");
  return {
    block,
    timeline,
    date: dateOfDay(timeline, block.dayIndex),
    loggable: scored && canLogDay(timeline, block.dayIndex, todayIn(athlete.timezone, now)),
  };
}

/** A logged set worth saving as a record: `from` is the previous best at its rep count. */
export type SinglePrompt = { movement: string; reps: number; from: number | null; to: number };

/**
 * The snapshot a saved result carries, as stored JSON, or null for an unadapted one. A result already tagged keeps its
 * snapshot as it is (sticky, even after the athlete discards the adaptation, and even when the schema no longer accepts
 * it); otherwise an accepted adaptation that still matches the block tags it.
 */
export async function adaptationToKeep(db: Db, athleteId: string, block: { id: string }): Promise<Prisma.InputJsonValue | null> {
  const existing = await db.result.findUnique({
    where: { blockId_athleteId: { blockId: block.id, athleteId } }, select: { id: true, adaptation: true },
  });
  if (existing?.adaptation != null) {
    if (!AdaptationSnapshot.safeParse(existing.adaptation).success) {
      console.error(`result ${existing.id}: stored adaptation snapshot no longer parses; kept as stored`);
    }
    return existing.adaptation as Prisma.InputJsonValue;
  }
  const adaptation = await getAdaptation(db, athleteId, block.id);
  if (!adaptation?.accepted) return null;
  const row = await db.block.findUniqueOrThrow({ where: { id: block.id } });
  if (adaptation.accepted.workoutHash !== workoutHash(row)) return null;
  return toJson(snapshotOf(adaptation.accepted, adaptation.messages));
}

export async function saveResult(db: Db, athlete: AthleteRef, input: ResultInputValue, now: Date = new Date()) {
  const { block, date, loggable } = await getVisibleBlock(db, athlete, input.blockId, now);
  if (!loggable) throw new TrainingError("not_loggable");
  const evaluated = evaluateScore(scoreTarget(block), input.score);
  if (!evaluated) throw new TrainingError("invalid_score");
  const adaptation = await adaptationToKeep(db, athlete.id, block);
  const data = {
    division: block.kind === "barbell" ? "rx" : adaptation !== null ? "scaled" : input.division,
    score: toJson(evaluated.score),
    sortKey: evaluated.sortKey,
    capped: evaluated.capped,
    notes: input.notes,
    performedOn: toDbDate(date),
  };
  const result = await db.result.upsert({
    where: { blockId_athleteId: { blockId: block.id, athleteId: athlete.id } },
    create: { blockId: block.id, athleteId: athlete.id, ...data, ...(adaptation !== null && { adaptation }) },
    update: { ...data, ...(adaptation !== null && { adaptation }) },
  });

  let singlePrompt: SinglePrompt | null = null;
  const catalogLift = block.kind === "barbell" && block.movement !== null
    && findRecordEntry((await getDomainData(db)).records, block.movement)?.kind === "lift";
  if (adaptation === null && catalogLift && block.movement) {
    const best = bestSetAbove((evaluated.score as BarbellResult).sets, await liftRows(db, athlete.id, block.movement));
    if (best !== null) singlePrompt = { movement: block.movement, ...best };
  }
  return { resultId: result.id, singlePrompt };
}

/** Same access rule as saving: the block must be visible and its day loggable. */
export async function deleteResult(db: Db, athlete: AthleteRef, blockId: string, now: Date = new Date()) {
  const { loggable } = await getVisibleBlock(db, athlete, blockId, now);
  if (!loggable) throw new TrainingError("not_loggable");
  const result = await db.result.findUnique({ where: { blockId_athleteId: { blockId, athleteId: athlete.id } } });
  if (!result) throw new TrainingError("not_found");
  const owner = await db.athleteAccount.findUniqueOrThrow({ where: { id: athlete.id }, select: { userId: true } });
  // The grouped fist-bump entry points at a result that no longer exists.
  await db.$transaction([
    db.result.deleteMany({ where: { id: result.id } }),
    db.notification.deleteMany({ where: { userId: owner.userId, groupKey: `fist_bump:${result.id}` } }),
  ]);
}

export function getMyResult(db: Db, athleteId: string, blockId: string) {
  return db.result.findUnique({ where: { blockId_athleteId: { blockId, athleteId } } });
}

/** The viewer's results and the active-athlete score counts for the blocks of one day. */
export async function getDayResults(db: Db, athleteId: string, programId: string, blockIds: string[]) {
  if (blockIds.length === 0) return { mine: new Map(), counts: new Map<string, number>() };
  const [mine, counts] = await Promise.all([
    db.result.findMany({ where: { athleteId, blockId: { in: blockIds } } }),
    db.result.groupBy({
      by: ["blockId"],
      where: { blockId: { in: blockIds }, athlete: activeAthleteIn(programId) },
      _count: { _all: true },
    }),
  ]);
  return {
    mine: new Map(mine.map((r) => [r.blockId, r])),
    counts: new Map(counts.map((c) => [c.blockId, c._count._all])),
  };
}

export type LeaderboardEntry = {
  resultId: string; rank: number; athleteId: string; displayName: string; avatarUrl: string | null;
  division: string; capped: boolean; formatted: string; notes: string | null;
  bumps: number; bumpedByViewer: boolean; own: boolean; adapted: boolean;
};

/** The coach's leaderboard row: the entry plus the adaptation snapshot (athlete entries never carry it). */
export type CoachLeaderboardEntry = LeaderboardEntry & { adaptation: AdaptationSnapshot | null };

type Viewer = { athlete: AthleteRef } | { coachId: string };

async function leaderboardBlock(db: Db, viewer: Viewer, blockId: string) {
  if ("coachId" in viewer) return coachBlock(db, viewer.coachId, blockId);
  return (await getVisibleBlock(db, viewer.athlete, blockId)).block;
}

type BoardBlock = Awaited<ReturnType<typeof leaderboardBlock>>;

export async function getLeaderboard(db: Db, viewer: Viewer, blockId: string, locale = "en") {
  const block = await leaderboardBlock(db, viewer, blockId);
  const { date, entries } = await leaderboardOf(db, block, "athlete" in viewer ? viewer.athlete.id : null, locale);
  return { block, date, entries };
}

async function leaderboardOf(db: Db, block: BoardBlock, viewerId: string | null, locale: string) {
  if (!hasLeaderboard(block, block.program) || !block.program.startDate) throw new TrainingError("not_found");
  const results = await db.result.findMany({
    where: {
      blockId: block.id,
      athlete: activeAthleteIn(block.programId),
    },
    include: {
      athlete: true,
      _count: { select: { fistBumps: true } },
      fistBumps: { where: { athleteId: viewerId ?? "" }, select: { athleteId: true } },
    },
  });
  const target = scoreTarget(block);
  const entries: LeaderboardEntry[] = rank(results).map((r) => ({
    resultId: r.id, rank: r.rank, athleteId: r.athleteId, displayName: r.athlete.displayName, avatarUrl: r.athlete.avatarUrl,
    division: r.division, capped: r.capped, formatted: formatScore(target, r.score, locale), notes: r.notes,
    bumps: r._count.fistBumps, bumpedByViewer: r.fistBumps.length > 0, own: r.athleteId === viewerId,
    adapted: r.adaptation != null,
  }));
  // Snapshots stay out of the entries: only the coach path reads them (athletes never see each other's adaptations).
  const snapshots = new Map(results.map((r) => [r.id, parseSnapshot(r.adaptation)]));
  return { block, date: addDays(fromDbDate(block.program.startDate), block.dayIndex), entries, snapshots };
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function toggleFistBump(
  db: Db, athlete: AthleteRef, resultId: string,
): Promise<{ bumped: boolean; count: number; intents: NotificationIntent[] }> {
  const result = await db.result.findUnique({ where: { id: resultId } });
  if (!result) throw new TrainingError("not_found");
  const { block } = await getVisibleBlock(db, athlete, result.blockId);
  if (!hasLeaderboard(block, block.program)) throw new TrainingError("not_found");
  if (result.athleteId === athlete.id) throw new TrainingError("own_result");
  // The leaderboard hides athletes who left or were removed: their results cannot be bumped (or notified) either.
  const ownerEnrollment = await db.enrollment.findFirst({
    where: { programId: block.programId, athleteId: result.athleteId, removedAt: null, leftAt: null }, select: { access: true },
  });
  if (!ownerEnrollment) throw new TrainingError("not_found");
  const key = { resultId_athleteId: { resultId, athleteId: athlete.id } };
  const existing = await db.fistBump.findUnique({ where: key });
  if (existing) {
    await db.fistBump.deleteMany({ where: { resultId, athleteId: athlete.id } }); // idempotent on a double tap
  } else {
    try {
      await db.fistBump.create({ data: { resultId, athleteId: athlete.id } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // double tap
    }
  }
  const count = await db.fistBump.count({ where: { resultId } });
  if (existing) return { bumped: false, count, intents: [] };

  const [owner, bumper] = await Promise.all([
    db.athleteAccount.findUniqueOrThrow({ where: { id: result.athleteId }, select: { userId: true, locale: true, disabledAt: true } }),
    db.athleteAccount.findUniqueOrThrow({ where: { id: athlete.id }, select: { displayName: true } }),
  ]);
  // A blocked owner stays on the leaderboard but gets no program notifications.
  if (owner.disabledAt || ownerEnrollment.access === "blocked") return { bumped: true, count, intents: [] };
  const { title, movement, kind, scoring } = block;
  const intents = [intent(
    "fist_bump", [{ userId: owner.userId, locale: owner.locale }],
    { resultId, blockId: block.id, block: { title, movement, kind, scoring }, latestName: bumper.displayName, count },
    { entityId: resultId, groupKey: `fist_bump:${resultId}` },
  )];
  return { bumped: true, count, intents };
}

export type CoachResultRow = {
  id: string; athleteId: string; displayName: string; blockId: string; blockTitle: string | null; blockMovement: string | null; blockKind: string; blockScoring: string | null;
  division: string; formatted: string; notes: string | null; performedOn: IsoDate; adaptation: AdaptationSnapshot | null;
};

type ResultWithRefs = {
  id: string; athleteId: string; blockId: string; division: string; score: unknown; notes: string | null; performedOn: Date; adaptation: unknown;
  athlete: { displayName: string };
  block: { kind: string; scoring: string | null; timeCapSeconds: number | null; title: string | null; movement: string | null };
};

const parseSnapshot = (value: unknown) => AdaptationSnapshot.nullable().catch(null).parse(value ?? null);

const toRow = (locale: string) => (r: ResultWithRefs): CoachResultRow => ({
  id: r.id, athleteId: r.athleteId, displayName: r.athlete.displayName, blockId: r.blockId,
  blockTitle: r.block.title, blockMovement: r.block.movement, blockKind: r.block.kind, blockScoring: r.block.scoring,
  division: r.division,
  formatted: formatScore(scoreTarget(r.block), r.score, locale), notes: r.notes, performedOn: fromDbDate(r.performedOn),
  adaptation: parseSnapshot(r.adaptation),
});

async function coachBlock(db: Db, coachId: string, blockId: string) {
  const block = await db.block.findFirst({ where: { id: blockId, program: { coachId } }, include: { program: true } });
  if (!block) throw new TrainingError("not_found");
  return block;
}

/** The coach's view of one block: its leaderboard when it has one, else the plain list. One block lookup either way. */
export async function getCoachBlockResults(db: Db, coachId: string, blockId: string, locale = "en") {
  const block = await coachBlock(db, coachId, blockId);
  if (hasLeaderboard(block, block.program)) {
    const { entries, snapshots } = await leaderboardOf(db, block, null, locale);
    const withSnapshot: CoachLeaderboardEntry[] = entries.map((e) => ({ ...e, adaptation: snapshots.get(e.resultId) ?? null }));
    return { block, entries: withSnapshot, results: null };
  }
  return { block, entries: null, results: await blockResultRows(db, block, locale) };
}

export async function listBlockResults(db: Db, coachId: string, blockId: string, locale = "en") {
  const block = await coachBlock(db, coachId, blockId);
  return { block, results: await blockResultRows(db, block, locale) };
}

async function blockResultRows(db: Db, block: { id: string; programId: string }, locale: string) {
  const results = await db.result.findMany({
    where: { blockId: block.id, athlete: activeAthleteIn(block.programId) }, include: { athlete: true, block: true },
    orderBy: [{ performedOn: "desc" }, { createdAt: "asc" }],
  });
  return results.map(toRow(locale));
}

export async function listAthleteResults(db: Db, coachId: string, programId: string, athleteId: string, locale = "en") {
  await getOwnedProgram(db, coachId, programId);
  const enrollment = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId, athleteId } }, include: { athlete: true },
  });
  if (!enrollment) throw new TrainingError("not_found");
  const results = await db.result.findMany({
    where: { athleteId, block: { programId }, athlete: { disabledAt: null } }, include: { athlete: true, block: true },
    orderBy: { performedOn: "desc" },
  });
  return { athlete: enrollment.athlete, results: results.map(toRow(locale)) };
}
