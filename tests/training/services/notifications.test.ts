import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import {
  enroll, leave, makeAthlete, makeCoach, makeContinuous, makeSubscription, makeUser,
} from "../../helpers/factories";
import {
  activeAthleteRecipients, coachRecipient, deleteAudienceData, deleteOldNotifications, deleteSubscription, getPreferences,
  listInbox, markAllRead, markProgramAnnouncementsRead, markRead, saveSubscription, setPreference, unreadCount,
} from "@/lib/training/services/notifications";
import { TrainingError } from "@/lib/training/errors";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const row = (userId: string, kind: string, audience: string, extra: Record<string, unknown> = {}) =>
  tdb.prisma.notification.create({ data: { userId, kind, audience, data: {}, ...extra } });

describe("recipients", () => {
  it("lists active athletes only, minus the excluded user", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const [a, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(() => makeAthlete(tdb.prisma)));
    await enroll(tdb.prisma, p.id, a.id);
    await enroll(tdb.prisma, p.id, b.id);
    const eC = await enroll(tdb.prisma, p.id, c.id);
    const eD = await enroll(tdb.prisma, p.id, d.id);
    await enroll(tdb.prisma, p.id, e.id);
    await leave(tdb.prisma, eC.id);
    await tdb.prisma.enrollment.update({ where: { id: eD.id }, data: { removedAt: new Date() } });
    await tdb.prisma.athleteAccount.update({ where: { id: e.id }, data: { disabledAt: new Date() } });
    const all = await activeAthleteRecipients(tdb.prisma, p.id);
    expect(all.map((r) => r.userId).sort()).toEqual([a.userId, b.userId].sort());
    const without = await activeAthleteRecipients(tdb.prisma, p.id, a.userId);
    expect(without.map((r) => r.userId)).toEqual([b.userId]);
  });

  it("coachRecipient is empty unless the coach is approved", () => {
    const approved = { coach: { userId: "u1", status: "approved", locale: "en" } };
    expect(coachRecipient(approved)).toEqual([{ userId: "u1", locale: "en" }]);
    expect(coachRecipient(approved, "u1")).toEqual([]);
    expect(coachRecipient({ coach: { userId: "u1", status: "suspended", locale: null } })).toEqual([]);
    expect(coachRecipient({ coach: null })).toEqual([]);
  });
});

describe("inbox", () => {
  it("lists and counts per audience, newest update first", async () => {
    const u = await makeUser(tdb.prisma);
    const old = await row(u.id, "announcement", "athlete");
    const fresh = await row(u.id, "fist_bump", "athlete");
    await tdb.prisma.notification.update({ where: { id: old.id }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    await row(u.id, "athlete_joined", "coach");
    expect((await listInbox(tdb.prisma, u.id, "athlete")).map((n) => n.id)).toEqual([fresh.id, old.id]);
    expect(await unreadCount(tdb.prisma, u.id, "athlete")).toBe(2);
    expect(await unreadCount(tdb.prisma, u.id, "coach")).toBe(1);
    expect(await listInbox(tdb.prisma, u.id, "athlete", 1)).toHaveLength(1);
  });

  it("markRead sets readAt and refuses another user's row", async () => {
    const u = await makeUser(tdb.prisma);
    const other = await makeUser(tdb.prisma);
    const n = await row(u.id, "announcement", "athlete");
    await expect(markRead(tdb.prisma, other.id, n.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(markRead(tdb.prisma, other.id, n.id)).rejects.toBeInstanceOf(TrainingError);
    expect((await markRead(tdb.prisma, u.id, n.id)).readAt).not.toBeNull();
  });

  it("markAllRead only touches the audience", async () => {
    const u = await makeUser(tdb.prisma);
    await row(u.id, "announcement", "athlete");
    await row(u.id, "athlete_joined", "coach");
    await markAllRead(tdb.prisma, u.id, "athlete");
    expect(await unreadCount(tdb.prisma, u.id, "athlete")).toBe(0);
    expect(await unreadCount(tdb.prisma, u.id, "coach")).toBe(1);
  });

  it("markProgramAnnouncementsRead touches only announcements of that program", async () => {
    const u = await makeUser(tdb.prisma);
    const mine = await row(u.id, "announcement", "athlete", { programId: "p1" });
    const otherProgram = await row(u.id, "announcement", "athlete", { programId: "p2" });
    const otherKind = await row(u.id, "week_published", "athlete", { programId: "p1" });
    await markProgramAnnouncementsRead(tdb.prisma, u.id, "p1");
    const get = (id: string) => tdb.prisma.notification.findUniqueOrThrow({ where: { id } });
    expect((await get(mine.id)).readAt).not.toBeNull();
    expect((await get(otherProgram.id)).readAt).toBeNull();
    expect((await get(otherKind.id)).readAt).toBeNull();
  });

  it("deleteOldNotifications keeps newer rows", async () => {
    const u = await makeUser(tdb.prisma);
    const old = await row(u.id, "announcement", "athlete");
    await row(u.id, "announcement", "athlete");
    await tdb.prisma.notification.update({
      where: { id: old.id },
      data: { createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") },
    });
    expect(await deleteOldNotifications(tdb.prisma, new Date("2026-06-01T00:00:00Z"))).toBe(1);
    expect(await tdb.prisma.notification.count()).toBe(1);
  });

  it("deleteAudienceData(coach) leaves athlete rows and preferences", async () => {
    const u = await makeUser(tdb.prisma);
    await row(u.id, "announcement", "athlete");
    await row(u.id, "athlete_joined", "coach");
    await setPreference(tdb.prisma, u.id, "announcement", false);
    await setPreference(tdb.prisma, u.id, "athlete_joined", false);
    await deleteAudienceData(tdb.prisma, u.id, "coach");
    expect((await tdb.prisma.notification.findMany()).map((n) => n.kind)).toEqual(["announcement"]);
    expect((await tdb.prisma.notificationPreference.findMany()).map((p) => p.kind)).toEqual(["announcement"]);
  });
});

describe("preferences", () => {
  it("defaults to true and only returns the audience's kinds", async () => {
    const u = await makeUser(tdb.prisma);
    await setPreference(tdb.prisma, u.id, "fist_bump", false);
    await setPreference(tdb.prisma, u.id, "fist_bump", false);
    const prefs = await getPreferences(tdb.prisma, u.id, "athlete");
    expect(prefs).toEqual({ announcement: true, week_published: true, fist_bump: false, coach_deleted: true });
    expect(Object.keys(await getPreferences(tdb.prisma, u.id, "coach")).sort())
      .toEqual(["athlete_joined", "athlete_left", "coach_approved", "week_reminder"]);
    await setPreference(tdb.prisma, u.id, "fist_bump", true);
    expect((await getPreferences(tdb.prisma, u.id, "athlete")).fist_bump).toBe(true);
  });
});

describe("subscriptions", () => {
  const target = { endpoint: "https://push.test/x", p256dh: "k", auth: "a", userAgent: "UA" };

  it("saveSubscription moves a shared device to the new user", async () => {
    const a = await makeUser(tdb.prisma);
    const b = await makeUser(tdb.prisma);
    await saveSubscription(tdb.prisma, a.id, target);
    await saveSubscription(tdb.prisma, b.id, { ...target, p256dh: "k2" });
    const subs = await tdb.prisma.pushSubscription.findMany();
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ userId: b.id, p256dh: "k2" });
  });

  it("deleteSubscription only deletes the user's own", async () => {
    const a = await makeUser(tdb.prisma);
    const b = await makeUser(tdb.prisma);
    const s = await makeSubscription(tdb.prisma, a.id);
    await deleteSubscription(tdb.prisma, b.id, s.endpoint);
    expect(await tdb.prisma.pushSubscription.count()).toBe(1);
    await deleteSubscription(tdb.prisma, a.id, s.endpoint);
    expect(await tdb.prisma.pushSubscription.count()).toBe(0);
  });
});
