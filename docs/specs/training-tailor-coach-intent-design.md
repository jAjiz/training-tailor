# Coach intent in block tailoring (coaching phase 4)

## Intent

When an athlete adapts a block, the engine should keep what the coach was after. Coaches already write that
intent: each block's coaching tips, the day note and the week note. Today none of it reaches the model. Phase 4 feeds
it into the engine; it adds no new field or instruction for coaches.

A phase 3 bug goes with it: `contentHash` includes `coachingTips`, so editing tips redoes the analysis, but the analysis
prompt never contains them.

## Goals

- The block analysis reads the block's coaching tips.
- Each tailoring run (first proposal and every refinement) reads the block's tips, the day note and the week note as
  the coach's intent, and uses them to decide which stimulus to keep and how to substitute.

## Non-goals

- New coach-facing fields or instructions for the AI.
- The coach dashboard of adaptations and correcting analyses (dropped from phase 4).
- The program description, and the notes of other days or weeks.
- Changes to the situation analysis (`adaptAnalyze`) or to the UI.

## Anti-goals

- Coach text copied into the adapted block's text.
- Coach intent overriding the safety rules: the plan's verdicts, AVOID, missing equipment, locked formats.
- Editing a day or week note marks accepted adaptations stale or forces re-analysis.

## Approaches

- **A. All in the analysis:** tips and notes go into the analysis and its hash. Rejected: editing a week note invalidates
  every block analysis that week, and the tailoring model sees the intent only second-hand through the analysed stimulus.
- **B. All in the tailoring:** the analysis stays as is. Rejected: it leaves the tips bug.
- **C. Mixed (chosen by the user):** tips, which belong to the block, go into the analysis. Tips, day note and week note
  go into every tailoring run, read from the database each time.

## Design

1. **Analysis.** `metadataText` in `src/lib/engine/analyze.ts` adds the tips to the COACH METADATA section
   (`BlockMetadata` gains `coachingTips`, filled by `blockMetadata`). The block analysis prompt says that metadata is
   context for reading the format and stimulus, never text to slice. `ANALYSIS_FORMAT_VERSION` goes to 3, so stored
   analyses are redone once, lazily, on the next adaptation. `workoutHash` is unchanged, so accepted adaptations do not
   go stale.
2. **Tailoring input.** `TailorOptions` in `src/lib/engine/pipeline.ts` gains
   `coachIntent: { blockTips: string | null; dayNote: string | null; weekNote: string | null }`, passed through to
   `TailorInput`. `buildTailorPrompt` adds a `COACH INTENT` section after ORIGINAL SESSION, with one labelled line per
   present text, or "none" when all are empty.
3. **Prompt rule.** A coaching rule in the tailoring system prompt says that COACH INTENT is what the coach wants from the
   session: use it to choose what to keep and how to substitute; ignore what is not about training (logistics,
   announcements); never copy it into `rawText`; it never overrides the hard rules or the component plan.
4. **Loading.** `adaptTailor` in `src/lib/training/services/adaptations.ts` reads the block's `coachingTips` (the block
   row it already loads), the `DayNote` for the block's day and the `WeekNote` for week `floor(dayIndex / 7)`, on every
   run, and passes them as `coachIntent` to both `runTailorPipeline` and `runRefinePipeline`. Adaptable days are
   already visible, so no extra visibility check is needed.
5. **Tests.** Prompt mechanics on invented fixtures: the analysis prompt carries the tips; `buildTailorPrompt` renders
   COACH INTENT with present and absent texts; `adaptTailor` passes the current notes on first and refine runs,
   including a note edited between runs; a note edit leaves an accepted adaptation fresh.

## Left to the builder

- Exact prompt wording, and where the rule sits among the coaching rules.
- Whether the eval cases need a coach-intent case (added in `/admin/library` if so, per AGENTS.md).
