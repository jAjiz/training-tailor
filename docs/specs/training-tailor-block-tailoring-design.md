# Training Tailor — Coaching phase 3: Block tailoring

> Phase 3 of the Coaching project (`training-tailor-coaching-design.md`). It replaces the
> standalone engine page (`/tailor`) with tailoring **inside a program**, one block at a time,
> and pulls the on/off switches of phase 4 forward.

## Intent

Athletes follow a coach's program. On a given day something gets in the way: a sore shoulder,
no rower, a box that is too high. Today they either skip the block or guess a scaling. The
engine (v1, paused since 2026-10-07) already knows how to modify a workout around pain and
missing kit while keeping its stimulus, and it validates the result without the model. This
phase puts that engine where the athlete already is: on the block they are about to do.

The coach stays in charge. The admin decides which coaches get the feature, and each of those
coaches decides which of their programs offer it.

## Goals

- From a block in the athlete day view, an **Adapt** action opens a chat panel over the same
  screen. The athlete writes what is wrong today; the engine may ask a question; it shows the
  adapted block; the athlete accepts it or asks for more changes, as many rounds as needed.
- An accepted adaptation replaces the block **for that athlete only**. The block shows an
  **Adapted** mark and a way to see the coach's original. The athlete can discard the
  adaptation at any time.
- A result logged on an adapted block is always **Scaled** and carries an **Adapted** tag,
  in the leaderboard and in the coach's result views.
- The coach can open an adapted result and see the adapted block and what the athlete wrote.
- Two switches: the admin enables tailoring per coach; an enabled coach enables it per program.
- Spanish and English throughout, like the rest of the athlete side.

## Non-goals

- Tailoring a whole session, merging missed days, or tailoring a pasted workout. `/tailor` and
  its API routes are removed.
- A time budget for the day ("I only have 20 minutes"). The athlete can write it, and it reaches
  the model as part of the situation, but there is no time-cap field or check for a single
  block.
- Phase 4 beyond the switches and the read-only view of adaptations: coach intent notes for the
  engine, a coach dashboard of who adapted what, correcting what the engine understood.
- Payments (phase 5) or a separate AI quota per plan.
- Changing the engine's safety model. Validation, fail-closed on contraindicated movements and
  the domain library stay as they are.

## Anti-goals

- **An adaptation must never be passed off as the coach's workout.** Anything adapted is
  visibly marked everywhere it appears: day view, leaderboard, coach views.
- **Rx must stay comparable.** No adapted result ever lands in Rx.
- **No new way around the engine's validation.** The pipeline's refusals stay as they are,
  and so do its fixes; this phase does not loosen them.
- **The athlete must not lose the original.** It is always one tap away while an adaptation
  is active.

## Decisions (from the conversation)

| Area | Decision |
|------|----------|
| Entry point | An **Adapt** button on the block card in the athlete day view, next to coaching tips, log result and leaderboard. |
| Interaction | A panel over the day view (bottom sheet on phone) with a chat: the athlete's messages, the engine's questions, the proposed adapted block with **Accept** and a field to ask for more changes. |
| Scope of one run | One block. |
| After accept | Back to the day view; the block renders the adapted version, marked **Adapted**, with **See original**. |
| Results | Adapted ⇒ division forced to **Scaled** and tagged **Adapted** (option B). |
| Enablement | Admin → per coach; coach → per program. Both must be on. |
| `/tailor` | Removed. |
| Engine profile | Moves into the **Me** tab, localized. Optional: without it the athlete only describes today. |
| Block analysis | **Approach B** (below): analyzed once per block version and stored; athletes only pay for the tailoring step. |

## Approaches considered

The engine runs two model steps: **analysis** (free text → structured blocks with movements
resolved against the library and a stimulus profile) and **tailoring** (structured workout +
situation → modified workout), followed by deterministic validation. Custom blocks are free
text, so analysis is always needed; the question was when.

- **A. Analyze on every adaptation.** Render the block as text and run the existing paste
  pipeline. Reuses the most code, but each adaptation costs two model calls (slower, more
  quota), and two athletes may get different readings of the same block.
- **B. Analyze once per block version, store it (chosen).** The first adaptation of a block
  version runs analysis and stores it; later ones only run tailoring. A coach edit makes the
  stored analysis stale and the next adaptation re-analyzes. Faster and consistent across
  athletes. The stored analysis is also what phase 4 would show a coach who wants to see or
  correct the engine's reading.
- **C. Analyze at publication.** Every block is analyzed when the coach publishes the week.
  The athlete never waits for analysis, but publishing becomes slow and can fail on the model,
  and most blocks are analyzed for nothing.

## Design

### Enablement

- `CoachAccount.tailoringEnabled Boolean @default(false)`: set by the admin on
  `/admin/coaches/[id]`, written to the admin audit log (`writeAudit`), like other admin
  actions on a coach.
- `Program.tailoringEnabled Boolean @default(false)`: set by the coach in the program settings
  (`/coach/programs/[id]/settings`). The control only appears when the coach is enabled.
- A block is **adaptable** for an athlete when all of these hold: the coach is enabled and
  `approved`, the program is enabled and not archived, the block is visible to the athlete
  (published week or published closed program) **and its day is today or later** in the
  athlete's time zone (decided by the user: athletes can prepare tomorrow; a past day is
  never adapted, so an old result is never rewritten), the athlete is actively enrolled
  (`activeAthleteIn`), the athlete is not disabled, and the session is not an impersonation
  (`engineUserId` already refuses those).
- Turning a switch off stops new adaptations and hides **Adapt**. *(Builder's call, proposed:)*
  accepted adaptations stay visible with their mark, and results keep their tag. Switching
  off should not change what the athlete already did.

### Block analysis (approach B)

- New model `BlockAnalysis`, one row per block:
  - `blockId` (unique).
  - `contentHash`, a hash of the fields that define the workout: `kind`, `title`,
    `description`, `scoring`, `timeCapSeconds`, `movement`, `sets`, `instructions`,
    `coachingTips`. **Not** `position`, `dayIndex`, `color` or `updatedAt`, so moving a
    block does not invalidate its analysis.
  - `libraryVersion`: the published library version used.
  - `workout Json`: a one-block `StructuredWorkout`.
  - `analyzed Boolean` (false when analysis degraded to a raw block).
  - `model`.
- The analysis is valid when both `contentHash` and `libraryVersion` match the current
  values. Otherwise the next adaptation re-analyzes and upserts the row.
- **Two hashes.** *(Builder's call:)* `contentHash` (analysis validity) includes
  `coachingTips`, because they feed the analysis as coaching notes. The hash that decides
  whether an **accepted adaptation is stale** (`workoutHash`) leaves out `coachingTips`: the
  tips always come from the coach's block, so fixing a tip must not mark every athlete's
  adaptation as stale.
- **One coach block may become several engine blocks.** *(Builder's call:)* a custom block
  that holds a warm-up and a metcon may come back from analysis as two or more engine
  blocks. That is allowed internally; the tailoring must account for all of them, as it does
  today. The adapted result is always rendered and snapshotted as **one card** (the tailored
  `rawText` plus changes). A proposal that drops every engine block, or ends with no
  components after `removeUnavailable`, is not offered for acceptance: the chat says the
  block can't be adapted that way.
- **Input text.** For a custom block, the analysis reads the title, description, scoring and
  time cap. For a barbell block, it reads the rendered sets in **percent** terms
  (`describeSets` without a 1RM), plus its instructions. The block's canonical movement is
  forced onto the **main-lift components only**, the ones that carry the block's sets; any
  other movement named in the instructions is resolved normally. The stored analysis is
  athlete-independent.
- **Per-athlete loads.** These are applied after the stored analysis is loaded: for barbell
  components with `percent1RM`, the kg come from the athlete's current 1RM for that movement
  (their PRs), when they have one. `loadKg` is a `{ male, female }` pair. *(Builder's
  call:)* both slots get the same value, because it is this athlete's own load and not a
  tiered prescription.
- The analysis needs a workout-only call. Today `analyzePaste` reads the workout and the
  situation together. The builder splits it, or adds a block-analysis variant, so the stored
  analysis contains no athlete's situation.
- Two athletes adapting the same fresh block at once may both analyze it. Last write wins. It
  is a wasted call, not a correctness problem.

### The adaptation conversation

- New model `BlockAdaptation`, one row per (athlete, block), `@@unique([blockId, athleteId])`.
  It holds:
  - **The conversation** (`messages Json`): ordered entries for the athlete's text, the
    engine's questions and the athlete's answers, proposals, and errors, each with a
    timestamp.
  - **The engine session state** that today travels back from the client in the `/tailor`
    flow: the confirmed conditions, restrictions, unavailable equipment, feedback history,
    and the latest proposal (`TailoringResult` and findings). The server keeps it and never
    trusts the client for it.
  - **The accepted version** (`accepted Json?`): the proposal the athlete accepted, the
    `workoutHash` of the block it was made from, and `acceptedAt`.
  - `model` and `libraryVersion`.
- **Flow.** It runs on new streaming route handlers (NDJSON, same pattern as
  `handleEngineRequest`). *(Builder's call:)* to fit the time limits, each message is split
  into two requests chained by the client, as `/tailor` does today:
  - **Analyze**: block analysis when needed, situation analysis, questions.
    `maxDuration = 60`.
  - **Tailor or refine**: tailoring, retry and validation. `maxDuration = 120`.

  The steps:
  1. The athlete opens the panel on an adaptable block. If there is an accepted adaptation,
     the panel shows it and the previous conversation, and the athlete can keep asking for
     changes.
  2. The athlete sends a message. The server ensures a valid `BlockAnalysis`, then runs the
     situation analysis on the message (`analyzeSituation` / `analyzeFeedback`, using the
     stored profile).
  3. If the plan raises questions (`buildQuestions`), they are shown in the chat as
     answerable messages: the option buttons from today's `ClarifyStep`, or free text.
     Answers go through `applyAnswers` / `mergeFreeText` as today.
  4. The server tailors (`runTailorPipeline` the first time, `runRefinePipeline` after that)
     and validates. Validation behaves **as it does today** (decided by the user):
     - Only a contraindicated movement (`EngineUnsafeError`) refuses the proposal. So does an
       empty or fully dropped block, as described above. The chat then explains it in plain
       words ("this can't be adapted safely, talk to your coach").
     - Other findings that remain after the retry (`stimulus_drift`, `unrecognized_movement`,
       `change_mismatch`, …) are shown as warnings next to the proposal. The athlete can
       still accept it.
     - `equipment_unavailable` is still repaired by removing the movement.
  5. The proposal is shown in the chat as the adapted block, with the changes list (original
     → modified, reason) and the safety note, plus **Accept**. The athlete can type more
     feedback instead, which goes back to step 2 as a refinement.
  6. **Accept** copies the latest proposal into `accepted`. The panel closes and the day view
     re-renders.
- Closing the panel without accepting keeps the conversation and any earlier accepted version
  unchanged.
- **Discard** (in the block's adapted view) clears `accepted`. *(Builder's call, proposed:)*
  the conversation is kept, so reopening the panel resumes it.
- The tailor prompt receives the athlete's locale, so `rationale`, `changes` and the adapted
  block text come in Spanish or English as the athlete uses the app. Today the prompt
  follows "the language of the athlete's situation", which is close but not the same.
- **Quota.** Each athlete message that reaches the model counts against the existing daily
  limit (`consumeQuota`: `tailor` for the first proposal, `refine` after that). A
  re-analysis counts as `analyze` for the athlete who triggered it. Answering a clarify
  question with a button does not call the model until the tailoring run, so it costs
  nothing extra.
- Unrecognized movements are queued for the admin exactly as today (`recordUnrecognized`).

### Day view

- The block card shows **Adapt** when the block is adaptable. Next to the existing buttons,
  it reads **Adapt** with no adaptation, or **Adjust adaptation** when one exists. Exact
  labels are left to the builder.
- With an accepted adaptation whose `workoutHash` matches the block:
  - The card renders the adapted block (its text and, for barbell, the adapted sets and kg).
  - It shows an **Adapted** badge and a **See original** toggle that swaps in the coach's
    block in place.
  - The coaching tips and video still come from the coach's block.
- **Stale adaptation** (the coach edited the block after acceptance). *(Builder's call,
  proposed:)*
  - The card renders the **coach's current block**, with a notice that the athlete's
    adaptation was made for an earlier version.
  - It offers **Adapt again** and **See previous adaptation**. Showing an adaptation of a
    workout that no longer exists would mislead.
- No change to the coach's planner. Adaptations are per athlete and do not appear there.

### Results

- `Result` gains `adaptation Json?`: a snapshot of the accepted adapted block (text, changes)
  and the athlete's situation messages at the time of logging.
- Logging a result on a custom block with an active, non-stale accepted adaptation:
  - Hides the division control and stores `division = "scaled"` and the snapshot.
  - Uses the **original block's scoring type and time cap**. *(Builder's call:)* the
    adaptation must keep the block's scoring. The tailor prompt says so, and a **new**
    `scoring_changed` finding rejects a proposal whose block format no longer fits the
    original's scoring. This finding and the format-to-scoring mapping don't exist yet; they
    are part of this phase.
- **Accepting an adaptation on a block that already has a result** sets that result to
  Scaled and writes the snapshot.
- **The tag is sticky.** *(Builder's call:)* once a result has a snapshot, every later save
  keeps it, along with Scaled, even after the athlete discards the adaptation or it goes
  stale. The division control stays locked. Only deleting the result clears it. This is
  what keeps Rx comparable.
- **Barbell blocks.** These have no division control and no leaderboard, and `saveResult`
  stores `"rx"` for them.
  - *(Builder's call:)* an adapted barbell result keeps that and only gets the snapshot and
    the **Adapted** tag. Option B was about leaderboards, which barbell blocks don't have.
  - If an adaptation is active, logging does not prompt to update any 1RM, for the original
    movement or a replacement.
- **Leaderboard.** Adapted results show the **Adapted** tag. They rank in Scaled like any
  other Scaled result.
- **Coach's result views** (`/coach/blocks/[id]/results`, the athlete's page under the
  program):
  - Adapted results show the tag.
  - Opening it shows the snapshot: the adapted block, the changes and what the athlete wrote.
  - The athlete is told in the panel, in one line, that their coach can see what they write
    there.

### Profile

- `/profile` moves under the **Me** tab (for example `/me/profile`, linked from `/me`),
  restyled with `src/components/ui` and fully localized. `/api/profile` stays.
- **1RM.** The coaching PRs (`/prs`) are the single source for 1RM. *(Builder's call,
  proposed:)*
  - The profile form drops the `1rm` benchmark kind and keeps `max_reps` and `time`.
  - The engine reads 1RMs from PRs.
  - Existing `1rm` benchmarks in stored profiles are ignored, not migrated: PRs are what
    athletes maintain.
- Fields that only made sense for whole sessions (`availability`) stay in the schema but leave
  the form. Single-block tailoring does not use them.

### Removal

- Delete `src/app/(athlete)/tailor/*` and `/api/tailor/*`, and the client code only they use.
- Keep the engine library (`src/lib/engine/*`), `engine-route`, `engine-stream` and the eval
  harness. The new routes reuse them.
- Drop the `TailoredWorkout` model and table in this phase (decided by the user):
  - Remove the model, its `User` relation and the save route.
  - Ship a migration that drops the table.
  - Its rows are only `/tailor` test runs from the beta, and nothing reads them.
  - Adaptations live in `BlockAdaptation`, with snapshots in `Result.adaptation`.
- Fix any link, redirect or i18n string that pointed at `/tailor`.

### Admin and audit

- `/admin/coaches/[id]` gains the tailoring switch; flipping it writes an audit row.
- The admin coaches list shows whether each coach has tailoring.

## Constraints

- Next.js 16 App Router, Prisma 7 on Neon, next-intl, Zod 4, Vitest. Gemini via the
  `LlmProvider` interface, model pinned by `GEMINI_MODEL`.
- **Mutations.** Server Actions over services in `src/lib/training/` for the switches,
  accept, discard and logging. Route handlers with NDJSON streaming for the engine steps,
  because they are long-running.
- **Gemini latency** stays uncontrolled on purpose: no per-attempt timeout, because the SDK
  turns it into `X-Server-Timeout`, which caused 504s. Route limits follow today's: 60 s for
  analysis, 120 s for tailoring.
- **Domain library.** The published version in the database is the only source. Tests use
  invented fixtures (`Test …`, `tests/helpers/library-builders.ts`). Anything that depends on
  the library's content is a library expectation, not a test.
- **New UI** uses `src/components/ui` and theme tokens, and works at phone width.
- **Migrations** run on deploy, so new columns need safe defaults: all switches default to
  off, and every new JSON column is nullable.

## Verification

- Unit and service tests for:
  - adaptability rules;
  - analysis cache validity: hash fields, library version, and a block move not
    invalidating it;
  - forcing Scaled and the snapshot on log and on accept;
  - stale detection;
  - the profile's 1RM coming from PRs.
- Engine tests with a stub provider for the block conversation: first proposal, a clarify
  question, a refinement, an unsafe refusal.
- **Engine F1 (pending since v1)** folds in here. Run a real end-to-end pass on Neon `dev`
  with the real model:
  - a custom block and a barbell block;
  - pain, missing equipment, a refinement and accept;
  - log a result, check the leaderboard tag, check the coach's view;
  - try with tailoring off at each level.
- Browser verification with two Google accounts (coach and athlete), as in phases 1–2.

## Left to the builder

- Exact component structure of the panel (bottom sheet vs dialog on desktop), labels and copy.
- Message shapes in `BlockAdaptation.messages` and the NDJSON event names.
- How the adapted barbell block is rendered (reuse `describeSets` where possible).
- The hash function and canonical serialization of the block fields.
- Whether `analyzePaste` is split or a sibling `analyzeBlock` is added.
