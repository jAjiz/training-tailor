# Coach intent in block tailoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The block analysis reads the block's coaching tips, and every tailoring run reads the tips, the day note and the week note as the coach's intent.

**Architecture:** Tips join the analysis's COACH METADATA section (already hashed by `contentHash`; the analysis format version goes to 3). A `CoachIntent` value goes from `adaptTailor` through the pipeline's `TailorOptions` into `TailorInput`, and `buildTailorPrompt` renders it as a COACH INTENT section, read from the database on every run.

**Tech Stack:** TypeScript, Prisma 7 (PGlite in tests), Vitest, `FakeProvider`.

**Spec:** `docs/specs/training-tailor-coach-intent-design.md`

## Global Constraints

- Tests use invented fixtures (`Test ` names); no library content in tests (AGENTS.md).
- `workoutHash` must not change: editing tips or notes never marks an accepted adaptation stale.
- Coach intent never overrides the hard rules or the component plan, and is never copied into `rawText`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A day or week with no note, and a block with no tips: the prompt says "none" instead of empty labelled lines.
- A note edited between the first proposal and a refinement: the refinement sees the new text (Task 3 test).
- A note on another day or week of the same program never reaches the prompt (Task 3 test).
- A note that is only logistics ("no class Friday"): the rule tells the model to ignore it (Task 2 asserts the rule text).
- Tips containing quotes or newlines: rendered verbatim inside the section without breaking it (Task 2 test with a multi-line tip).

---

### Task 1: Tips in the block analysis

**Files:**
- Modify: `src/lib/training/block-engine.ts` (`blockMetadata`, `ANALYSIS_FORMAT_VERSION`)
- Modify: `src/lib/engine/analyze.ts` (`BlockMetadata`, `metadataText`, `BLOCK_SYSTEM`)
- Test: `tests/training/block-engine.test.ts`, `tests/engine/analyze.test.ts`

**Interfaces:**
- Produces: `BlockMetadata { title; scoring; timeCapMinutes; coachingTips: string | null }`.

- [ ] **Step 1: Write the failing tests**
  - `block-engine.test.ts`, "carries title, scoring and time cap for the analysis": expected objects gain `coachingTips` (the fixture's tips, or `null`); the barbell expectation at line 71 too.
  - `block-engine.test.ts`, new "tips change the analysis hash but not the workout hash": `contentHash(custom) !== contentHash({ ...custom, coachingTips: "Test tip" })` and `workoutHash` equal for both.
  - `analyze.test.ts`, "sends the coach metadata as context outside the SESSION": metadata `{ ..., coachingTips: "Keep it fast\nTest note" }` → the slice between COACH METADATA and SESSION matches `/coaching tips: Keep it fast\nTest note/`; system prompt matches `/coaching tips/`.
  - `analyze.test.ts`, "sends no metadata section when there is none": also holds for metadata with every field `null`.
- [ ] **Step 2: Run** `pnpm vitest run tests/training/block-engine.test.ts tests/engine/analyze.test.ts` — expect FAIL on the new fields.
- [ ] **Step 3: Implement.** `blockMetadata` copies `coachingTips` (trimmed; empty → `null`). `metadataText` adds `- coaching tips: <text>` last. `BLOCK_SYSTEM`'s COACH METADATA rule lists coaching tips among the context and says to use them for the "stimulus" and "coachingNotes" of the block, never for slices. `ANALYSIS_FORMAT_VERSION = 3` with a doc line: "3: coaching tips in the coach metadata."
- [ ] **Step 4: Run** the same command plus `pnpm vitest run tests/training/services` — expect PASS.
- [ ] **Step 5: Commit** "Read coaching tips in the block analysis".

### Task 2: COACH INTENT in the tailoring prompt

**Files:**
- Modify: `src/lib/engine/tailor.ts` (`TailorInput`, `systemPrompt`, `buildTailorPrompt`)
- Modify: `src/lib/engine/pipeline.ts` (`TailorOptions`, `tailorAndValidate`, `runTailorPipeline`, `runRefinePipeline`)
- Test: `tests/engine/tailor.test.ts`, `tests/engine/pipeline.test.ts`

**Interfaces:**
- Produces (exported from `tailor.ts`): `interface CoachIntent { blockTips: string | null; dayNote: string | null; weekNote: string | null }`; `TailorInput.coachIntent: CoachIntent | null`; `TailorOptions.coachIntent: CoachIntent | null` (required, so every caller states it).

- [ ] **Step 1: Write the failing tests** in `tailor.test.ts` (helper `input()` gets `coachIntent: null`):
  - "renders the coach intent after the original session": `coachIntent: { blockTips: "Test tip line 1\nline 2", dayNote: "Test day goal", weekNote: null }` → prompt contains `COACH INTENT`, `- block coaching tips: Test tip line 1\nline 2`, `- day note: Test day goal`, no `week note`; `indexOf("COACH INTENT") > indexOf("ORIGINAL SESSION")` and `< indexOf("ATHLETE:")`.
  - "says none when the coach wrote no intent": `null` and all-`null` both give `COACH INTENT: none`.
  - "tells the model how to use the coach intent": system prompt (via a FakeProvider call's `systemPrompt`) matches `/COACH INTENT/`, `/ignore/i` (non-training text), `/never copy/i` (into rawText), and `/never overrides/i`.
  - `pipeline.test.ts`: the `run` helper and the two refine calls pass `coachIntent: null`; new "passes the coach intent to the tailoring prompt": `runTailorPipeline` with `coachIntent: { blockTips: null, dayNote: "Test day goal", weekNote: null }` → the `TailoringResult` call's prompt contains `Test day goal`; same for `runRefinePipeline`.
- [ ] **Step 2: Run** `pnpm vitest run tests/engine/tailor.test.ts tests/engine/pipeline.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Section lines in order block tips, day note, week note, labelled `- block coaching tips:`, `- day note:`, `- week note:`, text verbatim. New coaching rule in `systemPrompt`: COACH INTENT is what the coach wants from this session; use it to decide what to keep and how to substitute; ignore anything in it that is not about training; never copy it into "rawText"; it never overrides the hard rules or the COMPONENT PLAN. `tailorAndValidate` passes `s.coachIntent` into `TailorInput`; both run functions forward `args.coachIntent`.
- [ ] **Step 4: Run** `pnpm vitest run tests/engine` and `pnpm tsc --noEmit` — expect PASS (the only production caller fails typecheck until Task 3; pass `coachIntent: null` there temporarily if needed, Task 3 replaces it).
- [ ] **Step 5: Commit** "Send the coach intent to the tailoring prompt".

### Task 3: Load the coach intent in adaptTailor

**Files:**
- Modify: `src/lib/training/services/adaptations.ts` (`adaptTailor`, new private `coachIntentFor`)
- Test: `tests/training/services/adaptations.test.ts`

**Interfaces:**
- Consumes: `CoachIntent` (Task 2), `TailorOptions.coachIntent`.
- Produces: `async function coachIntentFor(db: Db, block: { programId: string; dayIndex: number; coachingTips: string | null }): Promise<CoachIntent>` (module-private).

- [ ] **Step 1: Write the failing tests** (new `describe("coach intent")`, using `setup()`; notes created with `tdb.prisma.dayNote.create` / `weekNote.create`):
  - "the proposal prompt carries the block tips, the day note and the week note": block updated with `coachingTips: "Test tip"`, day note for day 0 "Test day goal", week note for week 0 "Test week goal", plus a day note for day 1 "Test other day" and a week note for week 1 "Test other week" → the `TailoringResult` call's prompt contains the three texts and neither "other" text.
  - "a refinement reads the note as it is now": propose, update the day note to "Test day goal v2", send feedback (`say`), `tailorNow` → the last `TailoringResult` prompt contains "v2" and not the old body.
  - "editing a note leaves an accepted adaptation fresh": propose, `acceptAdaptation`, update the day note, `getAdaptation` → not stale (same check the existing staleness tests use).
- [ ] **Step 2: Run** `pnpm vitest run tests/training/services/adaptations.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `coachIntentFor`: read `DayNote(programId, dayIndex)` and `WeekNote(programId, floor(dayIndex / 7))` in parallel; empty or whitespace bodies and tips → `null`. `adaptTailor` adds `coachIntent: await coachIntentFor(db, block)` to `common`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` — expect all PASS.
- [ ] **Step 5: Commit** "Load the coach intent for each tailoring run".
