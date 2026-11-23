import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { fakeStripe } from "../../helpers/fake-stripe";
import {
  blockAccess, enroll, leave, makeAthlete, makeClosed, makeCoach, makeContinuous, makePaidContinuous, makeResult,
  makeCustomBlock, makeSubscriptionPurchase, makeUser, publishWeek,
} from "../../helpers/factories";
import { refreshAccess } from "@/lib/training/services/access-store";
import {
  athleteSubscriptions, countPendingCancellations, retryCancellations, subscriptionEndings,
} from "@/lib/training/services/payments";
import { listCoachPrograms } from "@/lib/training/services/programs";
import { getDayResults, getLeaderboard, getVisibleBlock } from "@/lib/training/services/results";
import {
  canCreateAthleteProfile, findProgramByCode, getBlockEnrollmentStatus, getEnrollmentStatus, joinByCode, leaveProgram, listAthletePrograms, listRoster, setEnrollmentRemoved,
} from "@/lib/training/services/enrollments";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("enrollments", () => {
  it("joins a continuous program once, without a start date", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const first = await joinByCode(tdb.prisma, athlete, p.inviteCode);
    expect(first).toMatchObject({ programId: p.id, status: "joined" });
    expect(first.intents).toHaveLength(1);
    expect(await joinByCode(tdb.prisma, athlete, p.inviteCode)).toEqual({ programId: p.id, status: "already", intents: [] });
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(e.startDate).toBeNull();
  });

  it("starts a closed program on the athlete's local today", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma, "Europe/Madrid");
    const p = await makeClosed(tdb.prisma, coach.id, 4, true);
    await joinByCode(tdb.prisma, athlete, p.inviteCode, new Date("2026-10-07T23:30:00Z"));
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(e.startDate?.toISOString().slice(0, 10)).toBe("2026-10-08");
  });

  it("rejects unknown, archived and unpublished-closed invitations", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const draft = await makeClosed(tdb.prisma, coach.id, 4, false);
    const archived = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    for (const code of ["nope", draft.inviteCode, archived.inviteCode]) {
      await expect(joinByCode(tdb.prisma, athlete, code)).rejects.toMatchObject({ code: "invite_invalid" });
      expect(await findProgramByCode(tdb.prisma, code)).toBeNull();
    }
  });

  it("rejects invitations of programs without an approved coach or with the link disabled", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    const suspended = await makeCoach(tdb.prisma, "suspended");
    const coach = await makeCoach(tdb.prisma);
    const ofSuspended = await makeContinuous(tdb.prisma, suspended.id);
    const coachless = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: coachless.id }, data: { coachId: null } });
    const disabled = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: disabled.id }, data: { inviteDisabledAt: new Date() } });
    for (const code of [ofSuspended.inviteCode, coachless.inviteCode, disabled.inviteCode]) {
      await expect(joinByCode(tdb.prisma, athlete, code)).rejects.toMatchObject({ code: "invite_invalid" });
      expect(await findProgramByCode(tdb.prisma, code)).toBeNull();
    }
  });

  it("keeps removed athletes out until the coach restores them", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, p.inviteCode);
    const [row] = await listRoster(tdb.prisma, coach.id, p.id);
    await setEnrollmentRemoved(tdb.prisma, null, coach.id, row.id, true);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("removed");
    await expect(joinByCode(tdb.prisma, athlete, p.inviteCode)).rejects.toMatchObject({ code: "enrollment_removed" });
    expect(await listAthletePrograms(tdb.prisma, athlete.id)).toHaveLength(0);
    await setEnrollmentRemoved(tdb.prisma, null, coach.id, row.id, false);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("active");
    expect(await listAthletePrograms(tdb.prisma, athlete.id)).toHaveLength(1);
  });

  it("a paid program cannot be joined by code without access; a left athlete with access rejoins", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: p.id }, data: { priceAmount: 1500, currency: "eur", paidSince: new Date() } });
    await expect(joinByCode(tdb.prisma, athlete, p.inviteCode)).rejects.toMatchObject({ code: "payment_required" });
    expect(await tdb.prisma.enrollment.count()).toBe(0);

    const e = await enroll(tdb.prisma, p.id, athlete.id);
    await leave(tdb.prisma, e.id);
    await expect(joinByCode(tdb.prisma, athlete, p.inviteCode)).rejects.toMatchObject({ code: "payment_required" });
    await tdb.prisma.enrollment.update({ where: { id: e.id }, data: { accessGrantedAt: new Date() } });
    expect(await joinByCode(tdb.prisma, athlete, p.inviteCode)).toMatchObject({ status: "rejoined" });
  });

  it("hides the roster from other coaches", async () => {
    const coach = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, p.inviteCode);
    const [row] = await listRoster(tdb.prisma, coach.id, p.id);
    await expect(listRoster(tdb.prisma, other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(setEnrollmentRemoved(tdb.prisma, null, other.id, row.id, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the athlete's programs newest first, without archived ones", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const a = await makeContinuous(tdb.prisma, coach.id);
    const b = await makeClosed(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, a.inviteCode);
    await joinByCode(tdb.prisma, athlete, b.inviteCode);
    expect((await listAthletePrograms(tdb.prisma, athlete.id)).map((e) => e.programId)).toEqual([b.id, a.id]);
    await tdb.prisma.program.update({ where: { id: b.id }, data: { archivedAt: new Date() } });
    expect((await listAthletePrograms(tdb.prisma, athlete.id)).map((e) => e.programId)).toEqual([a.id]);
  });
});

describe("leaving and rejoining", () => {
  it("rejoins with the same link, keeping joinedAt, startDate and results", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const athlete = await makeAthlete(db);
    const p = await makeClosed(db, coach.id, 4, true);
    const e = await enroll(db, p.id, athlete.id, "2026-10-05");
    const block = await makeCustomBlock(db, p.id, 0);
    await makeResult(db, block.id, athlete.id);
    const { intents: left, endsOn } = await leaveProgram(db, null, athlete, p.id);
    expect(endsOn).toBeNull();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ kind: "athlete_left", recipients: [{ userId: coach.userId }], data: { programId: p.id, programName: p.name, athleteName: athlete.displayName } });
    expect(await getEnrollmentStatus(db, athlete.id, p.id)).toBe("left");
    expect(await listAthletePrograms(db, athlete.id)).toHaveLength(0);
    const r = await joinByCode(db, athlete, p.inviteCode, new Date("2026-11-20T10:00:00Z"));
    expect(r).toMatchObject({ programId: p.id, status: "rejoined" });
    expect(r.intents).toHaveLength(1);
    expect(r.intents[0]).toMatchObject({ kind: "athlete_joined", recipients: [{ userId: coach.userId }] });
    const after = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.leftAt).toBeNull();
    expect(after.joinedAt).toEqual(e.joinedAt);
    expect(after.startDate).toEqual(e.startDate);
    expect(await db.result.count({ where: { athleteId: athlete.id } })).toBe(1);
    expect(await getEnrollmentStatus(db, athlete.id, p.id)).toBe("active");
  });

  it("refuses to rejoin when the coach removed the athlete after they left", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const athlete = await makeAthlete(db);
    const p = await makeContinuous(db, coach.id);
    const e = await enroll(db, p.id, athlete.id);
    await leave(db, e.id);
    await setEnrollmentRemoved(db, null, coach.id, e.id, true);
    expect(await getEnrollmentStatus(db, athlete.id, p.id)).toBe("removed");
    await expect(joinByCode(db, athlete, p.inviteCode)).rejects.toMatchObject({ code: "enrollment_removed" });
  });

  it("throws not_enrolled when leaving a removed, left or unknown enrollment", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const athlete = await makeAthlete(db);
    const p = await makeContinuous(db, coach.id);
    await expect(leaveProgram(db, null, athlete, p.id)).rejects.toMatchObject({ code: "not_enrolled" });
    const e = await enroll(db, p.id, athlete.id);
    await setEnrollmentRemoved(db, null, coach.id, e.id, true);
    await expect(leaveProgram(db, null, athlete, p.id)).rejects.toMatchObject({ code: "not_enrolled" });
    await setEnrollmentRemoved(db, null, coach.id, e.id, false);
    await leaveProgram(db, null, athlete, p.id);
    await expect(leaveProgram(db, null, athlete, p.id)).rejects.toMatchObject({ code: "not_enrolled" });
  });

  it("treats a left athlete as inactive in views, leaderboard and day results", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const ana = await makeAthlete(db);
    const ben = await makeAthlete(db);
    const p = await makeContinuous(db, coach.id, "2026-10-05");
    await publishWeek(db, p.id, 0);
    const ea = await enroll(db, p.id, ana.id);
    await enroll(db, p.id, ben.id);
    const wod = await makeCustomBlock(db, p.id, 0);
    await makeResult(db, wod.id, ana.id);
    await makeResult(db, wod.id, ben.id);
    const now = new Date("2026-10-07T18:00:00Z");
    expect((await getLeaderboard(db, { athlete: ben }, wod.id)).entries).toHaveLength(2);
    await leave(db, ea.id);
    expect((await getLeaderboard(db, { athlete: ben }, wod.id)).entries).toHaveLength(1);
    expect((await getDayResults(db, ben.id, p.id, [wod.id])).counts.get(wod.id)).toBe(1);
    await expect(getVisibleBlock(db, ana, wod.id, now)).rejects.toMatchObject({ code: "not_found" });
    expect((await listCoachPrograms(db, coach.id))[0]._count.enrollments).toBe(1);
  });

  it("sends no intent when the coach joins their own program or is not approved", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const p = await makeContinuous(db, coach.id);
    const self = await db.athleteAccount.create({ data: { userId: coach.userId, displayName: "Coach", timezone: "Europe/Madrid" } });
    expect((await joinByCode(db, self, p.inviteCode)).intents).toEqual([]);
    expect((await leaveProgram(db, null, self, p.id)).intents).toEqual([]);

    const suspended = await makeCoach(db, "suspended");
    const q = await makeContinuous(db, suspended.id);
    const ath = await makeAthlete(db);
    await enroll(db, q.id, ath.id);
    expect((await leaveProgram(db, null, ath, q.id)).intents).toEqual([]);
  });
});

describe("canCreateAthleteProfile", () => {
  it("lets an athlete who already has a profile through in any mode", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    expect(await canCreateAthleteProfile(tdb.prisma, athlete.userId, "/", "invite_only")).toBe(true);
  });

  it("lets anyone through in open mode", async () => {
    const user = await makeUser(tdb.prisma);
    expect(await canCreateAthleteProfile(tdb.prisma, user.id, "/", "open")).toBe(true);
  });

  it("in invite_only mode, needs next to be /join/<a code that can be joined>", async () => {
    const db = tdb.prisma;
    const user = await makeUser(db);
    const coach = await makeCoach(db);
    const valid = await makeContinuous(db, coach.id);
    expect(await canCreateAthleteProfile(db, user.id, `/join/${valid.inviteCode}`, "invite_only")).toBe(true);

    const archived = await makeContinuous(db, coach.id);
    await db.program.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const disabled = await makeContinuous(db, coach.id);
    await db.program.update({ where: { id: disabled.id }, data: { inviteDisabledAt: new Date() } });
    const coachless = await makeContinuous(db, coach.id);
    await db.program.update({ where: { id: coachless.id }, data: { coachId: null } });
    const refused = [
      "/", "/join/nope", `/join/${archived.inviteCode}`, `/join/${disabled.inviteCode}`, `/join/${coachless.inviteCode}`,
      `/join/${valid.inviteCode}/x`, `//evil/join/${valid.inviteCode}`, `/join/x/../${valid.inviteCode}`,
      `https://evil.test/join/${valid.inviteCode}`,
    ];
    for (const next of refused) {
      expect(await canCreateAthleteProfile(db, user.id, next, "invite_only"), next).toBe(false);
    }
  });
});

describe("coachless programs", () => {
  it("are still listed for their enrolled athlete after the coach is deleted", async () => {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const athlete = await makeAthlete(db);
    const p = await makeClosed(db, coach.id, 4, true);
    await enroll(db, p.id, athlete.id, "2026-10-05");
    await db.program.update({ where: { id: p.id }, data: { coachId: null, coachName: coach.displayName } });
    await db.coachAccount.delete({ where: { id: coach.id } });
    const listed = await listAthletePrograms(db, athlete.id);
    expect(listed.map((e) => e.programId)).toEqual([p.id]);
    expect(listed[0].program).toMatchObject({ coach: null, coachName: coach.displayName });
  });
});

describe("getBlockEnrollmentStatus", () => {
  it("tells whether the athlete is active, left, removed or never in the block's program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const block = await makeCustomBlock(tdb.prisma, p.id, 0);
    expect(await getBlockEnrollmentStatus(tdb.prisma, athlete.id, block.id)).toBeNull();
    const e = await enroll(tdb.prisma, p.id, athlete.id);
    expect(await getBlockEnrollmentStatus(tdb.prisma, athlete.id, block.id)).toEqual({ programId: p.id, status: "active" });
    await leave(tdb.prisma, e.id);
    expect(await getBlockEnrollmentStatus(tdb.prisma, athlete.id, block.id)).toEqual({ programId: p.id, status: "left" });
    await setEnrollmentRemoved(tdb.prisma, null, coach.id, e.id, true);
    expect(await getBlockEnrollmentStatus(tdb.prisma, athlete.id, block.id)).toEqual({ programId: p.id, status: "removed" });
  });

  it("is null for an unknown block", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    expect(await getBlockEnrollmentStatus(tdb.prisma, athlete.id, "nope")).toBeNull();
  });
});

describe("blocked enrollments", () => {
  it("getEnrollmentStatus returns blocked", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const e = await enroll(tdb.prisma, p.id, athlete.id);
    await blockAccess(tdb.prisma, e.id);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("blocked");
    await leave(tdb.prisma, e.id);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("left");
  });

  it("listAthletePrograms includes blocked programs with access", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const free = await makeContinuous(tdb.prisma, coach.id);
    const paid = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, free.id, athlete.id);
    await blockAccess(tdb.prisma, (await enroll(tdb.prisma, paid.id, athlete.id)).id);
    const listed = await listAthletePrograms(tdb.prisma, athlete.id);
    expect(Object.fromEntries(listed.map((e) => [e.programId, e.access]))).toEqual({ [free.id]: "free", [paid.id]: "blocked" });
  });
});

describe("leaving and removal of a paying athlete", () => {
  const acct = "acct_test";
  const periodEnd = new Date("2026-12-23T00:00:00Z");

  /** An athlete subscribed (`sub_1`) to a paid continuous program. */
  async function subscribed(gw: ReturnType<typeof fakeStripe>) {
    const db = tdb.prisma;
    const coach = await makeCoach(db);
    const program = await makePaidContinuous(db, coach.id);
    const athlete = await makeAthlete(db);
    const enrollment = await enroll(db, program.id, athlete.id);
    await makeSubscriptionPurchase(db, program.id, athlete.id, acct, "1", { currentPeriodEnd: periodEnd });
    gw.addSubscription("sub_1", { currentPeriodEnd: periodEnd });
    await refreshAccess(db, program.id, athlete.id);
    return { coach, program, athlete, enrollment };
  }
  const purchase = () => tdb.prisma.programPurchase.findUniqueOrThrow({ where: { checkoutSessionId: "cs_1" } });
  const stripeCalls = (gw: ReturnType<typeof fakeStripe>, method: string) => gw.calls.filter((c) => c.method === method);

  it("leaving a paid continuous program sets cancel at period end and keeps access", async () => {
    const gw = fakeStripe();
    const { coach, program, athlete, enrollment } = await subscribed(gw);
    const first = await leaveProgram(tdb.prisma, gw.gateway, athlete, program.id);
    expect(first.endsOn).toEqual(periodEnd);
    expect(first.intents).toHaveLength(1);
    expect(first.intents[0]).toMatchObject({ kind: "athlete_left", recipients: [{ userId: coach.userId }] });
    expect(stripeCalls(gw, "setCancelAtPeriodEnd")).toEqual([
      { method: "setCancelAtPeriodEnd", args: [acct, "sub_1", true] },
    ]);
    expect(await purchase()).toMatchObject({ cancelAtPeriodEnd: true, status: "active", endedReason: null });
    expect(await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } }))
      .toMatchObject({ leftAt: null, access: "paid" });
    expect(await subscriptionEndings(tdb.prisma, program.id)).toEqual(new Map([[athlete.id, periodEnd]]));
    expect(await athleteSubscriptions(tdb.prisma, athlete.id))
      .toEqual(new Map([[program.id, { currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true }]]));

    // Leaving again changes nothing and tells the same date.
    expect(await leaveProgram(tdb.prisma, gw.gateway, athlete, program.id)).toEqual({ intents: [], endsOn: periodEnd });
    expect(stripeCalls(gw, "setCancelAtPeriodEnd")).toHaveLength(1);
  });

  it("leaving a paid continuous program fails without changes when Stripe fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const gw = fakeStripe();
    const { program, athlete, enrollment } = await subscribed(gw);
    gw.state.failing.add("setCancelAtPeriodEnd");
    await expect(leaveProgram(tdb.prisma, gw.gateway, athlete, program.id))
      .rejects.toMatchObject({ code: "subscription_sync_failed" });
    expect((await purchase()).cancelAtPeriodEnd).toBe(false);
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).leftAt).toBeNull();
    error.mockRestore();
  });

  it("leaving with an unpaid subscription cancels it at once and leaves", async () => {
    const gw = fakeStripe();
    const { program, athlete, enrollment } = await subscribed(gw);
    await tdb.prisma.programPurchase.update({ where: { checkoutSessionId: "cs_1" }, data: { status: "unpaid" } });
    gw.state.subscriptions.get("sub_1")!.status = "unpaid";
    const left = await leaveProgram(tdb.prisma, gw.gateway, athlete, program.id);
    expect(left.endsOn).toBeNull();
    expect(left.intents).toHaveLength(1);
    expect(stripeCalls(gw, "cancelSubscription")).toEqual([{ method: "cancelSubscription", args: [acct, "sub_1"] }]);
    expect(stripeCalls(gw, "setCancelAtPeriodEnd")).toEqual([]);
    expect(await purchase()).toMatchObject({ status: "canceled", endedReason: "athlete" });
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).leftAt).not.toBeNull();
  });

  it("an athlete removed and restored before the webhook is blocked", async () => {
    const gw = fakeStripe();
    const { coach, enrollment } = await subscribed(gw);
    await setEnrollmentRemoved(tdb.prisma, gw.gateway, coach.id, enrollment.id, true);
    await setEnrollmentRemoved(tdb.prisma, gw.gateway, coach.id, enrollment.id, false);
    expect(await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } }))
      .toMatchObject({ removedAt: null, access: "blocked" });
  });

  it("leaving a free program is unchanged", async () => {
    const gw = fakeStripe();
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    const athlete = await makeAthlete(tdb.prisma);
    const enrollment = await enroll(tdb.prisma, program.id, athlete.id);
    const left = await leaveProgram(tdb.prisma, gw.gateway, athlete, program.id);
    expect(left.endsOn).toBeNull();
    expect(left.intents).toHaveLength(1);
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).leftAt).not.toBeNull();
    expect(gw.calls).toEqual([]);
  });

  it("removing cancels at once with coach_removed", async () => {
    const gw = fakeStripe();
    const { coach, enrollment } = await subscribed(gw);
    expect(await setEnrollmentRemoved(tdb.prisma, gw.gateway, coach.id, enrollment.id, true)).toEqual({ failed: [] });
    expect(stripeCalls(gw, "cancelSubscription")).toEqual([{ method: "cancelSubscription", args: [acct, "sub_1"] }]);
    expect(await purchase()).toMatchObject({ endedReason: "coach_removed", status: "canceled" });
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).removedAt).not.toBeNull();

    // Restoring does not touch the purchase: the athlete pays again or is granted access.
    expect(await setEnrollmentRemoved(tdb.prisma, gw.gateway, coach.id, enrollment.id, false)).toEqual({ failed: [] });
    expect(await purchase()).toMatchObject({ endedReason: "coach_removed", status: "canceled" });
    expect(stripeCalls(gw, "cancelSubscription")).toHaveLength(1);
  });

  it("a failed cancellation on removal still removes and is reported", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const gw = fakeStripe();
    const { coach, program, enrollment } = await subscribed(gw);
    gw.state.failing.add("cancelSubscription");
    expect(await setEnrollmentRemoved(tdb.prisma, gw.gateway, coach.id, enrollment.id, true)).toEqual({ failed: ["sub_1"] });
    expect((await tdb.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).removedAt).not.toBeNull();
    expect(await purchase()).toMatchObject({ endedReason: "coach_removed", status: "active" });
    expect(await countPendingCancellations(tdb.prisma, program.id)).toBe(1);
    expect(await countPendingCancellations(tdb.prisma, program.id, ["coach_removed"])).toBe(1);
    expect(await countPendingCancellations(tdb.prisma, program.id, ["archived", "made_free"])).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("retryCancellations cancels what is left", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const gw = fakeStripe();
    const { coach, program, enrollment } = await subscribed(gw);
    // Another athlete's subscription the app never ended is not touched.
    const other = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, program.id, other.id);
    await makeSubscriptionPurchase(tdb.prisma, program.id, other.id, acct, "2");
    gw.addSubscription("sub_2");
    gw.state.failing.add("cancelSubscription");
    await setEnrollmentRemoved(tdb.prisma, gw.gateway, coach.id, enrollment.id, true);
    expect(await retryCancellations(tdb.prisma, gw.gateway, program.id)).toEqual(["sub_1"]);

    gw.state.failing.delete("cancelSubscription");
    expect(await retryCancellations(tdb.prisma, gw.gateway, program.id)).toEqual([]);
    expect(await purchase()).toMatchObject({ endedReason: "coach_removed", status: "canceled" });
    expect(await countPendingCancellations(tdb.prisma, program.id)).toBe(0);
    expect(gw.state.subscriptions.get("sub_2")!.status).toBe("active");
    expect(await retryCancellations(tdb.prisma, gw.gateway, program.id)).toEqual([]);
    expect(stripeCalls(gw, "cancelSubscription").map((c) => c.args[1])).toEqual(["sub_1", "sub_1", "sub_1"]);
    error.mockRestore();
  });
});
