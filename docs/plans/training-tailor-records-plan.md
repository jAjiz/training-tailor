# Records (Marcas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every athlete record into the RMs tab, relabelled "Marcas". It holds three kinds of record (lift, reps, time), each with history. Lifts with more than one rep give an estimated 1RM.

**Architecture:**
- `PersonalRecord` gains a stored `kind` and typed nullable columns, with a DB check constraint per kind.
- Pure logic lives in `src/lib/training/records.ts`: the kind classifier, Epley, the current 1RM and the best set to offer.
- The services and screens read from it.
- Profiles stop storing benchmarks. The engine builds them from records.

**Tech Stack:** Next.js 16, Prisma 7 (PGlite in tests), Vitest + jsdom, next-intl, zod.

**Spec:** `docs/specs/training-tailor-records-design.md`

## Global Constraints

- `REP_OPTIONS = [1, 2, 3, 5, 8, 10]`; `DISTANCE_OPTIONS = [500, 1000, 2000, 5000, 10000]` (metres).
- Bounds:
  - lift: `0 < kg ≤ 500`, reps ∈ REP_OPTIONS.
  - reps: `1 ≤ reps ≤ 500`, optional `0 < kg ≤ 200`.
  - time: distanceM ∈ DISTANCE_OPTIONS, `1 ≤ seconds ≤ 86400`.
- The fixed lists are checked on the server only. The DB checks field shape per kind and that every value is positive.
- Epley: `kg × (1 + reps / 30)`, rounded **down** to 0.5 kg.
- A tie between a real 1RM and an estimate goes to the real one. A tie in value goes to the later `achievedOn`.
- Classifier order:
  1. `barbell` → lift.
  2. Any `monostructural` pattern → time.
  3. None of `dumbbell, kettlebell, sandbag, d_ball, wall_ball` → reps.
  4. Otherwise null.
- Labels only: "Marcas" / "Records". The `/prs` route, the `prs` i18n namespace and `pr-actions` keep their names.
- Tests use invented fixtures (`tests/helpers/library-builders.ts`, names starting with `Test `). No real library entries in code or tests (AGENTS.md).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A movement re-categorised after rows exist. Its page must still open, show the rows under their stored kind and allow deleting them. The add form follows the library kind, or is absent when the library kind is null.
2. A profile JSON that still has `benchmarks`, or `benchmarks` sent in a PUT body. It must parse, drop the field, and keep sex, injuries, goals and equipment.
3. A lift with only multi-rep rows. The estimated 1RM must reach the home page, the log page, adaptations' loads and the AI, and it must be labelled everywhere it is shown.
4. Bodyweight and weighted gymnastic records for the same movement. They are never compared: the best is computed per added load, and null load is a separate group from any kg.
5. Migration on a profile with mixed benchmarks (1rm, max_reps with a fractional value, a max_reps value below 1, time) and on one with no athlete account.

Tests for each are placed in the owning task below.

---

### Task 1: Record logic

**Files:**
- Create: `src/lib/training/records.ts`
- Modify: `src/lib/training/prs.ts` (remove `currentOneRm` and `singleAbove`; their callers move in Task 3)
- Test: `tests/training/records.test.ts` (replaces `tests/training/prs.test.ts`; delete that file once its cases are covered here)

**Interfaces:**
- Produces:
  - `type RecordKind = "lift" | "reps" | "time"`; `REP_OPTIONS`, `DISTANCE_OPTIONS`, `LOAD_EQUIPMENT` (readonly arrays).
  - `recordKind(m: Pick<Movement, "equipment" | "patterns">): RecordKind | null`.
  - `recordKindOf(name: string, movements: readonly Movement[]): RecordKind | null`. Null for an unknown name.
  - `epley(kg: number, reps: number): number`. Rounds down to 0.5; `reps = 1` returns kg.
  - `interface LiftRow { kg: number; reps: number; achievedOn: Date }`.
  - `interface OneRm { kg: number; estimated: boolean; achievedOn: Date }`.
  - `currentOneRm(rows: readonly LiftRow[]): OneRm | null`.
  - `bestByReps(rows: readonly LiftRow[]): Map<number, LiftRow>`. Heaviest per rep count, later date on a tie.
  - `bestSetAbove(sets: readonly { kg: number; reps: number }[], rows: readonly LiftRow[]): { reps: number; from: number | null; to: number } | null`.
  - `bestByLoad<T extends { reps: number; kg: number | null; achievedOn: Date }>(rows: readonly T[]): T[]`. Most reps per added load, bodyweight (null) first, then kg ascending.
  - `bestByDistance<T extends { distanceM: number; seconds: number; achievedOn: Date }>(rows: readonly T[]): T[]`. Lowest seconds per distance, distance ascending.

- [ ] **Step 1: Write the failing tests** in `tests/training/records.test.ts`:
  - `recordKind`:
    - barbell+monostructural → `"lift"`.
    - `["rower"]` with pattern `monostructural` → `"time"`.
    - `["pullup_bar"]` → `"reps"`; `[]` → `"reps"`.
    - `["dumbbell"]` → `null`; `["kettlebell","box"]` → `null`.
  - `epley(100, 1) === 100`; `epley(100, 3) === 110`; `epley(102.5, 5) === 119.5` (119.58 rounded down).
  - `currentOneRm`:
    - `[]` → null.
    - A real 100×1 and a 95×3 (estimate 104.5) → `{ kg: 104.5, estimated: true }` with the 95×3 row's date.
    - A real 110×1 and a 100×3 (estimate 110) → `{ kg: 110, estimated: false }`.
    - Two real 100×1 rows → the later date.
  - `bestSetAbove`:
    - Sets `[{kg:100,reps:3},{kg:90,reps:5}]` against rows `[{kg:95,reps:3}]` → `{ reps: 3, from: 95, to: 100 }`. The 90×5 is a first record too, but its estimate 105 is below 110.
    - A set with reps 4 (not in REP_OPTIONS) → null.
    - A set equal to the best → null.
    - On equal estimates, fewer reps wins.
  - `bestByLoad`: `[{reps:18,kg:null},{reps:20,kg:null},{reps:8,kg:20}]` → `[20 @ null, 8 @ 20]`.
  - `bestByDistance`: two 2000 m rows (430 s, 425 s) and one 500 m row → `[500 m row, 2000 m @ 425]`.
- [ ] **Step 2: Run** `npx vitest run tests/training/records.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/lib/training/records.ts` with the signatures above. `isLift` in `barbell.ts` stays as it is (`liftCatalog` still uses it).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** "Add record kinds, Epley and best-mark logic".

### Task 2: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (`PersonalRecord`; new enum `RecordKind`)
- Create: `prisma/migrations/20261119120000_records/migration.sql`
- Test: `tests/migrations/records-migration.test.ts`

**Interfaces:**
- Produces: `PersonalRecord { kind RecordKind @default(lift); kg Float?; reps Int?; distanceM Int?; seconds Int? }`. The `@default(lift)` keeps existing creates valid until Task 3. Task 3 always sets `kind` explicitly.

- [ ] **Step 1: Write the failing test.**
  - Build a PGlite database by hand. Apply every migration directory sorted before `20261119120000_records`, the same way `tests/helpers/db.ts` does.
  - Insert raw rows:
    - a user plus an `AthleteAccount`, and a `PersonalRecord` (kg 100);
    - a profile JSON for that user whose `benchmarks` holds: a `1rm`; a `max_reps` 18.7 with `recordedAt "2026-10-01"`; a `max_reps` 0.5; a `max_reps` 12 with `recordedAt null`; and a `time`;
    - a second user with a profile but no `AthleteAccount`, with a `max_reps` benchmark.
  - Apply the new migration, then assert:
    - The existing PR becomes `kind 'lift', reps 1, kg 100`.
    - There are exactly two new `reps` rows: (18, `2026-10-01`) and (12, `CURRENT_DATE`).
    - No row exists for the second user.
    - No profile JSON has a `benchmarks` key, and their other keys are unchanged.
    - Inserting `kind 'time'` with `kg` set fails the check constraint.
- [ ] **Step 2: Run** `npx vitest run tests/migrations/records-migration.test.ts`. Expected: FAIL, the migration directory does not exist.
- [ ] **Step 3: Write the migration SQL**, in this order:
  1. Create the enum and the columns.
  2. Make `kg` nullable.
  3. `UPDATE` the existing rows to `kind='lift', reps=1`.
  4. Add the check constraint `"PersonalRecord_kind_fields"`, which also enforces `> 0` on each value that is set.
  5. `INSERT … SELECT` from `jsonb_array_elements(p.data->'benchmarks')`, joined to `"AthleteAccount"` on `userId`, where `kind = 'max_reps'` and `floor(value) >= 1`. Use `gen_random_uuid()::text` for ids if `cuid` is unavailable in SQL. Check what earlier data migrations used.
  6. `UPDATE "AthleteProfile" SET data = data - 'benchmarks'`.

  Then update `schema.prisma` to match and run `npx prisma generate`.
- [ ] **Step 4: Run** the test, then `npx vitest run tests/helpers/db.test.ts`. Expected: both PASS.
- [ ] **Step 5: Commit** "Store lift, reps and time records in one table".

### Task 3: Records service and 1RM consumers

**Files:**
- Modify:
  - `src/lib/training/schemas.ts` (`PrInput`)
  - `src/lib/training/services/prs.ts`
  - `src/lib/training/services/catalog.ts` (`assertLiftMovement` → `assertRecordKind`)
  - `src/app/(athlete)/pr-actions.ts`
  - `src/lib/training/services/results.ts`
  - `src/app/(athlete)/result-actions.ts`
  - `src/app/(athlete)/blocks/[id]/log/LogForm.tsx`
  - `src/app/(athlete)/blocks/[id]/log/page.tsx`
  - `src/app/(athlete)/page.tsx`
  - `src/components/training/BlockCard.tsx`
  - `src/lib/training/block-engine.ts` (`applyAthleteLoads` signature)
  - `src/lib/training/services/adaptations.ts`
  - i18n `log.singlePrompt*`, plus a new `blocks.estimated`
- Test:
  - `tests/training/services/prs.test.ts`
  - `tests/training/services/results.test.ts`
  - `tests/training/services/adaptations.test.ts`
  - `tests/ui/block-card.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`recordKindOf`, `currentOneRm`, `bestSetAbove`, `REP_OPTIONS`, `DISTANCE_OPTIONS`) and Task 2's columns.
- Produces:
  - `PrInput`: a zod discriminated union on `kind`:
    - `{ kind: "lift", movement, kg, reps, achievedOn }`
    - `{ kind: "reps", movement, reps, kg: number | null, achievedOn }`
    - `{ kind: "time", movement, distanceM, seconds, achievedOn }`

    It uses the bounds from Global Constraints, with lists as `z.number().refine(in list)`.
  - `addPr(db, athlete, input)` rejects with `invalid_request` when `recordKindOf(input.movement)` differs from `input.kind`.
  - `oneRmMap(db, athleteId, movements): Promise<Map<string, OneRm>>`. It reads `kind = lift` rows and applies `currentOneRm` per movement.
  - `applyAthleteLoads(workout, oneRms: Map<string, number>)` keeps its signature. Callers pass `new Map([...m].map(([k, v]) => [k, v.kg]))`.
  - `SinglePrompt` becomes `{ movement: string; reps: number; from: number | null; to: number }`. Keep the name to limit churn.
  - `BlockCard` prop `oneRm?: OneRm | null`. When the 1RM is estimated, a "≈ est." line follows the set lines (`t("blocks.estimated")`).
  - `logDraftFor(…, oneRm: number | null, …)` is unchanged. The log page passes `.kg`.

- [ ] **Step 1: Write the failing tests.**
  - prs service:
    - A `reps` input for a Test bodyweight movement is stored with `kg null`.
    - A `time` input for a Test monostructural movement is stored.
    - A `lift` input for a bodyweight movement → `invalid_request`.
    - `reps: 4` on a lift → the schema rejects it.
    - `oneRmMap` with only a 95×3 row → `{ kg: 104.5, estimated: true }`.
    - A `reps` row on a barbell movement is ignored by `oneRmMap`.
  - results: saving a barbell result with sets 100×3 and 90×5 against a stored 95×3 returns `singlePrompt { reps: 3, from: 95, to: 100 }`.
  - adaptations: a lift with only a 95×3 row gives a percentage component the load from 104.5 (Review Focus 3).
  - block-card: an estimated 1RM renders the estimated label; a real one does not.
- [ ] **Step 2: Run** those four files. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above and update every caller.
  - `LogForm` sends `addPrAction({ kind: "lift", movement, kg: prompt.to, reps: prompt.reps, achievedOn })`.
  - Copy, es: "¿Guardar {to} kg × {reps} como tu marca de {movement}?" and "¿Actualizar tu marca de {movement} a {reps} reps de {from} kg a {to} kg?". Write en to match.
  - The "from" in the prompt is the previous best at that rep count. When the rep count is 1 and that best is estimated, the copy adds "(estimado)".
- [ ] **Step 4: Run** the four files, then `npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** "Read 1RMs from lifts at any listed rep count".

### Task 4: Profile without benchmarks; engine benchmarks from records

**Files:**
- Modify:
  - `src/lib/engine/types.ts` (`BenchmarkSchema`, new `StoredProfileSchema`, `emptyStoredProfile`)
  - `src/lib/profile.ts`
  - `src/lib/tailor-service.ts`
  - `src/app/api/profile/route.ts`
  - `src/app/(athlete)/me/profile/ProfileForm.tsx` and `page.tsx`
  - `src/lib/training/services/library-publish.ts`
  - `src/lib/engine/tailor.ts` (benchmark sentence)
  - i18n: remove `profile.benchmarks*`, `kinds`, `units`, `prsLink`, `addBenchmark` if unused elsewhere
- Test:
  - `tests/profile/profile.test.ts`
  - `tests/profile/engine-profile.test.ts`
  - `tests/training/services/library-publish.test.ts`
  - `tests/engine/tailor.test.ts`

**Interfaces:**
- Produces:
  - `BenchmarkSchema` gains `estimated: z.boolean().optional()`, `addedKg: z.number().positive().nullable().optional()` and `distanceM: z.number().int().positive().optional()`.
  - `StoredProfileSchema = AthleteProfileSchema.omit({ benchmarks: true })` (strips unknown keys); `type StoredProfile`.
  - `normalizeProfile(raw): StoredProfile`, `sanitizeProfile(profile: StoredProfile, domain): StoredProfile`, `loadProfile(userId): Promise<StoredProfile>`.
  - `loadEngineProfile(db, userId): Promise<AthleteProfile>`. Benchmarks per the spec's "What the AI receives". They are built by the stored kind of each row, using `currentOneRm`, `bestByLoad` and `bestByDistance`.

- [ ] **Step 1: Write the failing tests.**
  - `normalizeProfile` of a JSON with `benchmarks` and `sex: "female"` returns `sex: "female"` and has no `benchmarks` key (Review Focus 2).
  - A PUT body with `benchmarks` is accepted and stored without them.
  - `loadEngineProfile` with these rows:
    - lift 95×3;
    - reps 18 @ null and 8 @ 20;
    - time 2000 m in 425 s and 430 s;
    - a `reps` row on a movement that is now `null` in the test library.

    It returns:
    - the lift as `estimated: true`;
    - two `max_reps` entries with `addedKg` null and 20;
    - one `time` entry, 2000 m at 425 s;
    - the re-categorised row, still included by its stored kind.
  - library-publish: renaming a movement still renames goals and records. A stored profile with legacy `benchmarks` still parses.
  - tailor: the system prompt says an estimated 1RM is a conservative guide, max reps are unbroken at the stated added load, and a time is for the stated distance.
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `ProfileForm` loses the benchmarks section.
  - `storedProfiles` in library-publish parses with `StoredProfileSchema`. `movementCounts` drops its benchmarks loop.
- [ ] **Step 4: Run** those files, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** "Build engine benchmarks from records; profiles stop storing them".

### Task 5: Marcas screens

**Files:**
- Modify:
  - `src/app/(athlete)/prs/page.tsx` and `PrList.tsx`
  - `src/app/(athlete)/prs/[movement]/page.tsx` and `PrHistory.tsx`
  - the athlete tab bar label
  - i18n `nav.prs`, `prs.*`
- Create (if `PrHistory` grows past one kind): `src/app/(athlete)/prs/[movement]/RecordForm.tsx`
- Test: `tests/ui/records-list.test.tsx`, `tests/ui/record-history.test.tsx`, `tests/ui/athlete-tab-bar.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers, Task 3 `PrInput` and actions.
- Produces:
  - `/prs?tab=lift|reps|time`, with the sub-tabs built on `src/components/ui/Segmented.tsx`. Lifts are grouped by pattern; gymnastics and cardio are listed alphabetically.
  - A movement appears in its library kind's tab, and also in any tab of a stored row kind (Review Focus 1).
  - `/prs/[movement]` returns 404 only when the library kind is null **and** the athlete has no rows for it.

- [ ] **Step 1: Write the failing UI tests.**
  - The tab bar reads "Marcas".
  - The list:
    - shows three sub-tabs;
    - search filters only the open one;
    - an estimated 1RM row shows "estimado";
    - a gymnastics row shows the best bodyweight reps;
    - a cardio row shows "2 km · 7:05" for the shortest recorded distance.
  - History:
    - the lift form has a reps select limited to REP_OPTIONS;
    - the time form takes `7:05` and sends `seconds: 425`;
    - a page with rows of a kind other than the library's shows them, with delete, and offers no form when the library kind is null.
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Time parsing accepts `m:ss` and `h:mm:ss`.
  - Copy, es:
    - nav and title: "Marcas";
    - tabs: "Levantamientos", "Gimnásticos", "Cardio";
    - "estimado";
    - "Peso corporal";
    - "+{kg} kg";
    - empty states per kind.

    Write en to match: "Records", "Lifts", "Gymnastics", "Cardio", "estimated", "Bodyweight".
- [ ] **Step 4: Run** those files, then the full suite, saving the output: `npx vitest run > .superpowers/vitest.log 2>&1; tail -20 .superpowers/vitest.log`. Then run `npx tsc --noEmit` and `npm run lint`. Expected: everything passes.
- [ ] **Step 5: Commit** "Show lifts, gymnastics and cardio records in Marcas".
