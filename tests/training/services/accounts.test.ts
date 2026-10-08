import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeUser } from "../../helpers/factories";
import {
  approveCoach, ensureAthleteAccount, ensureCoachAccount, getAthleteByUserId, getCoachByUserId, updateAthleteSettings,
} from "@/lib/training/services/accounts";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("accounts", () => {
  it("creates the athlete account once from the Google profile", async () => {
    const user = await makeUser(tdb.prisma, "Ana");
    const a = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: "https://img/a.png" }, { timezone: "Europe/Madrid", locale: "es" });
    expect(a).toMatchObject({ displayName: user.name, avatarUrl: "https://img/a.png", timezone: "Europe/Madrid", locale: "es" });
    const again = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: "Other", image: null }, { timezone: "UTC", locale: "en" });
    expect(again.id).toBe(a.id);
    expect(again.timezone).toBe("Europe/Madrid"); // never overwritten by a later sign-in
  });

  it("falls back to UTC for an invalid browser time zone", async () => {
    const user = await makeUser(tdb.prisma);
    const a = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: null }, { timezone: "Mars/Base", locale: "es" });
    expect(a.timezone).toBe("UTC");
  });

  it("keeps the coach and athlete profiles independent", async () => {
    const user = await makeUser(tdb.prisma);
    await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: null }, { timezone: "UTC", locale: "es" });
    const coach = await ensureCoachAccount(tdb.prisma, { id: user.id, name: user.name }, { locale: "es" });
    expect(coach.status).toBe("pending");
    expect(await getAthleteByUserId(tdb.prisma, user.id)).not.toBeNull();
    expect(await getCoachByUserId(tdb.prisma, user.id)).not.toBeNull();
  });

  it("approves a coach by email", async () => {
    const user = await makeUser(tdb.prisma);
    await ensureCoachAccount(tdb.prisma, { id: user.id, name: user.name }, { locale: "es" });
    expect(await approveCoach(tdb.prisma, user.email)).toBe("approved");
    expect((await getCoachByUserId(tdb.prisma, user.id))?.status).toBe("approved");
    expect(await approveCoach(tdb.prisma, "nobody@test.local")).toBe("not_found");
  });

  it("updates the athlete's settings", async () => {
    const user = await makeUser(tdb.prisma);
    const a = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: null }, { timezone: "UTC", locale: "es" });
    const updated = await updateAthleteSettings(tdb.prisma, a.id, { displayName: "Ana G.", timezone: "America/Mexico_City", locale: "en" });
    expect(updated).toMatchObject({ displayName: "Ana G.", timezone: "America/Mexico_City", locale: "en" });
  });
});
