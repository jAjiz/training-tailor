-- Records: lifts (kg x reps), unbroken reps (optional added load) and times over a distance, in one table.
CREATE TYPE "RecordKind" AS ENUM ('lift', 'reps', 'time');

ALTER TABLE "PersonalRecord"
  ADD COLUMN "kind" "RecordKind" NOT NULL DEFAULT 'lift',
  ADD COLUMN "reps" INTEGER,
  ADD COLUMN "distanceM" INTEGER,
  ADD COLUMN "seconds" INTEGER,
  ALTER COLUMN "kg" DROP NOT NULL;

-- Every PR so far is a 1RM.
UPDATE "PersonalRecord" SET "reps" = 1;

-- COALESCE: a CHECK passes on NULL, so a missing required field must read as false.
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_kind_fields" CHECK (
  COALESCE(CASE "kind"
    WHEN 'lift' THEN "kg" > 0 AND "reps" > 0 AND "distanceM" IS NULL AND "seconds" IS NULL
    WHEN 'reps' THEN "reps" > 0 AND ("kg" IS NULL OR "kg" > 0) AND "distanceM" IS NULL AND "seconds" IS NULL
    WHEN 'time' THEN "distanceM" > 0 AND "seconds" > 0 AND "kg" IS NULL AND "reps" IS NULL
  END, false)
);

-- Profile max reps become records of athletes; times (no distance), stored 1RMs (already ignored) and the benchmarks of
-- users with no athlete account are dropped.
INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "reps", "achievedOn")
SELECT gen_random_uuid()::text, a."id", b->>'movement', 'reps', floor((b->>'value')::numeric)::int,
       COALESCE((b->>'recordedAt')::date, CURRENT_DATE)
FROM "AthleteProfile" p
JOIN "AthleteAccount" a ON a."userId" = p."userId"
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p."data"->'benchmarks', '[]'::jsonb)) AS b
WHERE b->>'kind' = 'max_reps' AND floor((b->>'value')::numeric) >= 1;

UPDATE "AthleteProfile" SET "data" = "data" - 'benchmarks' WHERE "data" ? 'benchmarks';
