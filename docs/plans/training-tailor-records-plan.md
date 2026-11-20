# Records catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcas shows only the records chosen in a new library document, `records`, and every stored record always fits it.

**Architecture:** Branch `feat/records` already has Marcas with records derived from equipment and patterns (`recordKind`).
This plan replaces that classifier with a catalog document published with the library. The publish deletes records
that no longer fit. Kinds gain `distance`, and cardio times can target calories. The first records migration is
rewritten, because it hasn't reached production.

**Tech Stack:** Next.js 16, Prisma 7 (PGlite in tests), zod 4, Vitest + jsdom, next-intl.

**Spec:** `docs/specs/training-tailor-records-design.md`

## Global Constraints

- No library entries in code, tests or docs (AGENTS.md). Tests use `Test …` fixtures (`tests/helpers/library-builders.ts`); the demo library is `data/sample/library.json`.
- `REP_OPTIONS = [1, 2, 3, 5, 8, 10]` stays in code. `DISTANCE_OPTIONS`, `LOAD_EQUIPMENT`, `recordKind` and `recordKindOf` are removed.
- Bounds: lift `0 < kg ≤ 500`; reps `1–500`, `kg` `(0, 200]` only when the entry is weighted; distance `distanceM` `1–1000`; time `seconds` `1–86400` plus exactly one of `distanceM` / `calories`, which must be one of the entry's targets.
- Empty catalog: `{"lift":[],"gymnastics":[],"cardio":[]}`.
- UI copy in en and es. Sub-tab names: Levantamientos / Lifts, Gimnásticos / Gymnastics, Cardio / Cardio.
- Never touch the Neon production branch. Local `.env` is the dev branch (`br-proud-band-b1kfe5bm`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A movement renamed in the same publish keeps its records: renames run before the stale-record check. Pinned in Task 3.
2. A time with both `distanceM` and `calories`, or neither, is rejected by the input schema and by the DB check. Pinned in Task 2.
3. A load on a non-weighted reps entry, or a target the entry doesn't list, is rejected by `addPr`. Pinned in Task 2.
4. A library version stored before the `records` column existed still reads as an empty catalog. Pinned in Task 1.
5. A movement in two catalog tabs, or twice in one, is a publish error. Pinned in Task 1.

---

### Task 1: The `records` document in the library

**Files:**
- Modify: `src/lib/domain/types.ts`: catalog schemas.
- Modify: `src/lib/domain/library.ts`: `DomainLibrarySchema`, `DomainData`, `toDomainData`, `emptyLibrary`, `LIBRARY_DOCUMENTS`.
- Modify: `src/lib/training/services/library.ts`: `libraryOf` and its writer; renames applied to the catalog wherever a draft rename already rewrites conversions (around line 289).
- Modify: `src/lib/domain/validate-library.ts`: catalog findings.
- Modify: `prisma/schema.prisma` (`DomainLibraryVersion.records Json @default("{\"lift\":[],\"gymnastics\":[],\"cardio\":[]}")`), and add the column to the rewritten migration from Task 2. Run `npx prisma generate`.
- Modify: `src/i18n/messages/{en,es}.json`: `admin.library.tabs.records` = "Records" / "Marcas".
- Modify: `data/sample/library.json`: a small catalog over the demo movements, one group per tab.
- Test: `tests/domain/validate-library.test.ts`, `tests/training/services/library.test.ts`, `tests/domain/sample-library.test.ts`.

**Interfaces:**
- Produces in `src/lib/domain/types.ts`:
  - `RecordLabel = { en: string; es: string }`;
  - `CardioTarget = { distanceM: number } | { calories: number }` (positive ints);
  - `RecordsCatalogSchema` with `lift: { label, entries: { movement }[] }[]`, `gymnastics: { label, entries: ({ movement, measure: "reps", weighted: boolean } | { movement, measure: "distance" })[] }[]` and `cardio: { label, entries: { movement, targets: CardioTarget[] }[] }[]`;
  - `type RecordsCatalog`, `emptyRecordsCatalog(): RecordsCatalog`.
- Produces: `DomainData.records: RecordsCatalog`; `DomainLibrary.records`; `"records"` in `LIBRARY_DOCUMENTS`.
- `libraryOf(row)` parses `row.records`, so a missing or `{}` value gives `emptyRecordsCatalog()`.

- [ ] **Step 1: Write the failing tests**
  - `validate-library.test.ts`: "flags catalog entries that break the rules". A library with `Test Squat` (barbell) and `Test Pull` (pull-up bar) gets error findings for each of these:
    - an unknown movement (`unknown_record_movement`);
    - `Test Squat` in both `lift` and `gymnastics` (`duplicate_record_movement`);
    - `Test Pull` as a lift entry (`record_lift_not_barbell`);
    - a cardio entry with `targets: []`, and one with `[{ distanceM: 500 }, { distanceM: 500 }]` (`record_targets`).
    A valid catalog gives none of these codes.
  - `library.test.ts`:
    - "reads a version stored without records as an empty catalog": a row with `records: {}` gives `libraryOf(row).records` equal to `emptyRecordsCatalog()`;
    - "renames catalog entries with the draft": renaming `Test Squat` → `Test Back Squat` rewrites its catalog entry.
  - `sample-library.test.ts`: the demo library validates with no errors, and its catalog has at least one entry per tab.
- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/domain tests/training/services/library.test.ts`

  Expected: FAIL. `records` is undefined, and the codes are missing.
- [ ] **Step 3: Implement**

  Add the schema, wire `records` through the library types, the reader and writer, the renames and the validator, then the sample catalog and the i18n tab. The existing generic JSON editor at `/admin/library/documents/[document]` then edits it.
- [ ] **Step 4: Run** `npx vitest run tests/domain tests/training/services/library.test.ts tests/lib`

  Expected: PASS.
- [ ] **Step 5: Commit**: "Add the records catalog document to the library"

### Task 2: Kinds, fields and input checked against the catalog

**Files:**
- Modify: `prisma/migrations/20261119120000_records/migration.sql`: rewrite it whole (spec § Migration):
  - enum `RecordKind` (`lift`, `reps`, `distance`, `time`);
  - columns `kind` (default `lift`), `reps`, `distanceM`, `calories`, `seconds`; `kg` made nullable;
  - backfill existing rows as `lift`, `reps = 1`;
  - the `COALESCE`-wrapped check constraint per kind;
  - `UPDATE "AthleteProfile" SET data = data - 'benchmarks'`;
  - the `DomainLibraryVersion.records` column from Task 1.
  The `max_reps` conversion goes away.
- Modify: `prisma/schema.prisma`: `distance` in `RecordKind`; `calories Int?`.
- Modify: `src/lib/training/records.ts`: remove the classifier, `DISTANCE_OPTIONS` and `LOAD_EQUIPMENT`; add the entry helpers below.
- Modify: `src/lib/training/schemas.ts`: `PrInput`.
- Modify: `src/lib/training/services/catalog.ts`: `assertRecordKind` → `assertRecordFits`.
- Modify: `src/lib/training/services/prs.ts`: `addPr` stores the fields per kind.
- Test: `tests/training/records.test.ts`, `tests/training/services/prs.test.ts`, `tests/migrations/records-migration.test.ts`.

**Interfaces:**
- Consumes: `RecordsCatalog`, `CardioTarget` (Task 1).
- Produces in `records.ts`:
  - `RecordKind = "lift" | "reps" | "distance" | "time"`;
  - `RecordTab = "lift" | "gymnastics" | "cardio"`;
  - `RecordEntry`, which is one of:
    - `{ tab: "lift"; kind: "lift"; movement }`;
    - `{ tab: "gymnastics"; kind: "reps"; movement; weighted: boolean }`;
    - `{ tab: "gymnastics"; kind: "distance"; movement }`;
    - `{ tab: "cardio"; kind: "time"; movement; targets: CardioTarget[] }`;
  - `recordEntries(catalog): RecordEntry[]`, in catalog order;
  - `findRecordEntry(catalog, movement): RecordEntry | null`;
  - `RecordFields = { kind: RecordKind; kg: number | null; reps: number | null; distanceM: number | null; calories: number | null; seconds: number | null }`;
  - `recordFits(entry: RecordEntry | null, row: RecordFields): boolean`: same kind; for reps, `kg === null` unless weighted; for time, the row's target is one of the entry's targets;
  - `bestByTarget<T extends { distanceM: number | null; calories: number | null; seconds: number; achievedOn: Date }>(rows, targets: CardioTarget[]): T[]`: the lowest time per target, in the entry's target order;
  - `bestDistance(rows)`: the longest row, the later on a tie, or null;
  - `formatTarget(t: CardioTarget): string`: "500 m", "2 km", "50 cal".
- Produces: `PrInput` adds `{ kind: "distance", distanceM: 1..1000 }`, and `time` becomes `{ seconds, distanceM?: int > 0, calories?: int > 0 }` refined to exactly one. `assertRecordFits(db, input: PrInputValue): Promise<void>` throws `invalid_request`.

- [ ] **Step 1: Write the failing tests**
  - `records.test.ts`:
    - `findRecordEntry` resolves one entry per tab from a `Test …` catalog and gives null for a missing movement;
    - `recordFits`:
      - a reps row with `kg: 10` fits a weighted entry, not an unweighted one;
      - a time row `{ calories: 50 }` fits targets `[{ calories: 50 }]`, not `[{ distanceM: 500 }]`;
      - a lift row doesn't fit a reps entry;
    - `bestByTarget` orders by the entry's targets;
    - `formatTarget({ calories: 50 })` is `"50 cal"`.
    Delete the `recordKind` tests.
  - `prs.test.ts`, with the published library holding a catalog via `serviceLibrary`:
    - "rejects a load on an unweighted entry";
    - "rejects a target the entry doesn't list";
    - "stores a calories time and a distance record";
    - "rejects a movement outside the catalog".
    The schema test "rejects a time with both or neither of distance and calories" goes in the same file.
  - `records-migration.test.ts`:
    - the DB check rejects a `time` row with both `distanceM` and `calories`, and a `distance` row with `reps`;
    - after migrating, profiles have no `benchmarks` key;
    - no `max_reps` rows are created.
- [ ] **Step 2: Run** `npx vitest run tests/training/records.test.ts tests/training/services/prs.test.ts tests/migrations`

  Expected: FAIL.
- [ ] **Step 3: Implement** the migration rewrite, the Prisma schema with `npx prisma generate`, the helpers, `PrInput`, `assertRecordFits` and `addPr`. `assertRecordFits` reads `getDomainData(db).records`.
- [ ] **Step 4: Run** `npx vitest run tests/training tests/migrations` and `npx tsc --noEmit`

  Expected: the tests in those folders PASS. Compile errors in screens and the engine are fixed in Tasks 4–5. The commit still waits for a clean `tsc`, so do Tasks 2–5 before running Step 5 if needed, and ledger that ruling.
- [ ] **Step 5: Commit**: "Check records against the catalog; add distance and calories"

### Task 3: Publish deletes records that no longer fit

**Files:**
- Modify: `src/lib/training/services/library-publish.ts`.
- Test: `tests/training/services/library-publish.test.ts`.

**Interfaces:**
- Consumes: `findRecordEntry` and `recordFits` (Task 2).
- Produces: `staleRecords(db, catalog, renames): Promise<Map<string, string[]>>`, mapping each movement (named as it is before renames) to the ids of its stale records. It is evaluated against renamed names.
- Produces: the warning finding `records_deleted`, with ref = movement and the message `"<movement>": <n> records will be deleted.`

- [ ] **Step 1: Write the failing tests**
  - "warns and deletes records outside the catalog on publish": a `lift` row on `Test Squat` and a catalog without it give a `records_deleted` warning. Publishing with `acceptWarnings` removes the row.
  - "keeps records of a movement renamed in the same publish".
  - "deletes a time whose target the entry dropped".
  - "lift_in_use counts barbell blocks only": a lift record alone no longer raises it.
- [ ] **Step 2: Run** `npx vitest run tests/training/services/library-publish.test.ts`

  Expected: FAIL.
- [ ] **Step 3: Implement**
  - `movementCounts` drops the records: `movement_in_use` and `lift_in_use` count barbell blocks and goals only.
  - `referenceFindings` appends the `records_deleted` warnings.
  - `publishDraft` deletes the stale ids right after `applyRenames`, in the same transaction.
- [ ] **Step 4: Run** `npx vitest run tests/training/services`

  Expected: PASS.
- [ ] **Step 5: Commit**: "Delete records that leave the catalog when publishing"

### Task 4: What the AI receives

**Files:**
- Modify: `src/lib/engine/types.ts`: `BenchmarkKind` gains `max_distance`; `BenchmarkUnit` gains `meters` if it's missing; `BenchmarkSchema` gains `calories?: int > 0`.
- Modify: `src/lib/tailor-service.ts`: `loadEngineProfile`.
- Modify: `src/lib/engine/tailor.ts`: the benchmark sentence (time: the stated distance or calories; max distance is unbroken).
- Test: `tests/profile/engine-profile.test.ts`, and the tailor prompt test that pins that sentence.

**Interfaces:**
- Consumes: `bestByTarget` and `bestDistance` (Task 2).
- Produces: benchmarks `{ kind: "max_distance", value, unit: "meters" }` and `{ kind: "time", …, distanceM }` or `{ …, calories }`.

- [ ] **Step 1: Write the failing tests**
  - "sends the longest distance as max_distance";
  - "sends a calories time with calories and no distanceM".
- [ ] **Step 2: Run** `npx vitest run tests/profile tests/engine`

  Expected: FAIL.
- [ ] **Step 3: Implement.** No catalog filtering, because stored records always fit.
- [ ] **Step 4: Run** the same command.

  Expected: PASS.
- [ ] **Step 5: Commit**: "Send max distances and calorie times to the AI"

### Task 5: Screens follow the catalog

**Files:**
- Modify:
  - `src/app/(athlete)/prs/page.tsx` and `PrList.tsx`: tabs `lift | gymnastics | cardio`, groups from the catalog;
  - `src/app/(athlete)/prs/[movement]/page.tsx` and `PrHistory.tsx`: one section and one form, from the entry;
  - `src/lib/training/services/results.ts`: no prompt unless the movement is a catalog lift;
  - `src/lib/training/barbell.ts`: delete `liftCatalog` if it has no remaining caller.
- Modify: `src/i18n/messages/{en,es}.json`:
  - `prs.tabs.gymnastics` / `cardio` replace `reps` / `time`;
  - `prs.distanceRecord` ("Metres" / "Metros"), `prs.target` ("Target" / "Objetivo"), `prs.bestDistance` ("Longest" / "Máxima distancia").
- Test: `tests/ui/records-list.test.tsx`, `tests/ui/record-history.test.tsx`, `tests/training/services/results.test.ts`.

**Interfaces:**
- Consumes: `recordEntries`, `findRecordEntry`, `bestByTarget`, `bestDistance` and `formatTarget` (Task 2); `DomainData.records` (Task 1).
- Produces:
  - `RecordTabs = Record<RecordTab, RecordGroup[]>`, where `RecordGroup = { label: string | null; movements: RecordRow[] }` and the label is null when the tab has one group. The label is picked by locale.
  - `PrHistory` props: `{ movement, today, entry: RecordEntry, bests, entries }`. No more `sections` or `formKind`.

- [ ] **Step 1: Write the failing tests**
  - `records-list.test.tsx`:
    - "opens the tab named in ?tab=cardio";
    - "hides group labels in a tab with one group".
  - `record-history.test.tsx`:
    - "offers kg only on a weighted entry";
    - "offers only the entry's targets, metres and calories";
    - "adds a distance record in metres".
  - `results.test.ts`: "offers no PR for a barbell movement outside the catalog".
- [ ] **Step 2: Run** `npx vitest run tests/ui tests/training/services/results.test.ts`

  Expected: FAIL.
- [ ] **Step 3: Implement**
  - `/prs/[movement]` calls `notFound()` when `findRecordEntry` is null.
  - The cardio row summary is the best time of the entry's first target that has a record.
  - The gymnastics distance row shows the longest distance.
- [ ] **Step 4: Run** the full checks: `npx vitest run`, `npx tsc --noEmit`, `pnpm lint`

  Expected: everything passes and both tools are clean.
- [ ] **Step 5: Commit**: "Show Marcas from the records catalog"

### Task 6: Dev database and the first catalog draft

No product code. Scripts live in the scratchpad, not the repo.

- [ ] **Step 1: Reset dev and apply the migration**
  - Reset: `npx neonctl branches reset br-proud-band-b1kfe5bm --parent --project-id polished-art-82684472`.
  - Apply: `npx prisma migrate deploy`.

  Expected: the migration applies with no checksum error. If the VPN blocks port 5432, stop and ask the user to turn it off.
- [ ] **Step 2: Write the draft**
  - Use a scratchpad script that calls the same draft services the admin editor uses (`src/lib/training/services/library.ts`).
  - It creates or extends the draft with:
    - the catalog agreed in conversation (spec § Initial content);
    - the eight missing movements, with stresses, substitutes and contraindication links modelled on their closest existing movements.
  - If a draft already exists, add to it and note what else it holds.
- [ ] **Step 3: Check the draft** at `/admin/library` in the browser.

  Expected: no error findings; a `records_deleted` warning only for records outside the catalog.
- [ ] **Step 4: Hand over.** The user reviews and publishes. Nothing is committed in this task.
