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
-- users with no athlete account are dropped. Stored values were free-form: anything that is not a number, a movement or
-- an ISO date is skipped or falls back, never aborting the deploy.
INSERT INTO "PersonalRecord" ("id", "athleteId", "movement", "kind", "reps", "achievedOn")
SELECT gen_random_uuid()::text, a."id", b->>'movement', 'reps', floor(v.value)::int,
       CASE WHEN b->>'recordedAt' ~ '^\d{4}-\d{2}-\d{2}$' THEN (b->>'recordedAt')::date ELSE CURRENT_DATE END
FROM "AthleteProfile" p
JOIN "AthleteAccount" a ON a."userId" = p."userId"
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p."data"->'benchmarks') = 'array' THEN p."data"->'benchmarks' ELSE '[]'::jsonb END
) AS b
-- CASE guards the cast: an AND does not fix the order Postgres evaluates its terms in.
CROSS JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(b->'value') = 'number' THEN (b->>'value')::numeric END AS value) AS v
WHERE b->>'kind' = 'max_reps'
  AND v.value >= 1 AND v.value < 1000
  AND jsonb_typeof(b->'movement') = 'string' AND length(b->>'movement') > 0;

UPDATE "AthleteProfile" SET "data" = "data" - 'benchmarks' WHERE "data" ? 'benchmarks';
