# Training Tailor — Week Import from PDF Design

> Draft (2026-10-28). Builds on the coaching spec (`training-tailor-coaching-design.md`): the
> planner, blocks (`custom` / `barbell`), week publishing and `runAction`. Reuses the engine's
> LLM provider (`src/lib/ai`) and quota (`src/lib/quota.ts`).

## Problem

Coaches already write their weeks elsewhere (calendar exports from training apps, Word tables saved as PDF, their
own templates) and have to retype every block into the planner. That is the slowest part of
running a program in Training Tailor. The documents vary a lot between coaches: one is a
seven-column week with coloured blocks and separate "Coaching tips"; another is a table of
three days per row holding a whole four-week cycle. No fixed parser can read them all, so the
LLM translates the document into blocks, and the coach reviews the result before anything is
created.

## Goals

- From the planner, a coach uploads a **PDF** and gets the weeks it contains as planner blocks,
  ready to edit.
- A **review window** shows every translated block, all selected by default; the coach
  deselects what they do not want and imports the rest in one step.
- A PDF with **several weeks** imports them into consecutive weeks of the program, up to 4.
- Works with any reasonable layout, without per-coach configuration.

## Non-goals

- Word (`.docx`) or any other format: PDF only for now (owner, 2026-10-28). Coaches can save as
  PDF. The provider change below should not rule out adding `.docx` later.
- Editing block contents inside the review window: the coach selects or deselects, then edits in
  the normal block editor after import.
- Merging imported blocks into existing ones (the choice is add after them or replace the week).
- Importing more than 4 weeks from one PDF.
- Translating the text into another language.
- Keeping the PDF: it is processed once and not stored.
- Anything on the athlete side.

## Anti-goals

- **Blocks created without the coach seeing them first.** Nothing is written before
  "Importar selección".
- **A half import.** Either every selected block is created, or none is.
- **Changed content.** The model may tidy the text (line breaks, list formatting, obvious
  typos) but must not change anything that matters: movements, reps, loads, percentages, times,
  levels (Rx+/Rx/Int/Esc), notes. A wrong load in an athlete's week is worse than an
  untidy one.
- **Deleting the coach's existing blocks without asking.** Only an explicit "Reemplazarlos" deletes them.

## Decisions

| Area | Decision |
|------|----------|
| Entry point | A new **"Importar"** button in the planner's week tools (`WeekTools.tsx`), with the tooltip **"Importar semana desde PDF"**. Only shown when the planner is not read-only. |
| Input | One PDF, picked with a file input that accepts `application/pdf`. *Builder's call:* a size cap that fits Vercel's request body limit (4.5 MB), e.g. 4 MB, checked on the client and again on the server. The two sample documents are 140 KB and 320 KB. |
| Data notice | The Gemini API key is on the **free tier**, where Google may use inputs to improve its products. The upload step shows an **informative notice** (no checkbox, nothing to accept) that the PDF is processed with Google Gemini and Google may use its content (owner, 2026-10-28). Wording is the builder's; it must be in both locales. Revisit if the key moves to a paid tier. |
| How the PDF reaches the model | A **calendar PDF** is cut into days and blocks in code from its text layer, and the model only tidies each block's text; any other PDF goes to the model **as a file** (see "Translation"). Plain extracted text is jumbled for column layouts, so the calendar path groups it by position first. |
| Days without weekday names | Both samples name weekdays ("Lunes", "SEMANA 1 - Martes"). When a document numbers days instead ("Día 1, Día 2…"), they are placed in order from Monday, and the review window says so ("Los días del PDF no indican el día de la semana: se han colocado desde el lunes"). The coach moves blocks afterwards in the planner. No day-mapping control in the window. *My call.* |
| Week detection | The model returns a list of weeks, each with blocks per day (Monday–Sunday). A single-week document returns one week. If it finds more than 4, the response keeps the **first 4** and says how many were found; the window shows a warning that the rest were ignored (owner). |
| Target weeks | PDF week 1 goes to the week open in the planner, week 2 to the next, and so on. *My call.* Each week's header shows where it goes (for example, "Semana 1 del PDF → Semana 3 (28 sep – 4 oct)", or the week number for closed programs). |
| Closed programs | Weeks that fall past the program's last week are shown disabled with a notice and are not imported. *My call.* |
| Review window | Layout **A** (owner): a modal with the week as **columns per day**, like the planner. Each block is a tile with a checkbox, its title, a one-line summary and its kind (custom / barbell). **All blocks start selected** (owner). With several weeks, the coach moves **sideways between weeks** (‹ › and "Semana 1 de 4") and selects or deselects in each (owner). *My call:* a checkbox in each week's header selects or deselects the whole week. A short footer shows how many blocks are selected in total. |
| Confirm | One button, **"Importar selección"** (owner), which creates the selected blocks of every week. Disabled when nothing is selected. |
| Where blocks land | Appended after the blocks already on each day, in document order. When a week that receives blocks already has some, the window asks (owner, 2026-10-28): **add** to them (default) or **replace** them. Replace deletes every block of each week that receives at least one, with their results, in the same transaction as the import; weeks receiving nothing are untouched, and the window warns that results go too. |
| Published weeks | Importing does not change publish state. If a target week is already published, the imported blocks are visible to athletes straight away, as with any block the coach adds there. *My call:* the window says so on that week ("Esta semana ya está publicada: los bloques serán visibles para los atletas"). |
| Text handling | The model keeps the document's language and may tidy formatting and obvious typos without changing content (owner). |
| Coaching tips | Text the document marks as coaching tips, objectives or coach notes for a block goes to the block's `coachingTips`; the workout itself goes to `description` (custom) or `instructions` (barbell). |
| Block kind | Every imported block is **`custom`** with the document text (owner, 2026-10-28, after testing with the samples). Barbell blocks are made by hand in the editor. This keeps the model's output to copying text. |
| Scoring | For `custom`, the model picks a `Scoring` only when the document makes it obvious (for time with a time cap, AMRAP, load); otherwise `none`. |
| Colour | The model picks each block's colour from `BLOCK_COLORS` by its kind (owner, 2026-10-28), with a fixed mapping in the prompt so every week looks the same: warm-up blue, weightlifting orange, strength red, conditioning yellow, endurance green, accessories purple, notes neutral. |
| Week-level text | Text that is not a workout but belongs to the week or the day (objectives, day summaries, "Principios de entrenamiento") is still offered as a `custom` block on the day where it appears, so the coach can decide. A box with only a heading imports with the heading as its text and no title. A proper place for day and week objectives is a later feature (owner, 2026-10-28). |
| Line breaks | The document's blank lines between sections are kept; lines the PDF wrapped in a narrow column are joined. |
| Failure | If the model call fails, returns nothing usable or finds no blocks, the window shows an error and nothing is created. |
| Quota | A new `UsageKind` `"import"` with its **own** daily count, using the same `DAILY_ENGINE_LIMIT` value (no change to how other kinds are counted). Like the engine routes, quota is spent before the model call, so a failed translation still counts. *My call.* |
| Who | Approved coaches, on programs they own that are not archived. Impersonation sessions cannot import (they cannot spend quota on the coach's behalf, like the engine routes). |

## How it works

### Provider

`GenerateStructuredArgs` gains an optional list of file attachments (MIME type plus bytes).
`GeminiProvider` sends them as inline data parts next to the text prompt. `FakeProvider` accepts
and ignores them, keyed by `schemaName` as today. `withValidationRetry` keeps the attachments on
the retry. No other caller changes.

### Translation

`src/lib/import/` has two paths, chosen by the PDF's layout (owner, 2026-10-28, after testing with
the first sample: the lite model put its blocks on the wrong days from the page image, and no
prompt fixed it):

- **Calendar PDFs** (one column per weekday, a row of weekday headers on page 1, columns
  continuing on later pages without headers). Code reads the PDF's text layer (`unpdf`), assigns
  each line to the column it sits in, and starts a block at each line in a larger font than the
  body. Text above a day's first heading on a later page continues that day's previous block; a
  heading with no text is a block of its own, and the page title above the weekday row is dropped. A
  gap of more than twice the body size between lines is a blank line. The model gets only the
  blocks' text, by id, and returns each one tidied (wrapping undone, blank lines kept, the "Coaching
  tips" section moved out, scoring when obvious, a colour). Days and titles come from code, so the
  model cannot move or drop a block; a block it skips keeps the document's text. One week per PDF.
- **Any other PDF** goes to the model whole, which returns weeks, days and blocks
  (`{ weeksFound, daysNamed, weeks: [{ label, days: [{ day: 1–7, blocks }] }] }`), up to 4 weeks.

Both paths validate every block with `BlockInput` and drop and count blocks that cannot be made
valid, so the window can say "N bloques no se pudieron leer". The import uses the same model as the
engine (`GEMINI_MODEL`).

### Endpoints

1. **Translate**: a route handler (`POST`, multipart with the PDF and the `programId` /
   `weekIndex`) that checks the coach owns a writable program, the file type and size, consumes
   quota, calls the model and returns the translated weeks as JSON. Nothing is written. Its
   `maxDuration` should match the engine routes (120 s); a multi-page PDF can take a while, so the
   window shows a loading state.
2. **Import**: a server action, `importBlocksAction`, that receives the **selected** blocks with
   their target `dayIndex` and creates them in **one transaction**, appended to each day. It
   re-validates every block with `BlockInput` and every day with the existing range check; the
   client is not trusted. It reuses the existing block creation code. Then it revalidates the
   planner, which shows the new blocks.

The translated result lives only in the browser between the two steps. Closing the window
discards it (and the quota is spent).

### Review window

A client component opened from `WeekTools`, built from the existing `Modal`, `Button` and
`BlockCard` styles. States: pick a file → translating → review (weeks, tiles, warnings) →
importing → closed with the planner refreshed. Errors are shown inline in the modal using the
`errors.*` messages. New strings go to both `es.json` and `en.json`.

## Testing

Per `AGENTS.md`: tests use invented fixtures, not library content.

- Post-processing: 4-week cap and `weeksFound`, invalid barbell turned into custom, invalid blocks
  dropped and counted, day mapping to `dayIndex`, weeks past a closed program's end excluded.
- Provider: attachments reach the Gemini request as inline parts and survive the validation retry.
- Import action: ownership and archived checks, out-of-range days refused, all-or-nothing
  (one invalid block means nothing is created), appended positions.
- Translate route: file type and size checks, quota consumed, no writes.
- The model's actual reading of the two sample PDFs is checked by hand (it is not a unit test). The
  samples are the owner's paid programming: they stay outside the repo (the owner provides them)
  and are never committed as fixtures.
- *Builder's call (suggested):* the model returns each block's source text too, so a barbell
  block that fails validation becomes a custom block with the document's own wording.

## Left to the builder

- Exact component structure, file names and prompt wording.
- The upload size cap within Vercel's limit.
- Loading copy, and whether the window shows a short preview of each block's text on hover or
  expand.
- How "Semana N del PDF" labels use what the model returns as each week's label.
