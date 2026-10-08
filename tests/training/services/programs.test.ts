import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeBarbellBlock, makeCoach, makeCustomBlock } from "../../helpers/factories";
import {
  archiveProgram, createProgram, getOwnedProgram, listCoachPrograms, publishedWeeks, regenerateInvite,
  setProgramPublished, setWeekPublished, updateProgram,
} from "@/lib/training/services/programs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const continuous = { kind: "continuous" as const, name: "Daily", description: null, startDate: "2026-10-05" };
const closed = { kind: "closed" as const, name: "Cycle", description: null, weeks: 4 };

describe("programs", () => {
  it("creates both kinds with their own timing fields and a unique invite code", async () => {
    const coach = await makeCoach(tdb.prisma);
    const a = await createProgram(tdb.prisma, coach.id, continuous);
    const b = await createProgram(tdb.prisma, coach.id, closed);
    expect(a.startDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(a.weeks).toBeNull();
    expect(b.weeks).toBe(4);
    expect(b.startDate).toBeNull();
    expect(a.inviteCode).not.toBe(b.inviteCode);
    expect(a.inviteCode).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  it("hides another coach's program", async () => {
    const owner = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, owner.id, continuous);
    await expect(getOwnedProgram(tdb.prisma, other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listCoachPrograms(tdb.prisma, other.id)).toHaveLength(0);
    expect(await listCoachPrograms(tdb.prisma, owner.id)).toHaveLength(1);
  });

  it("locks the start date once a week is published", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-12" });
    await setWeekPublished(tdb.prisma, coach.id, p.id, 0, true);
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-19" }))
      .rejects.toMatchObject({ code: "start_date_locked" });
    // Same date and other fields still change.
    const renamed = await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily RX", description: "x", startDate: "2026-10-12" });
    expect(renamed.name).toBe("Daily RX");
  });

  it("refuses to shorten a closed program below its blocks", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, closed);
    await makeBarbellBlock(tdb.prisma, p.id, 20); // week 3
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "Cycle", description: null, weeks: 2 }))
      .rejects.toMatchObject({ code: "weeks_out_of_range" });
    expect((await updateProgram(tdb.prisma, coach.id, p.id, { name: "Cycle", description: null, weeks: 3 })).weeks).toBe(3);
  });

  it("publishes weeks of continuous programs and whole closed programs", async () => {
    const coach = await makeCoach(tdb.prisma);
    const c = await createProgram(tdb.prisma, coach.id, continuous);
    const k = await createProgram(tdb.prisma, coach.id, closed);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 0, true);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 2, true);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 2, true); // idempotent
    await setWeekPublished(tdb.prisma, coach.id, c.id, 0, false);
    expect([...await publishedWeeks(tdb.prisma, c.id)]).toEqual([2]);
    await expect(setWeekPublished(tdb.prisma, coach.id, k.id, 0, true)).rejects.toMatchObject({ code: "invalid_request" });
    await setProgramPublished(tdb.prisma, coach.id, k.id, true);
    expect((await getOwnedProgram(tdb.prisma, coach.id, k.id)).publishedAt).not.toBeNull();
    await expect(setProgramPublished(tdb.prisma, coach.id, c.id, true)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("regenerates the invite code", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    const code = await regenerateInvite(tdb.prisma, coach.id, p.id);
    expect(code).not.toBe(p.inviteCode);
    expect((await getOwnedProgram(tdb.prisma, coach.id, p.id)).inviteCode).toBe(code);
  });

  it("makes archived programs read-only", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await makeCustomBlock(tdb.prisma, p.id, 0);
    await archiveProgram(tdb.prisma, coach.id, p.id);
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "X", description: null }))
      .rejects.toMatchObject({ code: "program_archived" });
    await expect(regenerateInvite(tdb.prisma, coach.id, p.id)).rejects.toMatchObject({ code: "program_archived" });
    await expect(setWeekPublished(tdb.prisma, coach.id, p.id, 0, true)).rejects.toMatchObject({ code: "program_archived" });
  });
});
