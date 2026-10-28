# Week Import from PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach uploads a PDF from the planner, reviews the blocks the LLM translated (up to 4 weeks, all selected by default) and imports the selection into consecutive weeks.

**Architecture:** The LLM provider learns to send file attachments. A new `src/lib/import/` module prompts Gemini with the PDF and turns its answer into validated `BlockInput` values (a preview; nothing is written). A coach-only route handler runs that translation; a server action creates the selected blocks in one statement. A client modal in the planner holds the preview between the two steps.

**Tech Stack:** Next.js 16 (route handlers, server actions), TypeScript, Zod 4, Prisma 7, `@google/genai`, next-intl, Vitest (PGlite for services).

**Spec:** `docs/specs/training-tailor-week-import-design.md`

## Global Constraints

- PDF only; `application/pdf` and the file starts with `%PDF-`. Max upload `4 * 1024 * 1024` bytes, checked on the client and the server.
- At most **4** weeks imported; `weeksFound` reports the real count.
- Button label **"Importar"** (en: "Import"), tooltip **"Importar semana desde PDF"** (en: "Import week from PDF"). Confirm button **"Importar selección"** (en: "Import selection").
- All translated blocks start selected. Nothing is written before the confirm; the confirm writes all selected blocks or none.
- Imported blocks are appended after existing ones on each day; nothing existing changes; publish state is untouched.
- Text keeps the document's language; the model may tidy formatting and obvious typos, never movements, reps, loads, %, times, levels or notes.
- Informative data notice in the upload step (no checkbox): the PDF is processed with Google Gemini and Google may use its content.
- Quota: new `UsageKind` `"import"`, own count, limit `dailyLimit()`; spent before the model call.
- Impersonation sessions cannot translate (403 `forbidden`).
- Every new string in both `es.json` and `en.json`; every new error code in `ERROR_CODES` with an `errors.<code>` message.
- Tests use invented fixtures (`Test …` names), never library content or the sample PDFs. The sample PDFs are never committed.

## Review Focus

1. **A PDF where the model finds no blocks** (a cover page, a nutrition plan) → the window shows `import_empty`, nothing is offered. Test in Task 2.
2. **A barbell block whose movement is not in the catalog or whose sets have both/neither % and kg** → it arrives as `custom` with its source text, not lost. Test in Task 2.
3. **Selected blocks that land past a closed program's last week** (opened on week 3 of 4, PDF has 3 weeks) → those weeks are disabled in the window and the server refuses them if sent anyway. Tests in Tasks 3 and 5.
4. **A barbell movement removed from the library between translate and import** → the whole import fails with `invalid_request`, nothing is created. Test in Task 3.
5. **Double-click on "Importar selección"** → one import, not two. The button is disabled while the action runs (Task 5).

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/ai/provider.ts` (modify) | `FileAttachment` type; optional `attachments` on `GenerateStructuredArgs`. |
| `src/lib/ai/gemini-provider.ts` (modify) | Sends attachments as `inlineData` parts. |
| `src/lib/import/schema.ts` (create) | Model-facing response schema and the `ImportPreview` type. |
| `src/lib/import/prompt.ts` (create) | System prompt and user prompt. |
| `src/lib/import/translate.ts` (create) | Calls the provider, post-processes into an `ImportPreview`. |
| `src/lib/import/selection.ts` (create) | Pure client helpers: initial selection, toggles, targets, the action payload. |
| `src/lib/training/services/blocks.ts` (modify) | `importBlocks` service. |
| `src/app/coach/block-actions.ts` (modify) | `importBlocksAction`. |
| `src/app/api/coach/import/route.ts` (create) | Translate endpoint. |
| `src/lib/quota.ts`, `src/lib/training/errors.ts` (modify) | `"import"` kind; new error codes. |
| `src/app/coach/programs/[id]/planner/ImportDialog.tsx` (create) | The modal. |
| `src/app/coach/programs/[id]/planner/WeekTools.tsx` (modify) | "Importar" button. |
| `src/app/coach/programs/[id]/page.tsx` (modify) | Passes week labels data to `WeekTools` if needed. |
| `src/i18n/messages/{es,en}.json` (modify) | `import.*` strings and error messages. |

---

### Task 1: Provider attachments

**Files:**
- Modify: `src/lib/ai/provider.ts`, `src/lib/ai/gemini-provider.ts`
- Test: `tests/ai/retry.test.ts`, `tests/ai/gemini-provider.test.ts`

**Interfaces:**
- Produces: `export interface FileAttachment { mimeType: string; data: Uint8Array }`; `GenerateStructuredArgs<T>.attachments?: FileAttachment[]`; `export function geminiContents(args: GenerateStructuredArgs<unknown>)` in `gemini-provider.ts` returning the `contents` array for `generateContent`.

- [ ] **Step 1: Write the failing tests**

In `tests/ai/retry.test.ts`:
```ts
it("keeps attachments on the retry", async () => {
  const fake = new FakeProvider({ Demo: sequence({ ok: "nope" }, { ok: true }) });
  const attachments = [{ mimeType: "application/pdf", data: new Uint8Array([1, 2]) }];
  await withValidationRetry(fake).generateStructured({ prompt: "p", schema, schemaName: "Demo", attachments });
  expect(fake.calls[1].attachments).toBe(attachments);
});
```
In `tests/ai/gemini-provider.test.ts` (outside the skipped integration block):
```ts
describe("geminiContents", () => {
  it("puts attachments as base64 inline data before the text", () => {
    const c = geminiContents({ prompt: "p", schema: z.object({}), schemaName: "X",
      attachments: [{ mimeType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }] });
    expect(c).toEqual([{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: "JVBERg==" } }, { text: "p" }] }]);
  });
  it("sends only the text without attachments", () => {
    expect(geminiContents({ prompt: "p", schema: z.object({}), schemaName: "X" }))
      .toEqual([{ role: "user", parts: [{ text: "p" }] }]);
  });
});
```

- [ ] **Step 2: Run** `pnpm test tests/ai` — expect FAIL (`attachments` unknown / `geminiContents` not exported).
- [ ] **Step 3: Implement** the type, `geminiContents` (base64 via `Buffer.from(data).toString("base64")`), and use it in `generateStructured`. `withValidationRetry` already spreads `args`; change nothing there unless the test says otherwise.
- [ ] **Step 4: Run** `pnpm test tests/ai` — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Let the LLM provider send file attachments"`

---

### Task 2: Translation into a preview

**Files:**
- Create: `src/lib/import/schema.ts`, `src/lib/import/prompt.ts`, `src/lib/import/translate.ts`
- Test: `tests/import/translate.test.ts`

**Interfaces:**
- Consumes: `FileAttachment` (Task 1); `BlockInput`, `BlockInputValue`, `Scoring`, `BLOCK_COLORS` from `@/lib/training/schemas`.
- Produces:
  - `export const MAX_IMPORT_WEEKS = 4`
  - `export const ImportModelResponse` (Zod) named `"WeekImport"` for the provider:
    `{ weeksFound: int ≥ 0, daysNamed: boolean, weeks: { label: string ≤ 80, days: { day: int 1–7, blocks: ModelBlock[] }[] }[] }`,
    `ModelBlock = { kind: "custom" | "barbell", title: string|null, color: BlockColor, coachingTips: string|null, description: string|null, scoring: Scoring|null, timeCapSeconds: int|null, movement: string|null, sets: { reps: int, percent: number|null, kg: number|null }[]|null, instructions: string|null, sourceText: string }`.
    Flat object (no unions): Gemini's JSON schema support is simpler that way.
  - `export type PreviewWeek = { label: string; days: { day: number /* 0 = Monday … 6 = Sunday */; blocks: BlockInputValue[] }[] }`
  - `export type ImportPreview = { weeksFound: number; daysNamed: boolean; dropped: number; weeks: PreviewWeek[] }`
  - `export async function translatePdf(provider: LlmProvider, pdf: Uint8Array, liftNames: string[]): Promise<ImportPreview>`
  - `export class ImportEmptyError extends Error` — thrown when no block survives.

- [ ] **Step 1: Write the failing tests** (FakeProvider scripted on `"WeekImport"`; lift catalog `["Test Back Squat"]`):
  - `"maps model days 1–7 to 0–6 and keeps document order"`.
  - `"keeps the first 4 weeks and reports weeksFound"` — script 6 weeks; expect `weeks.length === 4`, `weeksFound === 6`.
  - `"keeps a valid barbell block"` — `Test Back Squat`, sets `[{reps:8, percent:68, kg:null}]` → `kind: "barbell"`.
  - `"turns a barbell block with an unknown movement into custom with its source text"` — movement `"Test Clean Complex"`, `sourceText: "4 x 2 clean pull…"` → `{ kind: "custom", description: "4 x 2 clean pull…", scoring: "none", timeCapSeconds: null }`, title and coachingTips kept.
  - `"turns a barbell block with invalid sets into custom"` — a set with both percent and kg.
  - `"drops blocks that cannot be made valid and counts them"` — custom with empty description and empty sourceText → `dropped === 1`.
  - `"clears a time cap on a non for_time block"` — custom `amrap` with `timeCapSeconds: 600` → `timeCapSeconds: null` (not dropped).
  - `"passes daysNamed through"`.
  - `"throws ImportEmptyError when no block survives"`.
  - `"sends the PDF as an attachment and the lift names in the prompt"` — `fake.calls[0].attachments[0].mimeType === "application/pdf"`, system prompt contains `"Test Back Squat"`.
- [ ] **Step 2: Run** `pnpm test tests/import/translate.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** `prompt.ts` exports `importSystemPrompt(liftNames: string[]): string` and `IMPORT_USER_PROMPT`. The system prompt must state, in English: read every week in the PDF in order, and if there are more than 4 return only the first 4 but set `weeksFound` to the total; `day` 1 = Monday when weekdays are named, otherwise the n-th training day, with `daysNamed` saying which; one block per section the document separates (warm-up, strength, conditioning, accessory, week objectives…); keep the document's language; tidy line breaks, lists and obvious typos but never change movements, reps, loads, percentages, times, levels (Rx+/Rx/Int/Esc) or notes; coaching tips / objectives / coach notes go to `coachingTips`; `barbell` only for a single lift from the given list whose sets are reps plus percent or kg; `scoring` only when obvious, else `"none"`; `timeCapSeconds` only for `for_time`; map document colours to the nearest of `BLOCK_COLORS`, else `"neutral"`; `sourceText` is the block's full text as written. `translate.ts` converts each `ModelBlock` with `BlockInput.safeParse` (adding `videoUrl: null`), falling back to custom from `sourceText`, then drops what still fails; empty days and weeks are removed.
- [ ] **Step 4: Run** `pnpm test tests/import` — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Translate a PDF into a week import preview"`

---

### Task 3: Import service and action

**Files:**
- Modify: `src/lib/training/services/blocks.ts`, `src/app/coach/block-actions.ts`
- Test: `tests/training/services/blocks.test.ts`

**Interfaces:**
- Produces:
  - `export type ImportItem = { dayIndex: number; block: BlockInputValue }`
  - `export async function importBlocks(db: Db, coachId: string, programId: string, items: ImportItem[]): Promise<number>` — returns the count created.
  - `export async function importBlocksAction(raw: unknown): Promise<ActionResult>` — `raw` is `{ programId, items: { dayIndex, block: BlockInput }[] }`, items `min(1).max(200)`.

- [ ] **Step 1: Write the failing tests** (reuse the file's `custom`, `barbell`, `titles`, `setup`):
  - `"imports blocks after the existing ones, in order, across days"` — existing `"A"` on day 2; import `[{2,"B"},{2,"C"},{9,"D"}]` → `titles(day 2) = ["0:A","1:B","2:C"]`, `titles(day 9) = ["0:D"]`, returns 3.
  - `"creates nothing when any item is invalid"` — one item on day 14 of a 2-week closed program → rejects `day_out_of_range`, block count unchanged.
  - `"creates nothing when a barbell movement is not a lift"` — `barbell("Test Air Squat")` among valid items → rejects `invalid_request`, count unchanged.
  - `"refuses another coach's program and archived programs"` → `not_found`, `program_archived`.
- [ ] **Step 2: Run** `pnpm test tests/training/services/blocks.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `importBlocks`: `writableProgram`, `assertDay` on every item, `assertLiftMovement` once per distinct barbell movement, then positions with a per-day counter starting at `nextPosition` (as `appendCopies` does) and a single `db.block.createMany` (one statement: all or nothing). Refactor `appendCopies` to share the position logic if it stays readable. `importBlocksAction` follows `createBlockAction` through `coachAction`.
- [ ] **Step 4: Run** the file — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Import a selection of blocks in one write"`

---

### Task 4: Translate endpoint

**Files:**
- Create: `src/app/api/coach/import/route.ts`
- Modify: `src/lib/quota.ts` (`UsageKind` adds `"import"`), `src/lib/training/errors.ts`, `src/i18n/messages/{es,en}.json` (`errors.*` for new codes)
- Test: `tests/lib/import-route.test.ts`

**Interfaces:**
- Consumes: `translatePdf`, `ImportEmptyError`, `MAX_IMPORT_WEEKS` (Task 2); `getProvider`; `consumeQuota`, `dailyLimit`, `prismaQuotaStore`; `getSessionContext`; `getCoachByUserId`; `getOwnedProgram`, `assertWritable`; `getDomainData` + `liftCatalog`.
- Produces: `POST /api/coach/import`, `multipart/form-data` with `programId` and `pdf`. `200` → `ImportPreview` JSON. Errors as `{ error: code }`:
  | Condition | Status | Code |
  |---|---|---|
  | no session | 401 | `unauthorized` |
  | impersonation | 403 | `forbidden` |
  | not a coach / not approved | 403 | `unauthorized` / `coach_pending` |
  | program not owned | 404 | `not_found` |
  | archived | 409 | `program_archived` |
  | missing/non-PDF file, bad form | 400 | `import_pdf_invalid` |
  | file > 4 MB | 413 | `import_pdf_too_large` |
  | no provider | 503 | `import_unavailable` |
  | quota exhausted | 429 | `import_quota` |
  | no block found | 422 | `import_empty` |
  | model error | 502 | `import_failed` |
  New `ERROR_CODES`: `import_pdf_invalid`, `import_pdf_too_large`, `import_unavailable`, `import_quota`, `import_empty`, `import_failed`. `forbidden` already exists as an HTTP code only; the dialog maps it to `unauthorized`'s message.
  `export const maxDuration = 120`.

- [ ] **Step 1: Write the failing tests** with `vi.mock` of `@/lib/session`, `@/lib/db`, `@/lib/ai`, `@/lib/quota-store`, `@/lib/domain/repository` (pattern: `tests/lib/engine-access.test.ts`); FakeProvider behind `getProvider`. One test per row of the table, plus:
  - `"checks size and type before spending quota"` — 413 and 400 cases leave the quota store's `record` uncalled.
  - `"spends quota before calling the model"` — model error → 502 and `record` called once.
  - `"returns the preview"` — 200 with `weeks` from the scripted response.
- [ ] **Step 2: Run** `pnpm test tests/lib/import-route.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** in the order of the table (cheap checks first, quota just before the model). Check the size from `file.size` before reading bytes; verify the `%PDF-` prefix on the bytes. Never return exception text; `console.error` the model error.
- [ ] **Step 4: Run** the file and `pnpm test tests/i18n` — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the PDF translate endpoint for coaches"`

---

### Task 5: Import window

**Files:**
- Create: `src/lib/import/selection.ts`, `src/app/coach/programs/[id]/planner/ImportDialog.tsx`
- Modify: `WeekTools.tsx`, `src/app/coach/programs/[id]/page.tsx` (only if `WeekTools` needs more context), `src/i18n/messages/{es,en}.json`
- Test: `tests/import/selection.test.ts`, `tests/ui/import-dialog.test.tsx`

**Interfaces:**
- Consumes: `ImportPreview` (Task 2), `importBlocksAction` (Task 3), `POST /api/coach/import` (Task 4), `PlannerContext` (`weekIndex`, `maxWeek`, `startDate`).
- Produces (`selection.ts`):
  - `type BlockKey = string` (`"w:d:i"`)
  - `allKeys(preview: ImportPreview): Set<BlockKey>`
  - `targetWeek(ctx: { weekIndex: number }, w: number): number` → `ctx.weekIndex + w`
  - `isWeekImportable(ctx: { weekIndex: number; maxWeek: number | null }, w: number): boolean`
  - `toggleBlock(sel, key)`, `toggleWeek(sel, preview, w)` (all on if any is off, else all off)
  - `selectedItems(sel, preview, ctx): ImportItem[]` — only importable weeks, `dayIndex = targetWeek * 7 + day`, document order.

- [ ] **Step 1: Write the failing tests** (`selection.test.ts`): all keys selected initially; `toggleWeek` both directions; `isWeekImportable` false past `maxWeek`, always true when `maxWeek` is null; `selectedItems` maps PDF week 2 day 0 opened on week 3 to `dayIndex 35`, skips deselected and non-importable weeks.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement** `selection.ts`. **Step 4: Run** — expect PASS.
- [ ] **Step 5: Write the failing UI test** (`import-dialog.test.tsx`, Testing Library, `fetch` and the action mocked): after a scripted 2-week preview, the footer shows the total selected count, "Importar selección" is enabled; unchecking every block disables it; clicking it calls `importBlocksAction` once with `selectedItems(...)` and the button is disabled while pending; a `weeksFound: 6` preview shows the "first 4 weeks" warning; `daysNamed: false` shows the "placed from Monday" notice; `dropped: 2` shows "2 bloques no se pudieron leer"; an `import_empty` response shows `errors.import_empty`.
- [ ] **Step 6: Implement** `ImportDialog` on `Modal` (`size="lg"`): states `pick → translating → review → importing`. Pick: file input `accept="application/pdf"`, client-side 4 MB check, the Gemini data notice. Review: header with ‹ › and "Semana {n} de {total}", the PDF week label → target label (continuous: date range via `formatDayRange` from `ctx.startDate`; closed: `planner.week`), week checkbox, a notice if the target week is published, a disabled notice if not importable, then 7 day columns of tiles (checkbox, title or movement, one-line summary, kind pill), unchecked tiles faded. Footer: count + "Importar selección". On success close and `router.refresh()`. `WeekTools` adds `<Button title={t("import.tooltip")}>{t("import.button")}</Button>` before the menu when not read-only. The published flag for target weeks other than the open one: pass the program's published week indexes to `WeekTools` from `page.tsx` (continuous: its `ProgramWeek` rows; closed: every week when `publishedAt` is set).
- [ ] **Step 7: Run** `pnpm test tests/import tests/ui tests/i18n` and `pnpm lint` — expect PASS.
- [ ] **Step 8: Commit** `git commit -m "Add the week import window to the planner"`

---

### Task 6: End-to-end check with real PDFs

- [ ] **Step 1:** `pnpm test` and `pnpm build` — all pass.
- [ ] **Step 2:** With `GEMINI_API_KEY` set and the dev server running, sign in as an approved coach, open a continuous program, import the owner's two sample PDFs (provided by the owner, kept outside the repo). Check: the Strivee week gives one week with Monday–Sunday blocks, coaching tips separated, Bench Press / Back Squat / Deadlift as barbell where their sets fit; the "Ciclo 1" PDF gives 4 weeks; deselecting and importing creates exactly the selected blocks; loads and percentages match the PDF.
- [ ] **Step 3:** Report any prompt changes made during the check in the PR description.
