import { TrainingError } from "../errors";
import type { Db } from "./types";

const PAGE_SIZE = 50;
const WEEK_MS = 7 * 24 * 3_600_000;

export type AdminOverview = {
  pendingCoaches: number; approvedCoaches: number; athletes: number; activePrograms: number; resultsLast7Days: number;
};

export async function getOverview(db: Db, now: Date = new Date()): Promise<AdminOverview> {
  const [pendingCoaches, approvedCoaches, athletes, activePrograms, resultsLast7Days] = await Promise.all([
    db.coachAccount.count({ where: { status: "pending" } }),
    db.coachAccount.count({ where: { status: "approved" } }),
    db.athleteAccount.count(),
    db.program.count({
      where: { archivedAt: null, OR: [{ coachId: { not: null } }, { enrollments: { some: { removedAt: null, leftAt: null } } }] },
    }),
    db.result.count({ where: { createdAt: { gte: new Date(now.getTime() - WEEK_MS), lte: now } } }),
  ]);
  return { pendingCoaches, approvedCoaches, athletes, activePrograms, resultsLast7Days };
}

/** Case-insensitive match on display name or email, for the coach and athlete lists. */
function searchFilter(search: string | undefined) {
  const q = search?.trim();
  if (!q) return {};
  return {
    OR: [
      { displayName: { contains: q, mode: "insensitive" as const } },
      { user: { email: { contains: q, mode: "insensitive" as const } } },
    ],
  };
}

export type AdminCoachRow = {
  id: string; userId: string; email: string; displayName: string; status: string; createdAt: Date; programs: number;
};

/** Pending coaches first, then the rest; each group newest first. */
export async function listCoaches(
  db: Db, q: { search?: string; status?: string; page: number },
): Promise<{ rows: AdminCoachRow[]; hasMore: boolean }> {
  const base = { ...searchFilter(q.search), ...(q.status ? { status: q.status } : {}) };
  const include = { user: { select: { email: true } }, _count: { select: { programs: true } } };
  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const skip = q.page * PAGE_SIZE;
  const take = PAGE_SIZE + 1;

  // A status filter is one bucket. Otherwise two ordered buckets (pending, then others) read as one sequence, so paging stays exact.
  const pendingWhere = { AND: [base, { status: "pending" }] };
  const othersWhere = { AND: [base, { status: { not: "pending" } }] };
  const found = [];
  if (q.status) {
    found.push(...(await db.coachAccount.findMany({ where: base, include, orderBy, skip, take })));
  } else {
    const [pendingCount, pending] = await Promise.all([
      db.coachAccount.count({ where: pendingWhere }),
      db.coachAccount.findMany({ where: pendingWhere, include, orderBy, skip, take }),
    ]);
    found.push(...pending);
    if (found.length < take) {
      found.push(...(await db.coachAccount.findMany({
        where: othersWhere, include, orderBy, skip: Math.max(0, skip - pendingCount), take: take - found.length,
      })));
    }
  }
  return {
    rows: found.slice(0, PAGE_SIZE).map((c) => ({
      id: c.id, userId: c.userId, email: c.user.email, displayName: c.displayName, status: c.status,
      createdAt: c.createdAt, programs: c._count.programs,
    })),
    hasMore: found.length > PAGE_SIZE,
  };
}

export type AdminAthleteRow = {
  id: string; userId: string; email: string; displayName: string; disabledAt: Date | null; createdAt: Date;
  enrollments: number;
};

export async function listAthletes(
  db: Db, q: { search?: string; page: number },
): Promise<{ rows: AdminAthleteRow[]; hasMore: boolean }> {
  const found = await db.athleteAccount.findMany({
    where: searchFilter(q.search),
    include: { user: { select: { email: true } }, _count: { select: { enrollments: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: q.page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  return {
    rows: found.slice(0, PAGE_SIZE).map((a) => ({
      id: a.id, userId: a.userId, email: a.user.email, displayName: a.displayName, disabledAt: a.disabledAt,
      createdAt: a.createdAt, enrollments: a._count.enrollments,
    })),
    hasMore: found.length > PAGE_SIZE,
  };
}

/** Continuous: highest published week index (null if none). Closed programs publish as a whole: null. */
function lastPublishedWeek(kind: string, weeks: { weekIndex: number }[]): number | null {
  if (kind !== "continuous" || weeks.length === 0) return null;
  return Math.max(...weeks.map((w) => w.weekIndex));
}

export type AdminCoachProgram = {
  id: string; name: string; kind: string; athletes: number; lastPublishedWeek: number | null;
  publishedAt: Date | null; archivedAt: Date | null;
};
export type AdminCoachDetail = Omit<AdminCoachRow, "programs"> & {
  locale: string | null;
  /** The same person's athlete profile, when they have one. */
  athleteId: string | null;
  programs: AdminCoachProgram[];
};

export async function getCoachDetail(db: Db, coachId: string): Promise<AdminCoachDetail> {
  const coach = await db.coachAccount.findUnique({
    where: { id: coachId },
    include: {
      user: { select: { email: true, athleteAccount: { select: { id: true } } } },
      programs: {
        orderBy: { createdAt: "desc" },
        include: {
          weeksPublished: { select: { weekIndex: true } },
          _count: { select: { enrollments: { where: { removedAt: null, leftAt: null } } } },
        },
      },
    },
  });
  if (!coach) throw new TrainingError("not_found");
  return {
    id: coach.id, userId: coach.userId, email: coach.user.email, displayName: coach.displayName, status: coach.status,
    createdAt: coach.createdAt, locale: coach.locale, athleteId: coach.user.athleteAccount?.id ?? null,
    programs: coach.programs.map((p) => ({
      id: p.id, name: p.name, kind: p.kind, athletes: p._count.enrollments,
      lastPublishedWeek: lastPublishedWeek(p.kind, p.weeksPublished), publishedAt: p.publishedAt, archivedAt: p.archivedAt,
    })),
  };
}

export type AdminAthleteEnrollment = {
  programId: string; programName: string; coachName: string; joinedAt: Date; removedAt: Date | null;
};
export type AdminAthleteDetail = Omit<AdminAthleteRow, "enrollments"> & {
  timezone: string; locale: string | null;
  /** The same person's coach profile, when they have one. */
  coachId: string | null;
  enrollments: AdminAthleteEnrollment[];
  results: number;
};

export async function getAthleteDetail(db: Db, athleteId: string): Promise<AdminAthleteDetail> {
  const athlete = await db.athleteAccount.findUnique({
    where: { id: athleteId },
    include: {
      user: { select: { email: true, coachAccount: { select: { id: true } } } },
      enrollments: { orderBy: { joinedAt: "desc" }, include: { program: { select: { id: true, name: true, coachName: true } } } },
      _count: { select: { results: true } },
    },
  });
  if (!athlete) throw new TrainingError("not_found");
  return {
    id: athlete.id, userId: athlete.userId, email: athlete.user.email, displayName: athlete.displayName,
    disabledAt: athlete.disabledAt, createdAt: athlete.createdAt, timezone: athlete.timezone, locale: athlete.locale,
    coachId: athlete.user.coachAccount?.id ?? null,
    enrollments: athlete.enrollments.map((e) => ({
      programId: e.program.id, programName: e.program.name, coachName: e.program.coachName,
      joinedAt: e.joinedAt, removedAt: e.removedAt,
    })),
    results: athlete._count.results,
  };
}

export type AdminProgramRow = {
  id: string; name: string; coachName: string; coachId: string | null; kind: string; activeAthletes: number;
  lastPublishedWeek: number | null; publishedAt: Date | null; archivedAt: Date | null; inviteDisabledAt: Date | null;
  /** False when there is no coach or the coach is not approved: invitation links are refused whatever the program's own flag says. */
  coachAvailable: boolean;
};

export async function listPrograms(
  db: Db, q: { search?: string; page: number },
): Promise<{ rows: AdminProgramRow[]; hasMore: boolean }> {
  const s = q.search?.trim();
  const found = await db.program.findMany({
    where: s
      ? { OR: [{ name: { contains: s, mode: "insensitive" } }, { coachName: { contains: s, mode: "insensitive" } }] }
      : {},
    include: {
      coach: { select: { status: true } },
      weeksPublished: { select: { weekIndex: true } },
      _count: { select: { enrollments: { where: { removedAt: null, leftAt: null } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: q.page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  return {
    rows: found.slice(0, PAGE_SIZE).map((p) => ({
      id: p.id, name: p.name, coachName: p.coachName, coachId: p.coachId, kind: p.kind,
      activeAthletes: p._count.enrollments, lastPublishedWeek: lastPublishedWeek(p.kind, p.weeksPublished),
      publishedAt: p.publishedAt, archivedAt: p.archivedAt, inviteDisabledAt: p.inviteDisabledAt,
      coachAvailable: p.coach?.status === "approved",
    })),
    hasMore: found.length > PAGE_SIZE,
  };
}
