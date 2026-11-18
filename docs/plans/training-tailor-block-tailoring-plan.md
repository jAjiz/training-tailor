# Block Tailoring (Coaching phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Athletes adapt one block of their program from the day view through a chat with the engine. Accepted adaptations replace the block for them only and are marked everywhere. The feature is switched on per coach (by the admin) and per program (by the coach).

**Architecture:**
- **Block analysis** is stored once per block version (`BlockAnalysis`).
- **Each athlete's conversation, engine state and accepted version** live server-side in `BlockAdaptation`.
- **Two route handlers** per chat message:
  - analyze: JSON, 60 s;
  - tailor/refine: NDJSON, 120 s.

  Both reuse the existing engine pipeline.
- **Accept, discard and the switches** are Server Actions over services in `src/lib/training/services/`.
- **Results** carry a sticky snapshot (`Result.adaptation`).

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Postgres; PGlite in tests), next-intl, Zod 4, Vitest, Gemini behind `LlmProvider` (`FakeProvider` in tests).

**Spec:** `docs/specs/training-tailor-block-tailoring-design.md`. Read it first; this plan argues from it.

## Global Constraints

- **Domain library.** Tests use invented fixtures only (`tests/helpers/library-builders.ts`, `tests/fixtures/workouts.ts`, names starting with `Test `). Never copy real library entries into code, tests or docs.
- **Migrations** are hand-written SQL folders in `prisma/migrations/` (PGlite applies them in tests). New columns default to off (`false`) or nullable. The one migration of this plan is `20261118120000_block_tailoring`.
- **No per-attempt model timeout.** Never set `httpOptions.timeout`. Routes: `maxDuration = 60` for analysis and `120` for tailoring.
- **New UI** uses `src/components/ui` and theme tokens, works at 375 px, and has no hard-coded strings. Every string goes in both `src/i18n/messages/es.json` and `en.json`.
- **Access.**
  - Impersonation sessions never run the engine (`engineUserId`).
  - Disabled athletes are refused (`requireAthlete` / `engineUserId`).
- **Quota.** `consumeQuota` limits: `analyze` for analysis requests, `tailor` for the first proposal, `refine` after that.
- **Validation as today.** Only `EngineUnsafeError` (contraindicated movement), `EngineEmptyError` (new, Task 4) and a `scoring_changed` violation that survives the retry refuse a proposal. Every other remaining finding is a warning, and the athlete can still accept.
- **Commits:**
  - one per task, on branch `feat/coaching-phase3`;
  - `pnpm test`, `pnpm lint` and `pnpm exec tsc --noEmit` must pass before each one;
  - each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A coach edits a block while an athlete has the chat open.** The tailor request must use the analysis that matches the block now, and accept must store the current `workoutHash`. Neither may write a stale hash that later looks fresh. Test in Task 6.
2. **Double-tapping Accept, or accepting twice from two tabs.** It must stay one adaptation, and one result update to Scaled. Test in Task 6.
3. **The athlete saves an adapted result, discards the adaptation, then edits the result and sends `division: "rx"`.** It must stay Scaled with its snapshot. Test in Task 7.
4. **A barbell block when the athlete has no 1RM for its movement.** The adaptation runs with `percent1RM` only, `loadKg` stays null, and nothing crashes. Test in Task 3.
5. **The coach or admin switches tailoring off while the athlete is mid-chat.** The next analyze or tailor request returns `tailoring_off` (403), and an existing accepted adaptation still renders. Test in Task 2 (rule) and Task 6 (service).

---

### Task 1: Schema, migration and removal of `/tailor`

**Files:**
- Modify: `prisma/schema.prisma`.
- Create: `prisma/migrations/20261118120000_block_tailoring/migration.sql`.
- Delete:
  - `src/app/(athlete)/tailor/` (whole folder);
  - `src/app/api/tailor/` (whole folder, including `save`, `analyze`, `refine`, `refine/analyze`).
- Modify:
  - `src/lib/api-schemas.ts`: drop the schemas only those routes used (`AnalyzeBodySchema`, `AnalyzeFeedbackBodySchema`, `TailorBodySchema`, `RefineBodySchema`, `SaveBodySchema`). Keep the size constants.
  - Any link or i18n string pointing at `/tailor`.
- Test: `tests/training/services/schema.test.ts`.

**Interfaces:**
- Produces, in the Prisma models:
  - `CoachAccount.tailoringEnabled Boolean @default(false)`;
  - `Program.tailoringEnabled Boolean @default(false)`;
  - `BlockAnalysis` with fields `blockId String @id` (relation to `Block`, `onDelete: Cascade`), `contentHash String`, `libraryVersion Int`, `workout Json`, `analyzed Boolean`, `model String` and `updatedAt DateTime @updatedAt`;
  - `BlockAdaptation` with fields:
    - `id` (cuid);
    - `blockId` (Block, Cascade) and `athleteId` (AthleteAccount, Cascade);
    - `messages Json @default("[]")`;
    - `state Json?` and `accepted Json?`;
    - `model String?` and `libraryVersion Int?`;
    - `createdAt` and `updatedAt`;
    - `@@unique([blockId, athleteId])` and `@@index([athleteId])`;
  - `Result.adaptation Json?`;
  - the `TailoredWorkout` model removed, together with `User.tailored`.

- [ ] **Step 1: Write the failing tests** in `schema.test.ts`.
  - `"keeps one adaptation per athlete and block"`: a second `blockAdaptation.create` with the same `(blockId, athleteId)` rejects with `{ code: "P2002" }`.
  - `"cascades a block's deletion to its analysis and adaptations"`: create both, delete the block, and check that both counts are 0.
  - `"defaults tailoring switches to off"`: `makeCoach` gives `tailoringEnabled === false`, and so does `makeContinuous`.
- [ ] **Step 2: Run** `pnpm vitest run tests/training/services/schema.test.ts`. Expected: FAIL (unknown model `blockAdaptation`).
- [ ] **Step 3: Write the schema changes and the migration SQL.**
  - The SQL drops `"TailoredWorkout"` and its FK, adds the two boolean columns `NOT NULL DEFAULT false`, creates both tables with FKs `ON DELETE CASCADE`, and adds `"Result"."adaptation" JSONB`.
  - Run `pnpm prisma generate`.
- [ ] **Step 4: Delete the `/tailor` page and `/api/tailor/*` routes,** and the API schemas only they used.
  - Keep `src/lib/engine-events.ts` (`readEngineOutcome`), `engine-route.ts`, `engine-stream.ts` and `tailor-service.ts`.
  - Grep for `/tailor` and `TailoredWorkout` across `src`, `tests` and `scripts`: the result must be empty apart from `src/lib/engine/tailor.ts` imports.
- [ ] **Step 5: Run** `pnpm test`, `pnpm lint` and `pnpm exec tsc --noEmit`. Expected: all pass.
- [ ] **Step 6: Commit**: `Add block tailoring schema and drop the standalone tailor page`.

---

### Task 2: Switches and the adaptability rule

**Files:**
- Create: `src/lib/training/services/tailoring.ts`.
- Modify:
  - `src/lib/training/services/admin.ts`;
  - `src/app/admin/actions.ts`;
  - `src/app/admin/coaches/[id]/page.tsx` (switch);
  - `src/app/admin/coaches/page.tsx` (column);
  - `src/lib/training/services/admin-queries.ts` (select the flag);
  - `src/app/coach/program-actions.ts`;
  - `src/app/coach/programs/[id]/settings/page.tsx` and `ProgramSettingsForm.tsx`;
  - i18n `admin.coaches.tailoring*` and `planner`/`programs` settings keys.
- Test:
  - `tests/training/services/tailoring.test.ts`;
  - `tests/training/services/admin.test.ts` (audit row).

**Interfaces:**
- Consumes: `getVisibleBlock(db, athlete, blockId, now)` and `todayIn` from `src/lib/training/dates.ts`.
- Produces:
  - `setCoachTailoring(db: Db, actor: string, coachId: string, enabled: boolean): Promise<void>` in `admin.ts`.
    - It writes an audit row with `action` `coach.tailoring_on` or `coach.tailoring_off` and `targetType` `"coach"`.
  - `setProgramTailoring(db: Db, coachId: string, programId: string, enabled: boolean): Promise<void>` in `tailoring.ts`.
    - It throws `TrainingError("tailoring_not_allowed")` when the coach is not enabled and `enabled` is true.
    - It throws `program_archived` through `assertWritable`.
  - `tailoringOn(program: { tailoringEnabled: boolean; archivedAt: Date | null; coach: { tailoringEnabled: boolean; status: string } | null }): boolean`.
  - `getAdaptableBlock(db: Db, athlete: { id: string; timezone: string }, blockId: string, now?: Date)`.
    - Returns `{ block, date }`, with `block` including `program.coach`.
    - Throws `TrainingError("not_found")` exactly when `getVisibleBlock` does.
    - Throws `TrainingError("tailoring_off")` when `!tailoringOn(...)`.
    - Throws `TrainingError("day_passed")` when `date < todayIn(athlete.timezone, now)`.
  - `isAdaptableDay(date: IsoDate, today: IsoDate): boolean`, so the day view can decide without a DB call.
  - Server Actions:
    - `setCoachTailoringAction(coachId: unknown, enabled: unknown)`, using `requireAdmin` and `revalidateAdmin`;
    - `setProgramTailoringAction(raw: unknown)` with `{ programId, enabled }`.

- [ ] **Step 1: Write the failing tests** in `tailoring.test.ts`. Seed with factories; set the switches through Prisma.
  - `"adaptable when coach and program are on, for today and later"`: blocks on day 0 and day 1. With `now` on day 0, both return. With `now` on day 1, day 0 throws `day_passed`.
  - `"tailoring_off when the coach switch is off"`, `"… when the program switch is off"`, `"… when the coach is suspended"` and `"… when the program is archived"`.
  - `"not_found for a removed athlete"` (Review Focus 5 uses the same rule).
  - `"setProgramTailoring refuses when the coach is not enabled"`: rejects with `tailoring_not_allowed`. Turning it off is always allowed.
- [ ] **Step 2: Write the failing test** in `admin.test.ts`: `"setCoachTailoring writes an audit row"`, expecting `action: "coach.tailoring_on"` and `targetId: coach.id`.
- [ ] **Step 3: Run both files.** Expected: FAIL (missing exports).
- [ ] **Step 4: Implement the services and the rule.**
  - Add the new error codes to `TrainingError`'s union, with i18n under `errors.*`.
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Add the UI.**
  - **Admin coach page:** a switch with the label `admin.coaches.tailoring` ("Adaptación con IA" / "AI tailoring"), confirmed like the existing status actions.
  - **Admin coaches list:** a column showing the flag.
  - **Program settings:** the switch is shown only when `coach.tailoringEnabled`, and hint text explains that athletes will see "Adaptar".
- [ ] **Step 7: Run** `pnpm test`, lint and tsc. **Commit**: `Tailoring switches per coach and per program`.

---

### Task 3: Block hashes, analysis text and per-athlete loads (pure)

**Files:**
- Create: `src/lib/training/block-engine.ts`.
- Modify: `src/lib/engine/analyze.ts` (add `analyzeBlock`).
- Test:
  - `tests/training/block-engine.test.ts`;
  - `tests/engine/analyze.test.ts`.

**Interfaces:**
- Produces:
  - `type BlockFields = Pick<Block, "kind" | "title" | "description" | "scoring" | "timeCapSeconds" | "movement" | "sets" | "instructions" | "coachingTips">`.
  - `contentHash(b: BlockFields): string`. It hashes all nine fields.
  - `workoutHash(b: BlockFields): string`. It hashes the same fields except `coachingTips`.
  - Both hashes use SHA-256 hex (`node:crypto`) over `JSON.stringify` of the fields in that fixed key order, with `sets` as stored.
  - `blockAnalysisText(b: BlockFields, locale: string): string`.
    - Custom: title, description, scoring and time cap, one per line.
    - Barbell: title (or movement), then `describeSets(sets, null, locale)` in percent terms, then instructions.
  - `analyzeBlock(provider: LlmProvider, text: string, ctx: AnalyzeContext, forced: { movement: string } | null): Promise<{ workout: StructuredWorkout; analyzed: boolean }>` in `analyze.ts`.
    - It runs a workout-only model call: a new system prompt `BLOCK_SYSTEM`, the same `WorkoutDraftSchema` and the schema name `"BlockAnalysis"`. No situation goes in the prompt.
    - It reuses the rawText fallback and `resolveBlocks`.
    - With `forced`, it sets `canonical = forced.movement` on every component whose drafted movement resolves to it or carries `percent1RM`, and leaves the others alone.
    - On a model error it degrades to one raw block (`analyzed: false`), as `analyzePaste` does.
  - `applyAthleteLoads(workout: StructuredWorkout, oneRms: Map<string, number>): StructuredWorkout`.
    - For each component with `percent1RM` and a known 1RM for its `canonical`, it sets `loadKg = { male: kg, female: kg }`, where `kg = round(1RM × percent / 100, 0.5)`.
    - Use the barbell rounding already in `src/lib/training/barbell.ts`. If there is none, round to the nearest 0.5 kg.

- [ ] **Step 1: Write the failing tests** in `block-engine.test.ts`.
  - `"moving a block keeps both hashes"`: same fields; `position`, `dayIndex` and `color` are not inputs.
  - `"editing tips changes contentHash but not workoutHash"`.
  - `"editing the description changes both"`.
  - `"barbell analysis text uses percents, never kg"`: sets `[{reps:5,percent:80,kg:null}]`; the text contains `80%` and not `kg`.
  - `"applyAthleteLoads fills both sex slots from the 1RM"`: 1RM 100, 80 % → `{male:80,female:80}`.
  - `"applyAthleteLoads leaves loadKg null without a 1RM"` (Review Focus 4).
- [ ] **Step 2: Write the failing tests** in `analyze.test.ts`, with `FakeProvider` and the `"BlockAnalysis"` schema name.
  - `"analyzeBlock sends no situation"`: the prompt has no `SITUATION:` section.
  - `"analyzeBlock forces the barbell movement on percent components only"`: a draft with `Test Squat` at 80 % plus `Test Row` → the first canonical is the forced name, and the second resolves normally.
  - `"analyzeBlock degrades to a raw block on a model error"`: `analyzed === false`, one block, `rawText` = input.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit**: `Block hashes, block analysis and per-athlete loads`.

---

### Task 4: Engine changes — locale, scoring guard, empty proposals

**Files:**
- Modify:
  - `src/lib/engine/tailor.ts`;
  - `src/lib/engine/types.ts`;
  - `src/lib/engine/validate.ts`;
  - `src/lib/engine/pipeline.ts`.
- Test:
  - `tests/engine/tailor.test.ts`;
  - `tests/engine/validate.test.ts`;
  - `tests/engine/pipeline.test.ts`.

**Interfaces:**
- Produces:
  - `FindingKind` gains `"scoring_changed"`.
  - `ValidateArgs` gains `lockedFormats: BlockFormat[] | null`. These are the formats every tailored block must keep. When it is set, any tailored block whose `sourceBlocks` include an original block with a locked format must have that format; otherwise the validation emits `{ kind: "scoring_changed", severity: "violation" }`.
  - `lockedFormatsFor(scoring: string | null): BlockFormat[] | null` in `src/lib/training/block-engine.ts`:
    - `for_time` → `["for_time"]`;
    - `amrap` → `["amrap"]`;
    - anything else → `null`.
  - `PipelineArgs` and `RefineArgs` gain `locale: "es" | "en"` and `lockedFormats: BlockFormat[] | null`.
  - `TailorInput` gains `locale`. In the system prompt, the prose language rule becomes "Write prose in LANGUAGE" (`Spanish` or `English`, from the locale). Add hard rule 7: "Keep each block's format when the input says FORMAT LOCKED".
  - `class EngineEmptyError extends Error`, exported from `pipeline.ts`. It is thrown after validation and repair when every tailored block has zero components or all original blocks are in `droppedBlocks`.
  - The same function throws `EngineUnsafeError` when a `scoring_changed` violation survives the retry.
  - `engineStreamResponse` maps `EngineEmptyError` → `{ type: "error", error: "engine_empty" }`. `EngineEvent`'s error union gains `"engine_empty"`.

- [ ] **Step 1: Write the failing tests.**
  - `validate.test.ts`: `"flags a for_time block tailored into an amrap"` and `"ignores formats when nothing is locked"`.
  - `tailor.test.ts`: `"prompt asks for Spanish prose for locale es"` and `"prompt marks locked formats"`.
  - `pipeline.test.ts`:
    - `"refuses an empty proposal"`: a draft whose block has `components: []` → rejects `EngineEmptyError`.
    - `"retries then refuses a changed scoring"`: two drafts, both amrap, for a for_time original → `EngineUnsafeError`.
    - `"other findings stay warnings"`: a `stimulus_drift` survives and the result is returned.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Existing callers pass `locale: "en"` and `lockedFormats: null` until Task 6 replaces them. The eval harness in `scripts/eval.ts` passes `"en"` and `null`.
- [ ] **Step 4: Run** `pnpm test` and `pnpm eval --help`. Expected: PASS and no type errors.
- [ ] **Step 5: Commit**: `Engine: athlete locale, locked block formats and empty-proposal refusal`.

---

### Task 5: Stored block analysis

**Files:**
- Create: `src/lib/training/services/block-analysis.ts`.
- Test: `tests/training/services/block-analysis.test.ts`.

**Interfaces:**
- Consumes:
  - `contentHash`, `blockAnalysisText` and `analyzeBlock` (Task 3);
  - `getPublishedLibraryVersion(db)` and `getDomainData(db)`.
- Produces:
  - `ensureBlockAnalysis(db: Db, provider: LlmProvider, block: Block, domain: DomainData, libraryVersion: number, locale: string): Promise<{ workout: StructuredWorkout; analyzed: boolean; fresh: boolean }>`.
    - It returns the stored row when its `contentHash` and `libraryVersion` match (`fresh: false`). Otherwise it calls `analyzeBlock` and upserts by `blockId` (`fresh: true`).
    - `forced` is `{ movement: block.movement }` for barbell blocks.

- [ ] **Step 1: Write the failing tests.** Use the PGlite test DB and a `FakeProvider` that counts calls.
  - `"analyzes once and reuses"`: two calls → one provider call, and the second returns `fresh: false`.
  - `"re-analyzes after a description edit"`.
  - `"re-analyzes after a tips-only edit"`: tips are in `contentHash`.
  - `"keeps the analysis when the block moves day"`.
  - `"re-analyzes after a new library version"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `Store block analyses per block version`.

---

### Task 6: Adaptation conversation service and routes

**Files:**
- Create:
  - `src/lib/training/adaptation-types.ts` (Zod schemas);
  - `src/lib/training/services/adaptations.ts`;
  - `src/app/api/blocks/[id]/adapt/analyze/route.ts` (`maxDuration = 60`);
  - `src/app/api/blocks/[id]/adapt/tailor/route.ts` (`maxDuration = 120`);
  - `src/app/(athlete)/adapt-actions.ts`.
- Modify:
  - `src/lib/engine-route.ts`: extract `prepare` so a route can pass its own `kind` and get `userId`;
  - `src/lib/tailor-service.ts` (`loadEngineProfile`, see Task 9; until then `loadProfile`).
- Test: `tests/training/services/adaptations.test.ts`.

**Interfaces:**
- Produces (in `adaptation-types.ts`, all Zod):
  - `AdaptationMessage` is a union discriminated on `role`, each entry with `at: string` (ISO):
    - `{ role: "athlete", text }`;
    - `{ role: "question", question: ClarifyQuestion }`;
    - `{ role: "answer", answer: ClarifyAnswer | { text } }`;
    - `{ role: "proposal", tailored: TailoringResult, findings: Finding[] }`;
    - `{ role: "error", code: "engine_unsafe" | "engine_empty" | "engine_failed" | "quota_exceeded" }`.
  - `AdaptationState`:
    - `{ analysisHash: string; original: StructuredWorkout; conditions: ConfirmedCondition[]; restrictions: Restriction[]; unavailableEquipment: Equipment[]; pendingQuestions: ClarifyQuestion[]; feedback: string | null; last: PipelineResult | null }`;
    - `analysisHash` is the block's `contentHash` when analyzed.
  - `AcceptedAdaptation`: `{ tailored: TailoringResult; findings: Finding[]; workoutHash: string; acceptedAt: string }`.
  - `AdaptationSnapshot`: `{ text: string; changes: ChangeItem[]; safetyNote: string | null; situation: string[] }`. `situation` holds the athlete's `text` messages.
- Produces (in `adaptations.ts`):
  - `getAdaptation(db, athleteId, blockId)`. Returns the row parsed into `{ messages, state, accepted } | null`.
  - `adaptAnalyze(db, provider, athlete, blockId, message: { text: string } | { answers: ClarifyAnswer[] }, ctx: { profile; domain; libraryVersion; locale })`.
    - Returns `{ questions: ClarifyQuestion[] }`.
    - It calls `getAdaptableBlock` and then `ensureBlockAnalysis`.
    - For text, it runs `analyzeFeedback` with the stored state, or `analyzeSituation` + `activateConditions` + `buildQuestions` the first time, mirroring `analyzeWorkout` but over the stored workout.
    - Button answers go through `applyAnswers` with no model call.
    - It appends the messages and saves the state.
  - `adaptTailor(db, provider, athlete, blockId, ctx & { onProgress })`. Returns `PipelineResult`.
    - It refuses `invalid_state` while `pendingQuestions` is non-empty.
    - It runs `runTailorPipeline` when `state.last` is null and `runRefinePipeline` otherwise, with `locale` and `lockedFormats: lockedFormatsFor(block.scoring)`.
    - Before tailoring it applies `applyAthleteLoads` with `oneRmMap`.
    - It appends a `proposal` message and sets `state.last`.
  - `acceptAdaptation(db, athlete, blockId)`.
    - Requires `state.last`, and `getAdaptableBlock` must pass.
    - It writes `accepted` with the block's **current** `workoutHash`. If `state.analysisHash !== contentHash(block)` it throws `TrainingError("block_changed")`, because the proposal was made from an older block.
    - In the same transaction, it updates an existing result to `{ division: "scaled", adaptation: snapshot }`, keeping the division `"rx"` for barbell blocks.
    - It is idempotent.
  - `discardAdaptation(db, athleteId, blockId)`. Sets `accepted = null`, keeps the messages, and leaves results untouched.
  - `snapshotOf(accepted: AcceptedAdaptation, messages: AdaptationMessage[]): AdaptationSnapshot`.
- **Routes.**
  - **Analyze:** POST `{ text } | { answers }` → JSON `{ questions }`. Errors: 401/403 via `prepare`; `tailoring_off`/`day_passed` → 403; `not_found` → 404; `block_changed` → 409; quota → 429.
  - **Tailor:** POST `{}` → NDJSON via `engineStreamResponse`, with `recordUnrecognized` after the result. Quota kind is `tailor` when `state.last` is null and `refine` otherwise.
  - When the analyze request had to re-analyze the block, it counts one extra `analyze` (`consumeQuota` is called twice).
- **Actions:** `acceptAdaptationAction(blockId)` and `discardAdaptationAction(blockId)`, each with `requireAthlete` and `revalidatePath("/", "layout")`.

- [ ] **Step 1: Write the failing tests.** Use the PGlite DB, `FakeProvider` with fixture drafts from `tests/fixtures/workouts.ts`, and a coach and program with both switches on.
  - `"first message with no questions then tailor gives a proposal"`: the messages are `athlete` then `proposal`.
  - `"a site question is stored, answered by button, then tailored"`: the state has `pendingQuestions`; `adaptTailor` before the answer rejects `invalid_state`.
  - `"second message refines"`: provider calls show a refine with the previous attempt.
  - `"accept stores the current workoutHash and is idempotent"` (Review Focus 2): accept twice → one row, the same `accepted`, the result updated once.
  - `"accept after a coach edit throws block_changed"` (Review Focus 1): edit the description between `adaptTailor` and accept.
  - `"accept turns an existing custom result into scaled with a snapshot"` and `"keeps barbell results rx with a snapshot"`.
  - `"discard keeps messages and leaves the result tagged"`.
  - `"switching the program off refuses the next message"` (Review Focus 5): `adaptAnalyze` rejects `tailoring_off`; `getAdaptation` still returns the accepted version.
  - `"unsafe proposal appends an error message and no proposal"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the types and the service.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Implement the routes and actions.**
  - In `engine-route.ts`, refactor `prepare` to `prepareEngine(req, { schema, maxBodyChars })` → `{ userId, body, provider }` plus `chargeQuota(userId, kind)`. Keep `handleEngineRequest`/`handleAnalyzeRequest` only if still used; otherwise delete them.
- [ ] **Step 6: Run** `pnpm test`, lint and tsc. **Commit**: `Block adaptation conversation: service, routes and actions`.

---

### Task 7: Results with adaptations

**Files:**
- Modify:
  - `src/lib/training/services/results.ts` (`saveResult`, `LeaderboardEntry`, `toRow`);
  - `src/app/(athlete)/blocks/[id]/log/page.tsx` and `LogForm.tsx`.
- Test: `tests/training/services/results.test.ts`.

**Interfaces:**
- Consumes: `getAdaptation`, `snapshotOf` and `workoutHash`.
- Produces:
  - `saveResult` behaviour:
    - If the existing result has `adaptation !== null`, keep it, and force `division: "scaled"` for custom blocks (sticky).
    - Else, if the athlete has an accepted, non-stale adaptation (`accepted.workoutHash === workoutHash(block)`), write `snapshotOf(...)`, and `division: "scaled"` for custom blocks.
    - With an adaptation (stored or new), `singlePrompt` is always `null`.
  - `getMyResult` is unchanged, but the log page reads `result.adaptation` and `getAdaptation` to pass `divisionLocked: boolean` to `LogForm`.
  - `LeaderboardEntry` gains `adapted: boolean`.
  - The coach rows from `toRow` gain `adaptation: AdaptationSnapshot | null`.

- [ ] **Step 1: Write the failing tests.**
  - `"saving with an active adaptation stores scaled and the snapshot"`.
  - `"sticky: after discard, saving rx stays scaled"` (Review Focus 3).
  - `"stale adaptation does not tag a new result"`: accept, edit the block description, then save → no snapshot, and division as sent.
  - `"barbell with adaptation: rx, snapshot, no 1RM prompt"`.
  - `"leaderboard marks adapted entries"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `LogForm`, when `divisionLocked`, hide the `Segmented` division control and show the badge `log.adaptedScaled` ("Adaptado · Scaled" / "Adapted · Scaled").
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `Adapted results are Scaled, tagged and sticky`.

---

### Task 8: Day view — Adapt panel, adapted card, stale notice

**Files:**
- Create:
  - `src/components/training/AdaptPanel.tsx` (client);
  - `src/components/training/AdaptedBlock.tsx` (renders a `TailoringResult` block and its changes).
- Modify:
  - `src/components/training/BlockCard.tsx` (badge, "See original" toggle, stale notice);
  - `src/app/(athlete)/page.tsx`: load adaptations for the day's blocks in one query (`db.blockAdaptation.findMany({ where: { athleteId, blockId: { in } } })`) and compute per block `{ adaptable, accepted, stale }`;
  - `src/lib/engine-events.ts` if the error union changes;
  - i18n namespace `adapt.*` in `es.json`/`en.json`.
- Test: `tests/ui/adapt-panel.test.tsx` (Testing Library, `fetch` mocked).

**Interfaces:**
- Consumes:
  - the routes and actions from Task 6;
  - `isAdaptableDay` and `tailoringOn` from Task 2;
  - `workoutHash` from Task 3.
- Produces:
  - `AdaptPanel` props: `{ blockId: string; blockTitle: string; initialMessages: AdaptationMessage[]; hasAccepted: boolean; open: boolean; onClose(): void }`.
  - The flow on send:
    1. POST analyze.
    2. If it returns questions, render them with the option-button UI moved from the deleted `ClarifyStep` (keep its markup, restyle, translate); the answers POST analyze `{ answers }`.
    3. With no questions, POST tailor and stream progress via `readEngineOutcome`.
    4. Render the proposal with `AdaptedBlock`, findings as warnings (`adapt.warning`), the safety note, and **Accept** → `acceptAdaptationAction` → `onClose()` + `router.refresh()`.
  - Errors map to `adapt.errors.<code>`. On `block_changed`, show "The coach changed this block; start again" and clear the local proposal.
  - Panel copy: `adapt.privacy` ("Tu coach podrá ver lo que escribas aquí." / "Your coach can see what you write here.") and the not-medical-advice line from the old `/tailor` page, translated.
  - Layout: a bottom sheet under 768 px and a centered dialog above it, using the existing dialog primitive in `src/components/ui` if there is one. Otherwise a `<dialog>` with theme tokens.
  - The card:
    - **Accepted, not stale:** an **Adapted** pill, the adapted text via `AdaptedBlock`, the button `adapt.seeOriginal`/`adapt.seeAdapted` toggling in place, and a menu item `adapt.discard` (with a confirmation) → `discardAdaptationAction`.
    - **Stale:** the coach's block plus a notice `adapt.stale`, and the buttons `adapt.again` and `adapt.seePrevious`.
    - **Adapt button:** labelled `adapt.open` ("Adaptar") or `adapt.adjust` ("Ajustar adaptación"). It is shown when the block is adaptable; an accepted adaptation stays rendered even when the switches are off.

- [ ] **Step 1: Write the failing UI tests.**
  - `"sends a message, streams, shows proposal with Accept"`.
  - `"renders a site question and posts the chosen answer"`.
  - `"shows the unsafe error copy"`.
  - `"shows warnings but still allows Accept"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the panel and the card changes.**
- [ ] **Step 4: Run** `pnpm test`, lint and tsc. Expected: PASS.
- [ ] **Step 5: Check it in the browser** on the dev server with the preview tools.
  - Phone width: open the panel, send, accept, see the original, discard.
  - Dark mode.
  - Screenshot.
- [ ] **Step 6: Commit**: `Adapt a block from the day view`.

---

### Task 9: Profile under "Me", 1RM from PRs

**Files:**
- Move: `src/app/(athlete)/profile/*` → `src/app/(athlete)/me/profile/*`. Delete the old route; `/profile` redirects to `/me/profile` (`redirect()` in a stub `page.tsx`).
- Modify:
  - `ProfileForm.tsx`: restyle with `src/components/ui`, translate under `profile.*`, remove the `1rm` benchmark kind and the availability fields from the form;
  - `src/app/(athlete)/me/page.tsx`: a link card to the profile;
  - `src/lib/tailor-service.ts`.
- Test: `tests/profile/engine-profile.test.ts`.

**Interfaces:**
- Produces:
  - `loadEngineProfile(db: Db, userId: string): Promise<AthleteProfile>`.
    - It takes the stored profile minus its `1rm` benchmarks, plus one `{ movement, kind: "1rm", value, unit: "kg", recordedAt }` per current PR (`listPrs` or `oneRmMap` over all of the athlete's movements).
    - It is used by the Task 6 routes in place of `loadProfile`.
  - The profile form still saves through `/api/profile`. Saving keeps any stored availability untouched (merge server-side in `/api/profile`; do not wipe it).

- [ ] **Step 1: Write the failing tests.**
  - `"replaces stored 1rm benchmarks with PRs"`.
  - `"keeps max_reps and time benchmarks"`.
  - `"works without a stored profile"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then switch the Task 6 routes to `loadEngineProfile`.
- [ ] **Step 4: Run** `pnpm test`, lint and tsc. Check the page in the browser in es and en.
- [ ] **Step 5: Commit**: `Engine profile under Me, 1RM from PRs`.

---

### Task 10: Coach views of adapted results

**Files:**
- Modify:
  - `src/app/coach/blocks/[id]/results/page.tsx`;
  - `src/app/coach/programs/[id]/athletes/[aid]/page.tsx`;
  - `src/app/(athlete)/blocks/[id]/leaderboard/page.tsx`;
  - i18n `coachResults.adapted*` and `leaderboard.adapted`.
- Create: `src/components/training/AdaptationDetails.tsx` (`<details>` showing a snapshot: adapted text, changes, safety note, and the athlete's messages under "What the athlete wrote").

**Interfaces:**
- Consumes: `LeaderboardEntry.adapted` and the row `adaptation` from Task 7.

- [ ] **Step 1: Render the Adapted pill** on leaderboard rows (athlete and coach), and `AdaptationDetails` on the coach rows that carry a snapshot. The athlete leaderboard shows the pill only, never other athletes' snapshots.
- [ ] **Step 2: Write the test** in `tests/training/services/results.test.ts`: `"coach rows expose the snapshot; athlete leaderboard entries do not"`. The athlete `LeaderboardEntry` has no `adaptation` key.
- [ ] **Step 3: Run** `pnpm test`, lint and tsc. Check it in the browser. **Commit**: `Show adapted results to coaches`.

---

### Task 11: End-to-end verification (folds in engine F1)

**Files:**
- Modify: `README.md`, with a short "AI tailoring" section: the switches, `GEMINI_MODEL`, `DAILY_ENGINE_LIMIT`, and what the athlete sees.

- [ ] **Step 1:** Apply the migration to Neon `dev` (`pnpm db:deploy` with the dev `.env`; turn off the corporate VPN, because port 5432 is blocked).
- [ ] **Step 2:** In the browser, with two Google accounts:
  - As **admin**, enable the coach. As **coach**, enable one continuous program and publish a week with a for_time custom block and a barbell block at percentages.
  - As **athlete**, adapt the custom block ("me duele el hombro derecho al levantar el brazo"), answer a question if one is asked, refine once ("sin saltos tampoco"), and accept. Check the Adapted pill, "See original" and the Spanish prose.
  - Adapt the barbell block ("no tengo barra") with a 1RM set: the kg are shown.
  - Log a result on the adapted custom block: the division is locked to Scaled. Check the leaderboard pill, and that the coach sees the snapshot.
  - As **coach**, edit the custom block's description: the athlete sees the stale notice. Edit only its tips: no stale notice.
  - Switch the program off: **Adapt** disappears and the accepted adaptation stays. Switch the coach off: the program switch is hidden.
  - Try a past day: no **Adapt**.
- [ ] **Step 3:** Run `pnpm eval` once against the real model, to confirm that the engine changes did not regress the eval set. Report the pass rate next to the last known one.
- [ ] **Step 4: Commit** the README. Open a PR from `feat/coaching-phase3` with the screenshots.
