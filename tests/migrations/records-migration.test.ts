import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(process.cwd(), "prisma/migrations");
const RECORDS = "20261119120000_records";
const sql = (dir: string) => readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8");

let db: PGlite;

const benchmarks = (list: unknown[]) => JSON.stringify({ sex: "female", goals: [], benchmarks: list });

beforeAll(async () => {
  db = await PGlite.create();
  for (const dir of readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d) && d < RECORDS).sort()) await db.exec(sql(dir));
  await db.exec(`
    INSERT INTO "user" ("id", "name", "email", "updatedAt") VALUES
      ('u1', 'Test One', 'one@test.local', now()), ('u2', 'Test Two', 'two@test.local', now()),
      ('u3', 'Test Three', 'three@test.local', now());
    INSERT INTO "AthleteAccount" ("id", "userId", "displayName", "timezone") VALUES
      ('a1', 'u1', 'Test One', 'UTC'), ('a3', 'u3', 'Test Three', 'UTC');
    INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kg", "achievedOn") VALUES ('pr1', 'a1', 'Test Squat', 100, '2026-09-01');
  `);
  await db.query(`INSERT INTO "AthleteProfile" ("id", "userId", "data", "updatedAt") VALUES ('p1', 'u1', $1::jsonb, now()), ('p2', 'u2', $2::jsonb, now())`, [
    benchmarks([
      { movement: "Test Squat", kind: "1rm", value: 120, unit: "kg", recordedAt: null },
      { movement: "Test Pull", kind: "max_reps", value: 18.7, unit: "reps", recordedAt: "2026-10-01" },
      { movement: "Test Dip", kind: "max_reps", value: 0.5, unit: "reps", recordedAt: null },
      { movement: "Test Push", kind: "max_reps", value: 12, unit: "reps", recordedAt: null },
      { movement: "Test Row", kind: "time", value: 420, unit: "seconds", recordedAt: null },
      // Free-form values an old client could store: never abort the migration.
      { movement: "Test Dip", kind: "max_reps", value: 15, unit: "reps", recordedAt: "" },
      { movement: "Test Dip", kind: "max_reps", value: "abc", unit: "reps", recordedAt: null },
    ]),
    benchmarks([{ movement: "Test Pull", kind: "max_reps", value: 10, unit: "reps", recordedAt: null }]),
  ]);
  await db.query(`INSERT INTO "AthleteProfile" ("id", "userId", "data", "updatedAt") VALUES ('p3', 'u3', $1::jsonb, now())`, [
    JSON.stringify({ sex: "female", goals: [], benchmarks: { not: "an array" } }),
  ]);
  await db.exec(sql(RECORDS));
}, 60_000);

afterAll(async () => { await db.close(); });

describe("records migration", () => {
  it("keeps existing PRs as single lifts", async () => {
    const { rows } = await db.query(`SELECT "kind", "reps", "kg" FROM "PersonalRecord" WHERE "id" = 'pr1'`);
    expect(rows).toEqual([{ kind: "lift", reps: 1, kg: 100 }]);
  });

  it("drops profile benchmarks instead of converting them", async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "PersonalRecord"`);
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("removes benchmarks from every profile and keeps the rest", async () => {
    const { rows } = await db.query<{ data: Record<string, unknown> }>(`SELECT "data" FROM "AthleteProfile" ORDER BY "id"`);
    expect(rows.map((r) => r.data)).toEqual([{ sex: "female", goals: [] }, { sex: "female", goals: [] }, { sex: "female", goals: [] }]);
  });

  it("rejects a row whose fields do not match its kind", async () => {
    await expect(db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "kg", "distanceM", "seconds", "achievedOn")
       VALUES ('bad', 'a1', 'Test Row', 'time', 50, 2000, 420, '2026-10-01')`,
    )).rejects.toThrow(/PersonalRecord_kind_fields/);
    await expect(db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "reps", "achievedOn")
       VALUES ('zero', 'a1', 'Test Pull', 'reps', 0, '2026-10-01')`,
    )).rejects.toThrow(/PersonalRecord_kind_fields/);
    await expect(db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "kg", "achievedOn")
       VALUES ('noreps', 'a1', 'Test Squat', 'lift', 100, '2026-10-01')`,
    )).rejects.toThrow(/PersonalRecord_kind_fields/);
    await expect(db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "seconds", "achievedOn")
       VALUES ('nodist', 'a1', 'Test Row', 'time', 420, '2026-10-01')`,
    )).rejects.toThrow(/PersonalRecord_kind_fields/);
    await expect(db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "distanceM", "calories", "seconds", "achievedOn")
       VALUES ('both', 'a1', 'Test Row', 'time', 2000, 50, 420, '2026-10-01')`,
    )).rejects.toThrow(/PersonalRecord_kind_fields/);
    await expect(db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "distanceM", "reps", "achievedOn")
       VALUES ('walkreps', 'a1', 'Test Walk', 'distance', 25, 3, '2026-10-01')`,
    )).rejects.toThrow(/PersonalRecord_kind_fields/);
  });

  it("accepts calorie times and distances", async () => {
    await db.exec(
      `INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "calories", "seconds", "achievedOn")
       VALUES ('cal', 'a1', 'Test Row', 'time', 50, 160, '2026-10-01');
       INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "distanceM", "achievedOn")
       VALUES ('walk', 'a1', 'Test Walk', 'distance', 25, '2026-10-01');`,
    );
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "PersonalRecord" WHERE "id" IN ('cal', 'walk')`);
    expect(rows).toEqual([{ n: 2 }]);
  });
});
