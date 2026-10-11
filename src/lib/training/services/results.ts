import { toJson } from "@/lib/json";
import { athleteTimeline, hasLeaderboard } from "../access";
import { addDays, canLogDay, dateOfDay, fromDbDate, isDayVisible, toDbDate, todayIn, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { rank } from "../leaderboard";
import { currentOneRm, singleAbove } from "../prs";
import type { ResultInputValue } from "../schemas";
import { evaluateScore, formatScore, scoreTarget, type BarbellResult } from "../scoring";
import { getOwnedProgram, publishedWeeks } from "./programs";
import type { Db } from "./types";

type AthleteRef = { id: string; timezone: string };

/** A block the athlete may see: active enrollment, program not archived, day visible. */
export async function getVisibleBlock(db: Db, athlete: AthleteRef, blockId: string, now: Date = new Date()) {
  const block = await db.block.findUnique({ where: { id: blockId }, include: { program: true } });
  if (!block || block.program.archivedAt) throw new TrainingError("not_found");
  const enrollment = await db.enrollment.findFirst({ where: { programId: block.programId, athleteId: athlete.id, removedAt: null } });
  if (!enrollment) throw new TrainingError("not_found");
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

export type SinglePrompt = { movement: string; from: number | null; to: number };

export async function saveResult(db: Db, athlete: AthleteRef, input: ResultInputValue, now: Date = new Date()) {
  const { block, date, loggable } = await getVisibleBlock(db, athlete, input.blockId, now);
  if (!loggable) throw new TrainingError("not_loggable");
  const evaluated = evaluateScore(scoreTarget(block), input.score);
  if (!evaluated) throw new TrainingError("invalid_score");
  const data = {
    division: block.kind === "barbell" ? "rx" : input.division,
    score: toJson(evaluated.score),
    sortKey: evaluated.sortKey,
    capped: evaluated.capped,
    notes: input.notes,
    performedOn: toDbDate(date),
  };
  const result = await db.result.upsert({
    where: { blockId_athleteId: { blockId: block.id, athleteId: athlete.id } },
    create: { blockId: block.id, athleteId: athlete.id, ...data },
    update: data,
  });

  let singlePrompt: SinglePrompt | null = null;
  if (block.kind === "barbell" && block.movement) {
    const records = await db.personalRecord.findMany({ where: { athleteId: athlete.id, movement: block.movement }, select: { kg: true } });
    const current = currentOneRm(records);
    const top = singleAbove((evaluated.score as BarbellResult).sets, current);
    if (top !== null) singlePrompt = { movement: block.movement, from: current, to: top };
  }
  return { resultId: result.id, singlePrompt };
}

export async function deleteResult(db: Db, athleteId: string, blockId: string) {
  await db.result.deleteMany({ where: { blockId, athleteId } });
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
      where: { blockId: { in: blockIds }, athlete: { enrollments: { some: { programId, removedAt: null } } } },
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
  bumps: number; bumpedByViewer: boolean; own: boolean;
};

type Viewer = { athlete: AthleteRef } | { coachId: string };

async function leaderboardBlock(db: Db, viewer: Viewer, blockId: string) {
  if ("coachId" in viewer) {
    const block = await db.block.findFirst({ where: { id: blockId, program: { coachId: viewer.coachId } }, include: { program: true } });
    if (!block) throw new TrainingError("not_found");
    return block;
  }
  return (await getVisibleBlock(db, viewer.athlete, blockId)).block;
}

export async function getLeaderboard(db: Db, viewer: Viewer, blockId: string) {
  const block = await leaderboardBlock(db, viewer, blockId);
  if (!hasLeaderboard(block, block.program) || !block.program.startDate) throw new TrainingError("not_found");
  const viewerId = "athlete" in viewer ? viewer.athlete.id : null;
  const results = await db.result.findMany({
    where: { blockId, athlete: { enrollments: { some: { programId: block.programId, removedAt: null } } } },
    include: {
      athlete: true,
      _count: { select: { fistBumps: true } },
      fistBumps: { where: { athleteId: viewerId ?? "" }, select: { athleteId: true } },
    },
  });
  const target = scoreTarget(block);
  const entries: LeaderboardEntry[] = rank(results).map((r) => ({
    resultId: r.id, rank: r.rank, athleteId: r.athleteId, displayName: r.athlete.displayName, avatarUrl: r.athlete.avatarUrl,
    division: r.division, capped: r.capped, formatted: formatScore(target, r.score), notes: r.notes,
    bumps: r._count.fistBumps, bumpedByViewer: r.fistBumps.length > 0, own: r.athleteId === viewerId,
  }));
  return { block, date: addDays(fromDbDate(block.program.startDate), block.dayIndex), entries };
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function toggleFistBump(db: Db, athlete: AthleteRef, resultId: string) {
  const result = await db.result.findUnique({ where: { id: resultId } });
  if (!result) throw new TrainingError("not_found");
  const { block } = await getVisibleBlock(db, athlete, result.blockId);
  if (!hasLeaderboard(block, block.program)) throw new TrainingError("not_found");
  if (result.athleteId === athlete.id) throw new TrainingError("own_result");
  const key = { resultId_athleteId: { resultId, athleteId: athlete.id } };
  const existing = await db.fistBump.findUnique({ where: key });
  if (existing) {
    await db.fistBump.delete({ where: key });
  } else {
    try {
      await db.fistBump.create({ data: { resultId, athleteId: athlete.id } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // double tap
    }
  }
  return { bumped: !existing, count: await db.fistBump.count({ where: { resultId } }) };
}

export type CoachResultRow = {
  id: string; athleteId: string; displayName: string; blockId: string; blockTitle: string | null; blockKind: string; blockScoring: string | null;
  division: string; formatted: string; notes: string | null; performedOn: IsoDate;
};

type ResultWithRefs = {
  id: string; athleteId: string; blockId: string; division: string; score: unknown; notes: string | null; performedOn: Date;
  athlete: { displayName: string };
  block: { kind: string; scoring: string | null; timeCapSeconds: number | null; title: string | null; movement: string | null };
};

const toRow = (r: ResultWithRefs): CoachResultRow => ({
  id: r.id, athleteId: r.athleteId, displayName: r.athlete.displayName, blockId: r.blockId,
  blockTitle: r.block.title ?? r.block.movement ?? null, blockKind: r.block.kind, blockScoring: r.block.scoring,
  division: r.division,
  formatted: formatScore(scoreTarget(r.block), r.score), notes: r.notes, performedOn: fromDbDate(r.performedOn),
});

export async function listBlockResults(db: Db, coachId: string, blockId: string) {
  const block = await db.block.findFirst({ where: { id: blockId, program: { coachId } }, include: { program: true } });
  if (!block) throw new TrainingError("not_found");
  const results = await db.result.findMany({
    where: { blockId }, include: { athlete: true, block: true }, orderBy: [{ performedOn: "desc" }, { createdAt: "asc" }],
  });
  return { block, results: results.map(toRow) };
}

export async function listAthleteResults(db: Db, coachId: string, programId: string, athleteId: string) {
  await getOwnedProgram(db, coachId, programId);
  const enrollment = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId, athleteId } }, include: { athlete: true },
  });
  if (!enrollment) throw new TrainingError("not_found");
  const results = await db.result.findMany({
    where: { athleteId, block: { programId } }, include: { athlete: true, block: true }, orderBy: { performedOn: "desc" },
  });
  return { athlete: enrollment.athlete, results: results.map(toRow) };
}
