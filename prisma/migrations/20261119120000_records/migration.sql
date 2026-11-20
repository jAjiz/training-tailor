-- Records: lifts (kg x reps), unbroken reps (optional added load), unbroken distances and times for a distance or
-- calories, in one table. Which movements accept which kind is the library's records catalog.
CREATE TYPE "RecordKind" AS ENUM ('lift', 'reps', 'distance', 'time');

ALTER TABLE "PersonalRecord"
  ADD COLUMN "kind" "RecordKind" NOT NULL DEFAULT 'lift',
  ADD COLUMN "reps" INTEGER,
  ADD COLUMN "distanceM" INTEGER,
  ADD COLUMN "calories" INTEGER,
  ADD COLUMN "seconds" INTEGER,
  ALTER COLUMN "kg" DROP NOT NULL;

-- Every PR so far is a 1RM.
UPDATE "PersonalRecord" SET "reps" = 1;

-- COALESCE: a CHECK passes on NULL, so a missing required field must read as false.
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_kind_fields" CHECK (
  COALESCE(CASE "kind"
    WHEN 'lift' THEN "kg" > 0 AND "reps" > 0
      AND "distanceM" IS NULL AND "calories" IS NULL AND "seconds" IS NULL
    WHEN 'reps' THEN "reps" > 0 AND ("kg" IS NULL OR "kg" > 0)
      AND "distanceM" IS NULL AND "calories" IS NULL AND "seconds" IS NULL
    WHEN 'distance' THEN "distanceM" > 0
      AND "kg" IS NULL AND "reps" IS NULL AND "calories" IS NULL AND "seconds" IS NULL
    WHEN 'time' THEN "seconds" > 0 AND "kg" IS NULL AND "reps" IS NULL
      AND (("distanceM" > 0 AND "calories" IS NULL) OR ("calories" > 0 AND "distanceM" IS NULL))
  END, false)
);

-- Profile benchmarks (max reps and times) are dropped, not converted: records now come from the catalog.
UPDATE "AthleteProfile" SET "data" = "data" - 'benchmarks' WHERE "data" ? 'benchmarks';

-- The records catalog, a library document; versions from before it read as an empty catalog.
ALTER TABLE "DomainLibraryVersion" ADD COLUMN "records" JSONB NOT NULL DEFAULT '{"lift":[],"gymnastics":[],"cardio":[]}';
