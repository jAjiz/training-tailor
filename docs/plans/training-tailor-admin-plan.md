# Admin Panel (Closed Beta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `/admin` panel where the owner approves, rejects, disables, enables and deletes coaches and athletes, enters their accounts with an audited impersonation, controls program invitations, and where athlete sign-up is invitation-only.

**Architecture:** Better Auth's `admin` plugin provides the `role` and impersonation; everything else is our own service layer (`src/lib/training/services/admin.ts`, `audit.ts`) under Server Actions, as in the rest of the app. `runAction` becomes the single place that audits mutations made during an impersonation. Profiles (coach, athlete) are managed one at a time; the `User` row goes only when its last profile goes.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 + Postgres (Neon), Better Auth 1.7 (`admin` plugin), next-intl, Zod 4, Vitest + PGlite.

**Spec:** `docs/specs/training-tailor-admin-design.md` (read it first; it is the source of every rule below).

## Global Constraints

- Every non-admin request to `/admin/*` answers **404**, never 403 (pages `notFound()`, actions `not_found`).
- An impersonation session is never admin. Impersonation sessions last **3600 s**; impersonating an admin is refused (plugin default).
- The plugin's ban fields (`banned`, `banReason`, `banExpires`) and its `banUser` / `removeUser` / `setRole` endpoints are **not used** by any of our code.
- Actions return `{ ok: false, code }`, never exception text; every new code is in `ERROR_CODES` and translated in `es.json` and `en.json` (enforced by `tests/i18n/messages.test.ts`).
- New error codes: `account_disabled`, `invite_required`, `invalid_status_change`, `invite_disabled`.
- UI uses `src/components/ui` and theme tokens (both themes); all copy in es and en, Spanish default.
- `AdminAuditLog` rows are never updated or deleted; `details` never holds workout text or scores.
- `ATHLETE_SIGNUP` is `invite_only` (default when unset) or `open`.
- Do not bump `@swc/core` (pinned to 1.16.2). Tests run on PGlite; the browser check runs against Neon `dev` (corporate VPN off).

## Review Focus

- A coach who is also an athlete is deleted or disabled: the athlete profile, its sessions and its results elsewhere must be untouched (Task 4 test `keeps the user and athlete data when a coach who is also an athlete is deleted`).
- The admin opens `/admin` (or calls an admin action) while impersonating: must be 404 / `not_found`, not the panel (Task 3 test `an impersonation session is never admin`).
- Deleting a coach whose unpublished closed program has an enrolled athlete with results in another coach's program: only the unpublished program's results go (Task 4 test `deletes unpublished content with its results and nothing else`).
- Deleting an already-deleted profile or a stale id (double click, two tabs): `not_found`, no partial writes (Task 4 and Task 5 tests `refuses a missing profile`).
- Invite-only onboarding with a crafted `next` (`/join/x/../y`, `//evil`, `/join/<archived code>`): refused with `invite_required` (Task 7 test `accepts only an exact /join/<valid code>`).

---

### Task 1: Schema, admin plugin and `admin:grant`

**Files:**
- Create: `prisma/migrations/20261019120000_admin/migration.sql` (via `pnpm prisma migrate dev --create-only --name admin`, then edit the backfill)
- Modify: `prisma/schema.prisma`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `package.json` (script), `tests/helpers/factories.ts`
- Create: `scripts/grant-admin.ts`, `src/lib/training/services/admin.ts` (only `grantAdmin` in this task)
- Test: `tests/training/services/schema.test.ts`, `tests/training/services/admin.test.ts`

**Interfaces:**
- Produces:
  - Prisma: `User.role String?`, `User.banned Boolean? @default(false)`, `User.banReason String?`, `User.banExpires DateTime?`, `Session.impersonatedBy String?`; `AthleteAccount.disabledAt DateTime?`; `Program.coachId String?` with `onDelete: SetNull`, `Program.coachName String`, `Program.inviteDisabledAt DateTime?`; model `AdminAuditLog` exactly as in the spec's Data model.
  - `CoachAccount.status` comment lists `"pending" | "approved" | "rejected" | "suspended"`.
  - `grantAdmin(db: Db, email: string): Promise<"granted" | "not_found">`
  - Factories: `makeCoach(db, status: "pending" | "approved" | "rejected" | "suspended" = "approved")`; `makeContinuous` / `makeClosed` set `coachName: "Coach"`; new `makeAdmin(db): Promise<User>` (role `"admin"`); new `makeResult(db, blockId, athleteId, performedOn = "2026-10-05")` (custom block, `division: "rx"`, `score: { seconds: 300 }`, `sortKey: -300`).

- [ ] **Step 1: Write the failing tests**

In `schema.test.ts`: `it("sets a program's coach to null when the coach is deleted")` — create coach + continuous program, `db.coachAccount.delete`, then `expect((await db.program.findUniqueOrThrow({ where: { id } })).coachId).toBeNull()`.

In `admin.test.ts`: `it("grants the admin role by email")` — `makeUser`, `grantAdmin(db, user.email)` → `"granted"`, `role === "admin"`; `grantAdmin(db, "nobody@test.local")` → `"not_found"`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/training/services/schema.test.ts tests/training/services/admin.test.ts`
Expected: FAIL (coachId not nullable / `grantAdmin` not exported)

- [ ] **Step 3: Schema and migration**

Edit the schema, create the migration with `--create-only`, and make the SQL add `coachName` in three steps: add nullable, `UPDATE "Program" p SET "coachName" = c."displayName" FROM "CoachAccount" c WHERE c.id = p."coachId"`, then `SET NOT NULL`. Change the `coachId` foreign key to `ON DELETE SET NULL`. Run `pnpm prisma generate`.

- [ ] **Step 4: Wire the plugin**

`src/lib/auth.ts`: `plugins: [admin({ impersonationSessionDuration: 3600 }), nextCookies()]` (`admin` from `better-auth/plugins`). `src/lib/auth-client.ts`: add `adminClient()` from `better-auth/client/plugins`. Set `coachName` in `createProgram` (`src/lib/training/services/programs.ts`) from the coach's `displayName` (it takes the coach row, or reads it by id). Coaches cannot rename themselves today, so nothing else keeps it in sync.

- [ ] **Step 5: `grantAdmin` and the script**

`grantAdmin` sets `role = "admin"` on the user with that email. `scripts/grant-admin.ts` mirrors `scripts/approve-coach.ts` (usage `pnpm admin:grant <email>`, exit 2 on `not_found`). Add `"admin:grant": "tsx scripts/grant-admin.ts"`.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test` — Expected: PASS. Run `pnpm exec tsc --noEmit` — fix every `program.coach` now possibly null (the join page and anything reading `program.coach.displayName` switches to `program.coachName`).

- [ ] **Step 7: Commit**

```bash
git add prisma src scripts tests package.json
git commit -m "feat: admin plugin, schema for the admin panel and admin:grant"
```

---

### Task 2: Audit log and impersonation-aware `runAction`

**Files:**
- Create: `src/lib/training/services/audit.ts`
- Modify: `src/lib/actions.ts`, `src/lib/session.ts`, every file calling `runAction` (7 files, 17 calls)
- Test: `tests/training/services/audit.test.ts`, `tests/lib/actions.test.ts`

**Interfaces:**
- Consumes: `AdminAuditLog` (Task 1).
- Produces:
  - `type AuditEntry = { actorUserId: string | null; action: string; targetUserId?: string | null; targetType?: "coach" | "athlete" | "program" | "user"; targetId?: string | null; targetLabel?: string | null; impersonating?: boolean; details?: Record<string, string | number | boolean> }`
  - `writeAudit(db: Db, entry: AuditEntry): Promise<void>`
  - `listAudit(db: Db, filter: { targetUserId?: string; action?: string; page: number }): Promise<{ rows: AdminAuditLog[]; hasMore: boolean }>` — newest first, 50 per page.
  - `export type SessionUser = { id: string; name: string; email: string; image: string | null }` and `getSessionContext(): Promise<{ user: SessionUser; role: string | null; impersonatedBy: string | null } | null>` in `session.ts` (`getSessionUser` keeps its signature and delegates).
  - `runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>>`

- [ ] **Step 1: Write the failing tests**

`audit.test.ts`: `it("lists newest first and pages by 50")` (51 rows → page 0 has 50 and `hasMore`), `it("filters by target user and action")`.

`actions.test.ts` (mock `@/lib/session` and `@/lib/db` with `vi.mock`; the db mock exposes `adminAuditLog.create` as a spy):
- `it("writes an audit row after a successful action during an impersonation")` — context `{ user: { id: "u1", … }, impersonatedBy: "admin1" }` → `create` called with `{ actorUserId: "admin1", action: "saveResultAction", targetUserId: "u1", impersonating: true }`.
- `it("writes nothing for a refused or failed action")` — fn throws `TrainingError("not_found")` → no `create`.
- `it("writes nothing outside an impersonation")`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/training/services/audit.test.ts tests/lib/actions.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement `audit.ts`, `getSessionContext`, and the new `runAction`**

`runAction` reads the context only after `fn` succeeds, so actions without a session (onboarding before sign-in) are unaffected. An audit write failure is logged and does not fail the action.

- [ ] **Step 4: Pass names at every call site**

The name is the exported action's function name (`runAction("saveResultAction", async () => …)`). Where a file has an internal helper (`coachAction`, `setRemoved`), the helper takes the name from its exported callers.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: audit log, and runAction audits mutations made while impersonating"
```

---

### Task 3: Access checks and status pages

**Files:**
- Modify: `src/lib/accounts.ts`, `src/lib/training/errors.ts`, `src/lib/routes.ts`, `src/app/coach/pending/page.tsx`, `src/i18n/messages/es.json`, `src/i18n/messages/en.json`
- Create: `src/lib/admin-access.ts`, `src/app/(athlete)/disabled/page.tsx`
- Test: `tests/lib/admin-access.test.ts`, `tests/lib/routes.test.ts`

**Interfaces:**
- Consumes: `getSessionContext` (Task 2).
- Produces:
  - `isAdminSession(ctx: { role: string | null; impersonatedBy: string | null } | null): boolean` (pure, in `admin-access.ts`): true only for `role === "admin"` and `impersonatedBy === null`.
  - `requireAdminPage(): Promise<SessionUser>` — no session → redirect `/admin/signin`; not admin → `notFound()`.
  - `requireAdmin(): Promise<SessionUser>` — throws `TrainingError("not_found")` unless admin.
  - `requireAthletePage` redirects to `/disabled` when `disabledAt` is set; `requireAthlete` throws `account_disabled`.
  - Error codes `account_disabled`, `invite_required`, `invalid_status_change`, `invite_disabled` with es/en messages.
  - `/admin/signin` is a public path.

- [ ] **Step 1: Write the failing tests**

`admin-access.test.ts`: `it("an impersonation session is never admin")` — `{ role: "admin", impersonatedBy: "x" }` → false; `it("needs the admin role")` — `{ role: null, impersonatedBy: null }` → false; null → false; `{ role: "admin", impersonatedBy: null }` → true.
`routes.test.ts`: `isPublicPath("/admin/signin")` → true; `isPublicPath("/admin")` → false.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/lib/admin-access.test.ts tests/lib/routes.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement the checks, error codes and messages**

`signinPathFor` sends `/admin/*` to `/admin/signin`. The pending page shows `t("rejected")` for `rejected` and `t("suspended")` for `suspended` (es: "Tu solicitud no ha sido aceptada." / "Tu cuenta de coach está deshabilitada."). `/disabled` (athlete zone) shows "Tu cuenta está deshabilitada." and no tab bar; it redirects to `/` when the athlete is not disabled.

- [ ] **Step 4: Run tests**

Run: `pnpm test` — Expected: PASS (including `messages.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: admin access checks, disabled athletes and coach status pages"
```

---

### Task 4: Coach administration

**Files:**
- Modify: `src/lib/training/services/admin.ts`, `src/lib/training/services/accounts.ts` (`approveCoach` moves to `admin.ts`; the script imports it from there), `src/lib/training/services/enrollments.ts` (`findProgramByCode`), `src/lib/training/services/programs.ts` (`regenerateInvite`), `scripts/approve-coach.ts`
- Test: `tests/training/services/admin.test.ts`, `tests/training/services/enrollments.test.ts`, `tests/training/services/programs.test.ts`

**Interfaces:**
- Consumes: `writeAudit` (Task 2), factories (Task 1).
- Produces (all take `actor: string | null` — the admin's user id, `null` for the script — and write one audit row):
  - `type CoachTransition = "approve" | "reject" | "suspend" | "enable"`
  - `changeCoachStatus(db: Db, actor: string | null, coachId: string, to: CoachTransition): Promise<void>` — allowed: `pending→approved`, `pending→rejected`, `rejected→approved`, `approved→suspended`, `suspended→approved`; anything else `invalid_status_change`; unknown id `not_found`. Audit actions `coach.approve`, `coach.reject`, `coach.suspend`, `coach.enable`.
  - `approveCoach(db, email)` keeps its signature and result, now calling `changeCoachStatus(db, null, …, "approve")`.
  - `type CoachDeletionPreview = { programsKept: number; programsDeleted: number; athletesEnrolled: number; resultsDeleted: number }`
  - `previewCoachDeletion(db: Db, coachId: string): Promise<CoachDeletionPreview>`
  - `deleteCoach(db: Db, actor: string, coachId: string, confirmEmail: string): Promise<CoachDeletionPreview>` — `confirmEmail` must equal the user's email (case-insensitive) else `invalid_request`. Runs the spec's "Deleting a coach" steps 1–6 in one `$transaction`; deletes the `User` when it has no `athleteAccount`. Audit action `coach.delete`, `targetLabel` = email, `details` = the preview.
  - `deleteUserIfNoProfiles(tx, userId: string): Promise<boolean>` (internal helper, shared with Task 5).
  - `findProgramByCode` also returns null when `coachId` is null, the coach's status is not `approved`, or `inviteDisabledAt` is set.
  - `regenerateInvite` throws `invite_disabled` when `inviteDisabledAt` is set.

Draft weeks of a continuous program: a block is on week `Math.floor(dayIndex / 7)`; it is deleted when that week has no `ProgramWeek` row.

- [ ] **Step 1: Write the failing tests** (in `admin.test.ts` unless noted)

- `it("follows the coach status transitions")` — each allowed pair succeeds and writes its audit action; `pending→suspended` and `approved→rejected` reject with `invalid_status_change`.
- `it("refuses a missing profile")` — `changeCoachStatus` and `deleteCoach` on an unknown id → `not_found`.
- `it("deletes unpublished content with its results and nothing else")` — coach with: closed unpublished program (enrolled athlete A with a result), continuous program with week 0 published and week 1 unpublished (block + result each, by athlete A), closed published program; athlete A also has a result in another coach's program. After `deleteCoach`: unpublished closed program gone; continuous keeps week-0 block and result, week-1 block and its result gone; published closed kept; all kept programs have `coachId: null` and `coachName` = the coach's name; A's other result intact; returned preview `{ programsKept: 2, programsDeleted: 1, athletesEnrolled: 1, resultsDeleted: 2 }` and equal to `previewCoachDeletion` taken before.
- `it("keeps the user and athlete data when a coach who is also an athlete is deleted")` — same user with both profiles and a session: after delete, user, session and athlete profile remain.
- `it("deletes the user when the coach was their only profile")` — user and sessions gone; a new `User` with the same email can be created.
- `it("requires the coach's email to confirm")` → `invalid_request` on mismatch, nothing deleted.
- In `enrollments.test.ts`: `it("rejects invitations of programs without an approved coach or with the link disabled")` — suspended coach, coachless program, `inviteDisabledAt` set → `invite_invalid`.
- In `programs.test.ts`: `it("refuses to regenerate a link the admin disabled")` → `invite_disabled`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/training/services` — Expected: FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `pnpm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src scripts tests
git commit -m "feat: coach administration: status changes and deletion that keeps published programs"
```

---

### Task 5: Athlete administration

**Files:**
- Modify: `src/lib/training/services/admin.ts`, `src/lib/training/services/results.ts`
- Test: `tests/training/services/admin.test.ts`, `tests/training/services/results.test.ts`

**Interfaces:**
- Consumes: `writeAudit`, `deleteUserIfNoProfiles` (Task 4).
- Produces:
  - `setAthleteDisabled(db: Db, actor: string, athleteId: string, disabled: boolean): Promise<void>` — disabling a disabled athlete (or enabling an enabled one) → `invalid_status_change`. Audit `athlete.disable` / `athlete.enable`.
  - `type AthleteDeletionPreview = { enrollments: number; results: number; prs: number }`
  - `previewAthleteDeletion(db: Db, athleteId: string): Promise<AthleteDeletionPreview>`
  - `deleteAthlete(db: Db, actor: string, athleteId: string, confirmEmail: string): Promise<AthleteDeletionPreview>` — same email confirmation and user rule as `deleteCoach`. Audit `athlete.delete`.
  - In `results.ts`, `leaderboardOf`, `getDayResults` counts, `blockResultRows` and `listAthleteResults` exclude results whose athlete has `disabledAt` set.

- [ ] **Step 1: Write the failing tests**

- `admin.test.ts`: `it("disables and enables an athlete")`, `it("refuses a missing profile")` (athlete variant), `it("deletes an athlete with their results, fist bumps and 1RMs, keeping their coach profile")`, `it("deletes the user when the athlete was their only profile")`.
- `results.test.ts`: `it("hides a disabled athlete's results from leaderboards, counts and coach views")` — two athletes with results; disable one; leaderboard has one entry, `getDayResults` count 1, `listBlockResults` one row; their fist bump on the other's result still counts.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/training/services/admin.test.ts tests/training/services/results.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `pnpm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: athlete administration: disable, enable and delete"
```

---

### Task 6: Admin read models and program invitation controls

**Files:**
- Create: `src/lib/training/services/admin-queries.ts`
- Modify: `src/lib/training/services/admin.ts`
- Test: `tests/training/services/admin-queries.test.ts`, `tests/training/services/admin.test.ts`

**Interfaces:**
- Produces:
  - `getOverview(db: Db, now?: Date): Promise<{ pendingCoaches: number; approvedCoaches: number; athletes: number; activePrograms: number; resultsLast7Days: number }>` — `activePrograms`: not archived, and either has a coach or has an active enrollment.
  - `listCoaches(db: Db, q: { search?: string; status?: string; page: number })` and `listAthletes(db: Db, q: { search?: string; page: number })` — search is case-insensitive on email or display name; coaches order `pending` first then newest; 50 per page; rows carry `email`, `displayName`, `status`/`disabledAt`, `createdAt`, and counts (programs / enrollments).
  - `getCoachDetail(db: Db, coachId: string)` and `getAthleteDetail(db: Db, athleteId: string)` — include the other profile's id when the user has one; `not_found` when missing.
  - `listPrograms(db: Db, q: { search?: string; page: number })` — name, `coachName`, `coachId` (null = deleted coach), kind, active athletes, last published week index, `archivedAt`, `inviteDisabledAt`.
  - In `admin.ts`: `setInviteDisabled(db: Db, actor: string, programId: string, disabled: boolean): Promise<void>` (audit `program.invite_disable` / `program.invite_enable`) and `adminRegenerateInvite(db: Db, actor: string, programId: string): Promise<string>` (audit `program.regenerate_invite`; allowed even when disabled).

- [ ] **Step 1: Write the failing tests**

`it("counts the overview")`, `it("searches coaches and athletes by email or name")`, `it("lists pending coaches first")`, `it("links the other profile of the same person")`, `it("shows programs of deleted coaches")`, and in `admin.test.ts` `it("disables, enables and regenerates a program's link")`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/training/services/admin-queries.test.ts tests/training/services/admin.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `pnpm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: admin read models and program invitation controls"
```

---

### Task 7: Invitation-only athlete sign-up

**Files:**
- Create: `src/lib/signup.ts`
- Modify: `src/app/(athlete)/actions.ts` (`completeAthleteOnboarding`), `src/app/(athlete)/onboarding/OnboardingRunner.tsx`, `src/app/(athlete)/onboarding/page.tsx`, `src/lib/training/schemas.ts` (`OnboardingInput` gains `next: string`), `.env.example`
- Test: `tests/lib/signup.test.ts`, `tests/training/services/enrollments.test.ts`

**Interfaces:**
- Produces:
  - `athleteSignupMode(env = process.env): "invite_only" | "open"` — anything but `"open"` is `invite_only`.
  - `inviteCodeFromNext(next: string): string | null` — returns the code only for an exact `/^\/join\/([A-Za-z0-9_-]+)$/` match.
  - `completeAthleteOnboarding` creates the profile when the athlete already has one, the mode is `open`, or `findProgramByCode(inviteCodeFromNext(next))` returns a program; otherwise throws `invite_required`. The runner shows `errors.invite_required` ("Necesitas una invitación de tu coach para entrar.") without the retry button.

- [ ] **Step 1: Write the failing tests**

`signup.test.ts`: `it("accepts only an exact /join/<valid code>")` — `/join/abc` → `"abc"`; `/join/abc/x`, `/join/x/../y`, `//evil`, `/join/`, `/` → null; `it("defaults to invite_only")`.
`enrollments.test.ts`: covered by Task 4's invitation test; no new case here.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run tests/lib/signup.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement**, and add `ATHLETE_SIGNUP=invite_only` to `.env.example` with a one-line comment.

- [ ] **Step 4: Run tests**

Run: `pnpm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src tests .env.example
git commit -m "feat: athlete sign-up only through a program invitation during the beta"
```

---

### Task 8: Admin panel UI and impersonation

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/signin/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/coaches/page.tsx`, `src/app/admin/coaches/[id]/page.tsx`, `src/app/admin/athletes/page.tsx`, `src/app/admin/athletes/[id]/page.tsx`, `src/app/admin/programs/page.tsx`, `src/app/admin/audit/page.tsx`, `src/app/admin/actions.ts`, `src/app/admin/ConfirmDialog.tsx`, `src/components/ImpersonationBanner.tsx`
- Modify: `src/app/(athlete)/layout.tsx`, `src/app/coach/layout.tsx`, `src/app/(athlete)/page.tsx` (coachless note), `src/app/api/tailor/**/route.ts`, `src/app/api/profile/route.ts`, `src/i18n/messages/*.json`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces (`src/app/admin/actions.ts`, each `requireAdmin()` first, Zod-validated ids, `runAction` with its own name, `revalidatePath("/admin", "layout")`):
  `changeCoachStatusAction(coachId, to)`, `deleteCoachAction(coachId, confirmEmail)`, `previewCoachDeletionAction(coachId)`, `setAthleteDisabledAction(athleteId, disabled)`, `deleteAthleteAction(athleteId, confirmEmail)`, `previewAthleteDeletionAction(athleteId)`, `setInviteDisabledAction(programId, disabled)`, `adminRegenerateInviteAction(programId)`, `impersonateAction(userId, zone: "coach" | "athlete")` (calls `auth.api.impersonateUser({ body: { userId }, headers })`, writes audit `impersonation.start` with the zone in `details`, then redirects to `/coach` or `/`), `stopImpersonatingAction()` (calls `auth.api.stopImpersonating`, audit `impersonation.stop`, redirects to `/admin`).

- [ ] **Step 1: Build the pages** following the spec's "Panel" section, with the frontend-design skill for layout. Status-dependent actions only show when the transition is allowed. Delete dialogs show the preview counts and require typing the email.

- [ ] **Step 2: Banner** — both zone layouts read `getSessionContext()`; when `impersonatedBy` is set they render `ImpersonationBanner` ("Estás viendo la cuenta de {name} — Salir") above everything, calling `stopImpersonatingAction`.

- [ ] **Step 3: Coachless note** — the athlete day view shows `t("today.noNewSessions")` ("Este programa ya no recibe sesiones nuevas.") when `program.coachId` is null.

- [ ] **Step 4: Engine routes** — `/api/tailor/*` and `/api/profile` answer `403` when the session has `impersonatedBy`.

- [ ] **Step 5: Typecheck, lint, tests, build**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` — Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: admin panel pages, impersonation and banner"
```

---

### Task 9: Browser verification

Against Neon `dev` (VPN off), with `pnpm db:migrate` applied and two Google accounts (A = admin, B = coach and athlete).

- [ ] **Step 1:** `pnpm admin:grant <A>`; A opens `/admin/signin` → overview. B opens `/admin` → 404.
- [ ] **Step 2:** B signs up as coach → A sees it pending first; reject → B sees "not accepted"; approve from the panel → B enters `/coach`.
- [ ] **Step 3:** B creates a continuous program, publishes week 0, leaves week 1 as a draft; B (as athlete, via the invitation) logs a result. With `ATHLETE_SIGNUP` unset, a third sign-in at `/signin` without an invitation shows "you need an invitation".
- [ ] **Step 4:** A disables B as coach → invitation link invalid, B's athlete view still shows the program; enable.
- [ ] **Step 5:** A enters B's coach account → banner; edit a block; exit → `/admin/audit` shows `impersonation.start`, the block action with `impersonating`, `impersonation.stop`. While impersonating, `/admin` is 404.
- [ ] **Step 6:** A disables B as athlete → `/disabled`; the leaderboard (seen as coach) hides B's result; enable.
- [ ] **Step 7:** A disables B's program link from `/admin/programs` → B (coach) cannot regenerate it; A re-enables it.
- [ ] **Step 8:** A deletes B's coach profile (dialog counts match) → B's athlete view keeps week 0 with its result and the "no new sessions" note, week 1 gone; B can still log on week 0.
- [ ] **Step 9:** Screenshots of the overview, a coach detail, the banner and the audit log for the PR.
