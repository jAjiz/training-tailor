# Training Tailor — Day and Week Notes Design

> Approved (2026-10-30). Builds on the coaching spec (`training-tailor-coaching-design.md`): the
> planner, blocks, week publishing and the athlete's day view. The import section builds on the
> week import spec (`training-tailor-week-import-design.md`, merged in #13 and #14).

## Problem

Coaches write a goal for the day ("volumen de sentadilla a ritmo controlado") or for the week
("consolidar la técnica antes del test") alongside their workouts. Training Tailor has no place
for that text, so coaches put it in a `custom` block, which shows up as a workout the athlete
cannot log, gets counted as a block, and sits among the real blocks. The week import makes this
worse: the PDF boxes that only hold a day summary or the week's objectives are imported as
untitled `custom` blocks with the box heading as their description.

## Goals

- A coach can write **one text per day** ("Objetivo del día") and **one text per week**
  ("Texto de la semana") of a program, without creating a block.
- The athlete sees the **day text at the top of the day**, before the blocks, and opens the
  **week text from a button**.
- The week import puts day summaries and week objectives into these texts instead of blocks;
  the model classifies each box and the coach can correct it in the review window.

## Non-goals

- Rich text, links, images or video in the texts: plain text with line breaks, like
  announcements.
- Notifying athletes when a text is written or edited.
- Per-athlete or per-level texts.
- A text for the whole program: `Program.description` already exists.
- Migrating existing `custom` blocks that coaches used as notes: they stay as blocks; the coach
  can move the text by hand.

## Anti-goals

- **Athletes seeing a text before its week is published.** The texts follow exactly the same
  visibility as the blocks of that day or week.
- **Import overwriting text the coach already wrote without asking.** In add mode imported text
  is appended; only the import's explicit replace choice deletes existing notes.
- **A noisier planner.** With no texts written, the planner looks exactly as it does today
  (owner chose the menu-based entry, option B).

## Decisions

| Area | Decision |
|------|----------|
| What a note is | Plain text, trimmed, up to **2000** characters, line breaks kept. One per day (`dayIndex`) and one per week (`weekIndex`) of a program. Empty text = no note (saving empty deletes it). *My call* on the limit, matching announcements and `coachingTips`. |
| Data | Two new tables: `DayNote { programId, dayIndex, body, updatedAt }` with `@@id([programId, dayIndex])`, and `WeekNote { programId, weekIndex, body, updatedAt }` with `@@id([programId, weekIndex])`, both cascading on program delete. One migration. Owner, 2026-10-30, over one shared table with a `scope` column, a nullable `ProgramWeek.publishedAt` (a row there means "published", and closed programs have none), and a `"note"` kind of `Block` (every block query would have to skip it). |
| Coach: entry points | Owner, option B. The day column's "⋯" menu (`DayMenu`) gains **"Objetivo del día…"**; the week's "⋯" menu (`WeekTools`) gains **"Texto de la semana…"**. Each opens a `Modal` with one textarea, prefilled when a text exists, with Save and Cancel. Saving an empty textarea deletes the note. Hidden when the planner is read-only (archived program). |
| Coach: display | When written, the day text shows as a neutral note at the top of its column, above the blocks, and opens the same dialog when clicked. The week text shows as a short neutral strip above the board (one or two lines, truncated), also clickable. Nothing is shown when there is no text. In read-only mode they are shown but not clickable. *My call* on the exact look. |
| Coach: drag and drop | The day note is not draggable and is not a drop target; it does not count in the column's block count. |
| Duplicate day / week | "Duplicar día" also copies the day's note; "Duplicar semana" also copies the week note and each day's note. A note in the destination is **replaced** by the source's note; a source with no note leaves the destination's note as is. *My call*, played back to the owner without objection. |
| Publishing | A week with notes (its week note or any day note) and no blocks is **not empty**: it can be published, and the "an empty week cannot be published" check (server `week_empty` and the disabled button in `WeekTools`) counts notes as content (owner, 2026-10-30). |
| Athlete: day text | Owner, option A. On "Hoy" (`src/app/(athlete)/page.tsx`), when the day has a visible note, it shows in a **neutral card between the date line and the first block**, full width, with a small "Objetivo del día" label. Line breaks are kept. |
| Athlete: week button | Owner, option A. A **"Semana"** button with an info icon sits in the black `AthleteHeader`, in the row with the program selector. It opens a **bottom sheet** with the week text. The button only appears when that week has a visible note. *My calls:* it goes on the **left** of the top row, which today is empty padding that keeps the title centred against the two icons on the right, so the title stays centred; it is passed to the header as an optional slot and shown on **"Hoy" only**, not on the Calendar tab, which has no selected day. |
| Which week | The program week the **selected day** belongs to (`floor(dayIndex / 7)`). For continuous programs that is the Monday–Sunday week of the strip; for closed programs, whose week 1 starts the day the athlete joined, the strip's Monday–Sunday can span two program weeks, and the button follows the selected day. *My call.* No button when the selected day is outside the program (before start, finished). |
| Visibility | A day note is visible to an athlete exactly when its day is (`isDayVisible`); a week note when the first day of that week is. Coach-deleted programs keep showing notes, like blocks. |
| Day with a note and no blocks | Shows the note card and not the "Nada programado" empty state. The week strip and calendar dot (`getVisibleDays`) also mark days that only have a note. *My call.* |
| Copy | New strings in `es.json` and `en.json`: "Objetivo del día" / "Day goal", "Texto de la semana" / "Week notes", "Semana" / "Week". Final wording is the builder's. |
| Impersonation | Admins impersonating a coach can write notes like they can edit blocks; nothing special. |

## Import

This section changes the week import already on `main` (`src/lib/import/`, the import window
and `importBlocks` in `src/lib/training/services/blocks.ts`). Notes and their import ship together.

### Classification

Owner: the model classifies each box by itself; the coach can correct it in the review window.

- Every translated item gets a **`role`**: `"block"` (default), `"day_note"` or `"week_note"`.
  In the model schema it is optional and omitted for blocks, keeping output short.
- **Calendar path** (cut in code, tidied by the model): the tidy response gains the optional
  `role` per block id. The prompt says: a box that is a summary or objective of the day is
  `day_note`; a box with the week's objectives or principles is `week_note`; workouts are blocks.
  The existing rule "a heading with no text is a block of its own" stays: such a box becomes an
  item whose text is its heading.
- **Whole-PDF path**: `ModelBlock` gains the same optional `role`. The week a `week_note` belongs
  to is the week it appears in.
- For notes, only the text matters: title, colour, scoring and coaching tips are dropped. The
  note's text is the box's title (if any) and description joined by a line break, so a
  heading-only box keeps its heading. The prompt change replaces the current line telling the
  model that day and week notes are neutral blocks.

### Review window

- Each tile keeps its checkbox and gains a small **role selector** with three options: Bloque /
  Objetivo del día / Texto de la semana, preset from the model. Changing it changes how the tile
  is imported; it does not move the tile. *My call* on the control (a small segmented control or
  menu on the tile).
- Notes tiles look neutral and show their text, so they are easy to tell from workouts.
- Selection, week navigation and "Importar selección" work as today, counting notes too.

### Writing

- `importBlocksAction` (or a renamed import action) receives blocks and notes in one call and
  writes them in the **same transaction**: all or nothing, as today.
- A `day_note` goes to its target day; a `week_note` to its target week.
- In **add mode** (the default), imported notes never replace: if the target day or week already
  has a note, the imported text is appended after a blank line. Several imported notes for the same day or week are joined the
  same way, in document order.
- **Replace mode** (the import's "Reemplazarlos", which deletes the blocks of each week receiving
  blocks): *my calls:* only imported **blocks** make a week "receive" for that rule, so a week
  getting only a note never has its blocks deleted; the add-or-replace question is asked only for
  weeks that receive blocks and already have some, as today. In a week being replaced, **its week
  note and all its day notes are deleted too**, and only the imported notes remain (owner,
  2026-10-30: "borra todo e importa"). The window's replace warning says notes go as well.
- If the joined text exceeds 2000 characters, the import is refused with an error that names the
  day or week; nothing is written. *My call*: truncating would silently drop coach text.
- Validation on the server, as for blocks: role, target day/week range, text length.

## Testing

Per `AGENTS.md`: invented fixtures (`Test …`), no library content.

- Note services: create, edit, delete on empty text, 2000-char limit, ownership and archived
  checks, range checks on day and week.
- A continuous week with only notes can be published; one with neither notes nor blocks cannot.
- Duplicate day and week copy notes, replace the destination's, and leave it alone when the
  source has none.
- Athlete view: a note is hidden on unpublished days and weeks, shown on published ones; the
  week of a closed program follows the selected day; a day with only a note is marked as having
  content and does not show the empty state.
- Import: a `role` from the model reaches the item; changing the role in the window changes what
  is written; notes are appended to existing ones; over-limit text refuses the whole import.
- UI: the planner without notes renders as before; the menus open the dialog; the athlete header
  shows the week button only when there is a note.

## Left to the builder

- Component structure, file names, and whether day and week note services share code.
- Exact styling of the planner note, week strip, athlete card and bottom sheet, within the
  existing UI components (`Modal`, `Card`, `Menu`).
- Whether the bottom sheet is a new component or a `Modal` variant.
- Prompt wording for the classification.
