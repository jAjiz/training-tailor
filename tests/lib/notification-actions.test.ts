import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeAthlete, makeCoach, makeSubscription } from "../helpers/factories";

const holder = vi.hoisted(() => ({ db: null as unknown }));
const getSessionContext = vi.fn();
const requireAthlete = vi.fn();
const requireCoach = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: (_t, k) => (holder.db as Record<string | symbol, unknown>)[k] }) }));
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("@/lib/accounts", () => ({ requireAthlete: () => requireAthlete(), requireCoach: () => requireCoach() }));
vi.mock("@/lib/training/services/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), unstable_rethrow: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as athleteActions from "@/app/(athlete)/notification-actions";
import * as coachActions from "@/app/coach/notification-actions";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); holder.db = tdb.prisma; }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); vi.clearAllMocks(); });

const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", keys: { p256dh: "p", auth: "a" } };

async function asAthlete(impersonatedBy: string | null = null) {
  const athlete = await makeAthlete(tdb.prisma);
  requireAthlete.mockResolvedValue(athlete);
  getSessionContext.mockResolvedValue({ user: { id: athlete.userId, name: "A", email: "a@test.local", image: null }, role: null, impersonatedBy });
  return athlete;
}
async function asCoach() {
  const coach = await makeCoach(tdb.prisma);
  requireCoach.mockResolvedValue(coach);
  getSessionContext.mockResolvedValue({ user: { id: coach.userId, name: "C", email: "c@test.local", image: null }, role: null, impersonatedBy: null });
  return coach;
}
const row = (userId: string, audience = "athlete", kind = "coach_deleted") =>
  tdb.prisma.notification.create({ data: { userId, audience, kind, data: { programId: "p1", programName: "Box" } } });

describe("savePushSubscriptionAction", () => {
  it("is refused with push_unavailable during an impersonation and stores nothing", async () => {
    await asAthlete("admin1");
    expect(await athleteActions.savePushSubscriptionAction(sub)).toEqual({ ok: false, code: "push_unavailable" });
    expect(await tdb.prisma.pushSubscription.count()).toBe(0);
  });

  it("stores the subscription for the athlete's user", async () => {
    const a = await asAthlete();
    expect(await athleteActions.savePushSubscriptionAction(sub)).toEqual({ ok: true, value: undefined });
    const rows = await tdb.prisma.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: a.userId, endpoint: sub.endpoint, p256dh: "p", auth: "a" });
  });

  it("refuses an endpoint that is not a known push service, storing nothing", async () => {
    await asAthlete();
    const hostile = { ...sub, endpoint: "https://interno.ejemplo:9000/hook" };
    expect(await athleteActions.savePushSubscriptionAction(hostile)).toEqual({ ok: false, code: "push_unavailable" });
    expect(await tdb.prisma.pushSubscription.count()).toBe(0);
  });

  it("rejects a malformed subscription", async () => {
    await asAthlete();
    expect(await athleteActions.savePushSubscriptionAction({ endpoint: "x" })).toEqual({ ok: false, code: "invalid_request" });
  });
});

describe("deletePushSubscriptionAction", () => {
  it("deletes only the caller's own subscription", async () => {
    const a = await asAthlete();
    const other = await makeAthlete(tdb.prisma);
    await makeSubscription(tdb.prisma, a.userId, "https://push.test/mine");
    await makeSubscription(tdb.prisma, other.userId, "https://push.test/theirs");
    await athleteActions.deletePushSubscriptionAction("https://push.test/theirs");
    expect(await tdb.prisma.pushSubscription.count()).toBe(2);
    expect(await athleteActions.deletePushSubscriptionAction("https://push.test/mine")).toEqual({ ok: true, value: undefined });
    expect((await tdb.prisma.pushSubscription.findMany()).map((s) => s.endpoint)).toEqual(["https://push.test/theirs"]);
  });
});

describe("openNotificationAction", () => {
  it("marks the row read and returns its href", async () => {
    const a = await asAthlete();
    const n = await row(a.userId);
    expect(await athleteActions.openNotificationAction(n.id)).toEqual({ ok: true, value: { href: "/?program=p1" } });
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).not.toBeNull();
  });

  it("revalidates the zone layout so the bell clears, except while impersonating", async () => {
    const a = await asAthlete();
    await athleteActions.openNotificationAction((await row(a.userId)).id);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    const c = await asCoach();
    await coachActions.openNotificationAction((await row(c.userId, "coach", "coach_approved")).id);
    expect(revalidatePath).toHaveBeenCalledWith("/coach", "layout");
    vi.mocked(revalidatePath).mockClear();
    const i = await asAthlete("admin1");
    await athleteActions.openNotificationAction((await row(i.userId)).id);
    await athleteActions.markAllReadAction();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the href but leaves readAt null during an impersonation", async () => {
    const a = await asAthlete("admin1");
    const n = await row(a.userId);
    expect(await athleteActions.openNotificationAction(n.id)).toEqual({ ok: true, value: { href: "/?program=p1" } });
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
  });

  it("answers not_found for another user's notification, impersonating or not", async () => {
    const other = await makeAthlete(tdb.prisma);
    const n = await row(other.userId);
    await asAthlete();
    expect(await athleteActions.openNotificationAction(n.id)).toEqual({ ok: false, code: "not_found" });
    await asAthlete("admin1");
    expect(await athleteActions.openNotificationAction(n.id)).toEqual({ ok: false, code: "not_found" });
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
  });

  it("does not open the other audience's rows of the same user", async () => {
    const a = await asAthlete();
    const n = await row(a.userId, "coach", "coach_approved");
    expect(await athleteActions.openNotificationAction(n.id)).toEqual({ ok: false, code: "not_found" });
  });

  it("opens a coach row from the coach zone", async () => {
    const c = await asCoach();
    const n = await row(c.userId, "coach", "coach_approved");
    expect(await coachActions.openNotificationAction(n.id)).toEqual({ ok: true, value: { href: "/coach" } });
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).not.toBeNull();
  });
});

describe("markAllReadAction", () => {
  it("marks only the zone's audience read", async () => {
    const a = await asAthlete();
    const mine = await row(a.userId);
    const coachRow = await row(a.userId, "coach", "coach_approved");
    expect(await athleteActions.markAllReadAction()).toEqual({ ok: true, value: undefined });
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: coachRow.id } })).readAt).toBeNull();
  });

  it("does nothing during an impersonation", async () => {
    const a = await asAthlete("admin1");
    const n = await row(a.userId);
    expect(await athleteActions.markAllReadAction()).toEqual({ ok: true, value: undefined });
    expect((await tdb.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
  });
});

describe("setPreferenceAction", () => {
  it("refuses a coach kind from the athlete zone and an athlete kind from the coach zone", async () => {
    await asAthlete();
    expect(await athleteActions.setPreferenceAction("week_reminder", false)).toEqual({ ok: false, code: "invalid_request" });
    await asCoach();
    expect(await coachActions.setPreferenceAction("fist_bump", false)).toEqual({ ok: false, code: "invalid_request" });
    expect(await tdb.prisma.notificationPreference.count()).toBe(0);
  });

  it("refuses an unknown kind or a non-boolean", async () => {
    await asAthlete();
    expect(await athleteActions.setPreferenceAction("nope", false)).toEqual({ ok: false, code: "invalid_request" });
    expect(await athleteActions.setPreferenceAction("fist_bump", "no")).toEqual({ ok: false, code: "invalid_request" });
  });

  it("stores the preference of the caller's own kind", async () => {
    const a = await asAthlete();
    expect(await athleteActions.setPreferenceAction("fist_bump", false)).toEqual({ ok: true, value: undefined });
    expect(await tdb.prisma.notificationPreference.findMany()).toMatchObject([{ userId: a.userId, kind: "fist_bump", enabled: false }]);
  });
});
