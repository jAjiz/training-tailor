# Day and Week Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches write one text per day and one per week of a program; athletes read the day text above the day's blocks and the week text from a "Semana" button; the PDF import fills them.

**Architecture:** Two new Prisma tables (`DayNote`, `WeekNote`) behind a new `notes` service. Duplicate, publish and import services in `blocks.ts` / `programs.ts` learn about notes. The planner gets a note dialog opened from the existing "⋯" menus; the athlete view reads notes with the same visibility as blocks. The import model gains a `role` per box, the review window lets the coach change it, and the import action writes blocks and notes in one transaction.

**Tech Stack:** Next.js 16 (server actions, RSC), TypeScript, Zod 4, Prisma 7 (PostgreSQL; PGlite in tests), next-intl, Vitest + Testing Library.

**Spec:** `docs/specs/training-tailor-day-week-notes-design.md`

## Global Constraints

- A note is plain text, trimmed, at most **2000** characters, line breaks kept. Saving empty text deletes the note.
- One note per (`programId`, `dayIndex`) and one per (`programId`, `weekIndex`). Week of a day = `Math.floor(dayIndex / 7)`.
- Notes follow block visibility exactly: a day note is visible iff `isDayVisible(timeline, dayIndex)`; a week note iff `isDayVisible(timeline, weekIndex * 7)`.
- With no notes written, the planner renders exactly as today.
- Copy (es / en): menu entries **"Objetivo del día…"** / "Day goal…" and **"Texto de la semana…"** / "Week notes…"; athlete label **"Objetivo del día"** / "Day goal"; athlete button **"Semana"** / "Week". Every new string in both `es.json` and `en.json`; every new error code in `ERROR_CODES` with an `errors.<code>` message.
- Import: in add mode imported notes are appended to existing ones after a blank line (`"\n\n"`), never replace; in replace mode the replaced weeks' notes (week + its 7 days) are deleted first. Only imported **blocks** make a week "replaced" or trigger the add-or-replace question.
- Tests use invented fixtures (`Test …` names) per `AGENTS.md`; no library content, no sample PDFs.
- Run checks with `pnpm test`, `pnpm lint` and `pnpm exec tsc --noEmit`.

## Review Focus

1. **A note written on a day of an unpublished week** → the athlete sees nothing (no card, no dot, no "Semana" button). Tests in Task 4.
2. **A closed-program athlete who joined mid-week** selects Sunday → the "Semana" button shows the program week of that Sunday, not of the Monday of the strip. Test in Task 4.
3. **An import whose joined note text passes 2000 chars** (existing 1900 + imported 200) → whole import refused with `note_too_long` naming the day or week, nothing written. Test in Task 7.
4. **Replace mode on a week that has notes but whose import only brings notes** → no blocks are deleted, notes are appended (add semantics for that week). Test in Task 7.
5. **Coach pastes text with only spaces** → treated as empty: the note is deleted, not saved as blank. Test in Task 1.

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma`, `prisma/migrations/20261030120000_day_week_notes/migration.sql` | `DayNote`, `WeekNote` tables. |
| `src/lib/training/schemas.ts` (modify) | `NoteBody` schema. |
| `src/lib/training/services/notes.ts` (create) | Read and write notes (coach side), note copying helpers. |
| `src/lib/training/services/blocks.ts` (modify) | Duplicate day/week copy notes; `importBlocks` writes notes. |
| `src/lib/training/services/programs.ts` (modify) | `setWeekPublished` counts notes as content. |
| `src/lib/training/services/athlete-view.ts` (modify) | Day note in `getAthleteDay`, `getAthleteWeekNote`, note days in `getVisibleDays`. |
| `src/app/coach/note-actions.ts` (create) | `setDayNoteAction`, `setWeekNoteAction`. |
| `src/app/coach/programs/[id]/planner/NoteDialog.tsx` (create) | Textarea modal shared by day and week. |
| `src/app/coach/programs/[id]/planner/{DayTools,WeekTools,WeekBoard,types}.tsx` and `../page.tsx` (modify) | Menu entries, day note tile, week strip, loading notes. |
| `src/app/(athlete)/page.tsx`, `AthleteHeader.tsx`, `WeekNoteButton.tsx` (create) | Day card, week button and bottom sheet. |
| `src/lib/import/{schema,prompt,translate,selection}.ts` (modify) | `role` per box, preview shape, role overrides, split payload. |
| `src/app/coach/block-actions.ts`, `planner/ImportDialog.tsx` (modify) | Notes in the import payload, role selector, warning text. |
| `src/lib/training/errors.ts`, `src/i18n/messages/{es,en}.json` (modify) | `note_too_long`, new strings. |

---

### Task 1: Note tables and service

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/training/schemas.ts`
- Create: `prisma/migrations/20261030120000_day_week_notes/migration.sql`, `src/lib/training/services/notes.ts`
- Test: `tests/training/services/notes.test.ts`, `tests/training/schemas.test.ts`

**Interfaces:**
- Produces:
  - Prisma models `DayNote { programId String, dayIndex Int, body String, updatedAt DateTime @updatedAt, @@id([programId, dayIndex]) }` and `WeekNote { programId, weekIndex Int, body, updatedAt, @@id([programId, weekIndex]) }`, both `program Program @relation(..., onDelete: Cascade)`; `Program` gains `dayNotes DayNote[]`, `weekNotes WeekNote[]`.
  - `NOTE_MAX = 2000`; `NoteBody = z.string().trim().max(NOTE_MAX).transform(v => v || null)` (type `string | null`).
  - `setDayNote(db: Db, coachId: string, programId: string, dayIndex: number, body: string | null): Promise<void>`
  - `setWeekNote(db: Db, coachId: string, programId: string, weekIndex: number, body: string | null): Promise<void>`
  - `listWeekNotes(db: Db | DbOrTx, programId: string, weekIndex: number): Promise<{ week: string | null; days: Map<number, string> }>` (days keyed by `dayIndex`)
  - `export function assertDay(program, dayIndex)` moved/exported from `blocks.ts` so notes use the same range check (week check = `assertDay(program, weekIndex * 7)`).

- [ ] **Step 1: Write failing tests** in `notes.test.ts` (setup like `blocks.test.ts`):
  - `"saves, replaces and deletes a day note"`: `setDayNote(.., 3, "Test goal")` then `listWeekNotes(.., 0)` → `days.get(3) === "Test goal"`; set `"Test other"` → replaced; set `null` → `days.has(3) === false`.
  - `"saves a week note"`: `setWeekNote(.., 1, "Test week")` → `listWeekNotes(.., 1).week === "Test week"`, `listWeekNotes(.., 0).week === null`.
  - `"checks owner, archive and range"`: other coach → `not_found`; archived → `program_archived`; closed 2-week program `dayIndex 14` and `weekIndex 2` → `day_out_of_range`; `dayIndex -1` → `day_out_of_range`.
  - `"cascades with the program"`: delete the program → `dayNote.count() === 0`.
  - In `schemas.test.ts`: `NoteBody.parse("  \n ") === null`, `NoteBody.parse(" a\nb ") === "a\nb"`, `NoteBody.safeParse("x".repeat(2001)).success === false`.
- [ ] **Step 2: Run** `pnpm test tests/training/services/notes.test.ts tests/training/schemas.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** the models, migration (hand-written SQL in the style of the previous migrations, two tables with composite primary keys and `ON DELETE CASCADE` foreign keys), `NoteBody`, and the service. `setDayNote` / `setWeekNote`: `writableProgram` + range check; `null` → `deleteMany`, else `upsert`. Run `pnpm prisma generate`.
- [ ] **Step 4: Run** the same tests → PASS; `pnpm exec tsc --noEmit` clean.
- [ ] **Step 5: Commit** `git commit -m "Add day and week note tables and service"`.

### Task 2: Notes in duplicate and publish

**Files:**
- Modify: `src/lib/training/services/blocks.ts`, `src/lib/training/services/programs.ts`, `src/app/coach/programs/[id]/page.tsx` (`empty` prop), `src/i18n/messages/{es,en}.json` (`errors.week_empty` wording)
- Test: `tests/training/services/blocks.test.ts`, `tests/training/services/programs.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, `listWeekNotes`.
- Produces: `weekHasContent(db: DbOrTx, programId: string, weekIndex: number): Promise<boolean>` in `notes.ts` (any block, day note or week note in that week).

- [ ] **Step 1: Write failing tests:**
  - `"duplicating a day copies its note over the destination's"`: notes on day 0 ("Test A") and day 7 ("Test B") → `duplicateDay(0 → 7)` → day 7 note `"Test A"`.
  - `"duplicating a day without a note keeps the destination's"`: only day 7 has a note → stays.
  - `"duplicating a week copies the week note and each day note"`: week 0 note + day 2 note → `duplicateWeek(0 → 3)` → week 3 note and day 23 note equal the sources; a day-24 note that existed stays (source day 3 had none).
  - `programs.test.ts`: `"publishes a week that only has notes"` (week note only → `setWeekPublished(.., true)` resolves); `"publishes a week that only has a day note"`; existing empty-week test still expects `week_empty`.
- [ ] **Step 2: Run** `pnpm test tests/training/services/blocks.test.ts tests/training/services/programs.test.ts` → FAIL.
- [ ] **Step 3: Implement:** in `duplicateDay` / `duplicateWeek` wrap the block copy and note copy in one `db.$transaction`; upsert destination notes only for sources that have one. In `setWeekPublished` replace the block count by `weekHasContent`. In the planner page pass `empty={blocks.length === 0 && notes.week === null && notes.days.size === 0}` (notes loaded in Task 3; until then keep `blocks.length === 0` and add the notes in Task 3). Update `errors.week_empty` to "Añade al menos un bloque o una nota antes de publicar la semana." / "Add at least one block or note before publishing the week."
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Copy notes when duplicating and let weeks with notes be published"`.

### Task 3: Coach planner UI

**Files:**
- Create: `src/app/coach/note-actions.ts`, `src/app/coach/programs/[id]/planner/NoteDialog.tsx`
- Modify: `planner/types.ts`, `planner/DayTools.tsx`, `planner/WeekTools.tsx`, `planner/WeekBoard.tsx`, `src/app/coach/programs/[id]/page.tsx`, `src/i18n/messages/{es,en}.json`
- Test: `tests/ui/note-dialog.test.tsx`, `tests/lib/note-actions.test.ts` (follow an existing action test in `tests/lib/` for mocking `requireCoach`)

**Interfaces:**
- Consumes: `setDayNote`, `setWeekNote`, `listWeekNotes`, `NoteBody`, `NOTE_MAX`.
- Produces:
  - `setDayNoteAction(raw: { programId: string; dayIndex: number; body: string }): Promise<ActionResult>` and `setWeekNoteAction(raw: { programId; weekIndex; body })`, parsing `body` with `NoteBody`, revalidating `"/coach/programs/[id]"` like `coachAction`.
  - `NoteDialog({ title, initial, onSave, onClose }: { title: string; initial: string | null; onSave: (body: string) => Promise<ActionResult>; onClose: () => void })`.
  - `WeekBoard` prop `dayNotes: Record<number, string>`; `WeekTools` prop `weekNote: string | null`.

- [ ] **Step 1: Write failing tests:**
  - `note-dialog.test.tsx`: renders the textarea prefilled with `initial` and `maxLength={2000}`; Save calls `onSave` with the typed text and closes on `{ ok: true }`; on `{ ok: false, code: "invalid_request" }` shows the error and stays open; Save is disabled while saving.
  - `note-actions.test.ts`: `setDayNoteAction({ programId, dayIndex: 0, body: "   " })` deletes the note; body over 2000 chars → `{ ok: false, code: "invalid_request" }`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - Page loads `listWeekNotes(prisma, program.id, weekIndex)` in the existing `Promise.all`, passes `dayNotes` (as a plain object) to `WeekBoard`, `weekNote` to `WeekTools`, and the `empty` rule from Task 2.
  - `DayMenu` gains the item `t("dayNote")` opening `NoteDialog`; `WeekTools`'s `Menu` gains `t("weekNote")`. Both hidden when `ctx.readOnly` (already true for the menus).
  - `DayColumn` renders, when the day has a note, a neutral tile (`data-color="neutral"`, `bg-(--block-fill)`, `whitespace-pre-wrap`, clamped to 4 lines) between the header and the `SortableContext`; it is a `<button>` opening the same dialog, or a plain `<div>` when read-only. It is outside the `SortableContext` and does not change the block count badge.
  - Above `WeekBoard`, when `weekNote` exists, a neutral strip with the text clamped to 2 lines, a button opening the week dialog (plain when read-only).
  - Strings: `planner.dayNote` "Objetivo del día…" / "Day goal…", `planner.weekNote` "Texto de la semana…" / "Week notes…", `planner.noteDialogDay` "Objetivo del día" / "Day goal", `planner.noteDialogWeek` "Texto de la semana" / "Week notes", `planner.noteHint` "Déjalo vacío para quitarlo." / "Leave it empty to remove it.".
- [ ] **Step 4: Run** → PASS; `pnpm lint` clean; check by hand in the browser that a week without notes looks unchanged and that a note shows and edits.
- [ ] **Step 5: Commit** `git commit -m "Write day and week notes from the planner"`.

### Task 4: Athlete view service

**Files:**
- Modify: `src/lib/training/services/athlete-view.ts`
- Test: `tests/training/services/athlete-view.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, `isDayVisible`, `loadAthleteTimeline`.
- Produces:
  - `getAthleteDay(...)` result gains `note: string | null` (null on every non-`ok` status).
  - `getAthleteWeekNote(db: Db, athleteId: string, programId: string, dayIndex: number): Promise<string | null>` — the note of week `Math.floor(dayIndex / 7)` if `isDayVisible(timeline, week * 7)`.
  - `getVisibleDays` also returns dates of visible days that have a day note. A week note alone marks no day.

- [ ] **Step 1: Write failing tests:**
  - `"shows the day note of a published day only"`: continuous program, day note on day 1 of week 0 and week 1; publish week 0 → day 1 `note === "Test goal"`; the unpublished week's day → `status: "unpublished"`, `note === null`.
  - `"returns the week note of the selected day's program week"`: closed program, athlete `startDate` a Wednesday, week notes on weeks 0 and 1 → `getAthleteWeekNote(.., 6) === "Test week 1"` (day 6 is the next Tuesday), `(.., 7) === "Test week 2"`.
  - `"hides the week note of an unpublished week"`.
  - `"marks days that only have a note"`: published week, day 4 has a note and no blocks → `getVisibleDays` includes its date.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: one extra `dayNote.findUnique` in `getAthleteDay`; `getVisibleDays` unions `dayNote.findMany` (same range) with the block groups before the visibility filter.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Read day and week notes in the athlete view"`.

### Task 5: Athlete UI

**Files:**
- Create: `src/app/(athlete)/WeekNoteButton.tsx`
- Modify: `src/app/(athlete)/page.tsx`, `src/app/(athlete)/AthleteHeader.tsx`, `src/i18n/messages/{es,en}.json`
- Test: `tests/ui/week-note-button.test.tsx`

**Interfaces:**
- Consumes: `getAthleteDay(...).note`, `getAthleteWeekNote`.
- Produces: `AthleteHeader` optional prop `start?: React.ReactNode` rendered at the top left (inside the left padding that keeps the title centred, mirroring the icons' `absolute right-3` container with `left-3`); `WeekNoteButton({ note, title }: { note: string; title: string })`.

- [ ] **Step 1: Write failing test:** `WeekNoteButton` renders a button named "Week"; clicking it shows a dialog with the note text (line breaks kept) and a close button that hides it.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - `WeekNoteButton`: client component, a pill button (`Info` icon + `t("today.week")`) styled like the header icons; opens a bottom sheet (a `Modal` placed at the bottom on small screens, or a new sheet variant — builder's call per spec) showing `<AnnouncementText body={note} />`.
  - `page.tsx`: when `day.status === "ok"` and `day.dayIndex !== null`, load `getAthleteWeekNote`; pass `start={weekNote && <WeekNoteButton … />}` to `AthleteHeader`. Render the day card (`data-color="neutral"`, `bg-(--block-fill)`, small uppercase label `t("today.dayGoal")`, `AnnouncementText`) after the date row and before the blocks. Show the "nothing" empty state only when there are no blocks **and** no note.
  - The Calendar page passes no `start`.
  - Strings: `today.week` "Semana" / "Week", `today.dayGoal` "Objetivo del día" / "Day goal", `today.weekNotesTitle` "Semana {week}" / "Week {week}".
- [ ] **Step 4: Run** → PASS; check by hand at 375 px width that the title stays centred with and without the button.
- [ ] **Step 5: Commit** `git commit -m "Show day goals and week notes to athletes"`.

### Task 6: Import roles from the model

**Files:**
- Modify: `src/lib/import/schema.ts`, `src/lib/import/prompt.ts`, `src/lib/import/translate.ts`
- Test: `tests/import/translate.test.ts`

**Interfaces:**
- Produces:
  - `ImportRole = z.enum(["block", "day_note", "week_note"])`; optional `role` on `ModelBlock` and on each `TidyResponse` block.
  - `PreviewItem = { role: ImportRole; block: BlockInputValue }`; `PreviewWeek.days[].blocks` becomes `items: PreviewItem[]`.
  - `noteText(block: BlockInputValue): string` — `[block.title, block.kind === "custom" ? block.description : block.instructions].filter(Boolean).join("\n")`, used when an item is written as a note.

- [ ] **Step 1: Write failing tests** (FakeProvider keyed by `schemaName`, as the existing tests):
  - whole-PDF path: a model block with `role: "week_note"` → preview item `role === "week_note"`; a block without `role` → `"block"`.
  - calendar path: tidy response `{ id: 2, role: "day_note", ... }` → item 2 has `role: "day_note"`; a heading-only box keeps its heading as the description and the model's role.
  - `noteText` joins title and description with `"\n"` and returns the description alone when there is no title.
- [ ] **Step 2: Run** `pnpm test tests/import/translate.test.ts` → FAIL.
- [ ] **Step 3: Implement**: add `role` to both schemas; prompts: replace "day or week notes and anything else neutral" with "anything else neutral" in `COLOR_RULE`, and add one line to both prompts: `"role": "day_note" for a box that summarises the day or states its goal, "week_note" for the week's objectives or principles; omit it for workouts.` Map items in `tidyCalendar` and `readWholePdf`; update `ImportDialog`'s reads of `blocks` to `items` (rendering only; selection changes come in Task 7).
- [ ] **Step 4: Run** `pnpm test tests/import` → PASS (update existing assertions for the `items` shape).
- [ ] **Step 5: Commit** `git commit -m "Classify imported boxes as blocks, day goals or week notes"`.

### Task 7: Import notes: selection, write and window

**Files:**
- Modify: `src/lib/import/selection.ts`, `src/lib/training/services/blocks.ts`, `src/app/coach/block-actions.ts`, `planner/ImportDialog.tsx`, `src/lib/training/errors.ts`, `src/i18n/messages/{es,en}.json`
- Test: `tests/import/selection.test.ts`, `tests/training/services/blocks.test.ts`, `tests/ui/import-dialog.test.tsx`

**Interfaces:**
- Consumes: `PreviewItem`, `ImportRole`, `noteText`, `listWeekNotes`, `NOTE_MAX`.
- Produces:
  - `ImportNote = { scope: "day" | "week"; index: number; text: string }` (`index` = `dayIndex` or `weekIndex`).
  - `selectedImport(sel: Set<BlockKey>, roles: Map<BlockKey, ImportRole>, preview, ctx): { items: ImportItem[]; notes: ImportNote[] }` replaces `selectedItems`; a key's role is `roles.get(key) ?? item.role`.
  - `importBlocks(db, coachId, programId, { items, notes }: { items: ImportItem[]; notes: ImportNote[] }, mode)`; returns `items.length + notes.length`.
  - Error code `"note_too_long"` with `issues: ["day:<dayIndex>"]` or `["week:<weekIndex>"]`.

- [ ] **Step 1: Write failing tests:**
  - selection: a selected `day_note` item at PDF week 0, day 2 with ctx `weekIndex: 3` → `notes: [{ scope: "day", index: 23, text }]`, not in `items`; overriding its role to `"block"` in `roles` moves it to `items`; a `week_note` → `{ scope: "week", index: 3 }`; deselected notes are left out.
  - service: `"appends imported notes after existing ones"` (existing "Test old", import "Test new" → `"Test old\n\nTest new"`); `"joins several imported notes for one day in order"`; `"replace deletes the replaced weeks' notes"` (week 0 has blocks, a week note and a day-3 note; import one block + one day-1 note into week 0 with `"replace"` → old notes gone, only the imported day-1 note); `"a week that receives only notes keeps its blocks in replace mode"` (Review Focus 4); `"refuses joined notes over 2000 chars and writes nothing"` → `note_too_long`, `issues: ["day:2"]`, block count unchanged (Review Focus 3); range check on note indexes → `day_out_of_range`.
  - dialog: a tile with `role: "day_note"` shows the role selector set to "Objetivo del día"; changing it to "Bloque" and confirming sends that item in `items`; a payload with only notes enables "Importar selección"; the replace warning mentions notes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - `importBlocks`: inside the existing transaction, `replace` keeps deriving weeks from `items` only and also `deleteMany`s `weekNote` for those weeks and `dayNote` in their day ranges; then for each target day/week group the imported texts, read the existing note (after any deletion), join with `"\n\n"`, refuse with `note_too_long` if over `NOTE_MAX`, upsert. Assert ranges with `assertDay` (week: `index * 7`).
  - `importBlocksAction`: payload `{ programId, items: z.array(...).max(200), notes: z.array(z.object({ scope: z.enum(["day","week"]), index: Day, text: z.string().trim().min(1).max(NOTE_MAX) })).max(200).default([]), mode }`, with `items.length + notes.length >= 1`.
  - `ImportDialog`: keep a `roles` state (`Map<BlockKey, ImportRole>`, empty on each new preview); each tile gets a compact select with `import.roleBlock` "Bloque" / "Block", `import.roleDayNote` "Objetivo del día" / "Day goal", `import.roleWeekNote` "Texto de la semana" / "Week notes"; note tiles render neutral regardless of `block.color`; the footer count and the clash check use `selectedImport` (clash weeks still from `items` only). `note_too_long` renders `errors.note_too_long` with the day/week label built by the dialog's existing `dayLabel`/`weekLabel` from `issues[0]`.
  - Strings: `errors.note_too_long` "El texto de {target} superaría los 2000 caracteres." / "The text for {target} would exceed 2000 characters."; extend `import.replaceWarning` to mention day goals and week notes in both locales.
- [ ] **Step 4: Run** `pnpm test` (full suite), `pnpm lint`, `pnpm exec tsc --noEmit` → all clean.
- [ ] **Step 5: Commit** `git commit -m "Import day goals and week notes from the PDF"`.

### Task 8: Browser verification

- [ ] Start the dev server (`pnpm dev`, local `.env` on the dev branch) and, as a coach: write a day goal and a week note, duplicate the day and the week, publish a week that only has a note.
- [ ] As an enrolled athlete at 375 px: the day card sits above the blocks, the "Semana" button opens the sheet, an unpublished week shows neither.
- [ ] Import a PDF with a summary box: the tile arrives as a day goal or week note, change one role, import, check the planner. (The owner provides the sample PDFs; never commit them.)
- [ ] Record anything that does not match the spec as a follow-up; do not commit screenshots.
