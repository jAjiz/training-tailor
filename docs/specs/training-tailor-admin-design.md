# Training Tailor — Admin Panel Design (Closed Beta)

> Revision 1 (2026-10-18), after a builder review. Prepares the closed beta: on 2026-10-18 the owner decided to put
> coaching (phases 1 and 2 of `training-tailor-coaching-design.md`) in production for a small
> group of coaches and athletes, before the later phases. This spec covers the admin panel
> and the invitation-only athlete sign-up. Notifications and coach announcements are a
> separate spec; the production deploy comes after both.

## Problem

Today the only admin tool is `pnpm coach:approve <email>`, run against the database. A beta
with real people needs the owner to approve or reject coaches, block and unblock accounts,
remove accounts on request, and fix things on someone's behalf, from the browser and with a
record of what was done. Athletes must also stop being able to create an account without an
invitation, so the beta stays closed.

## Goals

- One admin (the owner) manages coaches and athletes from `/admin`.
- Coaches: approve, reject (the email stays blocked), disable and enable, delete (the email
  becomes free).
- Athletes: disable and enable, delete (the email becomes free), edit their data.
- The admin can enter any coach or athlete account (impersonation) to see what they see and
  fix anything, and every change made that way is recorded as the admin's.
- An athlete profile can only be created through a program invitation, behind a switch that
  is turned off after the beta.

## Non-goals

- Several admins, admin roles or permissions; managing admins from the panel.
- An admin editor for programs, blocks or results: impersonation covers it.
- Moderating results, exporting data, advanced analytics.
- Notifying anyone of admin actions (the notifications spec may add it, e.g. telling
  athletes that a coach was removed).
- Account self-deletion by users.
- Users who signed in with Google but have no profile: they are harmless and stay out of the
  panel.

## Anti-goals

- An admin action that silently changes data with no trace of who did it.
- Deleting or disabling one profile breaking the other: one Google identity can hold a coach
  and an athlete profile, and each is managed on its own.
- Deleting a coach wiping out what athletes can see today: published weeks and their results.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Who is admin | The owner, by Better Auth's `admin` plugin: `user.role = "admin"`. Granted by a script, `pnpm admin:grant <email>` (same shape as `coach:approve`). The admin needs no coach or athlete profile. |
| Panel | `/admin`, desktop-first, its own layout, same design system (`src/components/ui`, theme tokens) and i18n (es/en) as the rest. Not reachable for non-admins: **404**, as for other users' resources. |
| Scope of an action | Every action targets **one profile** (coach or athlete), never the Google identity as a whole. The `User` row and its sessions are deleted only when the deleted profile was the last one. |
| Coach statuses | `pending` → `approved` or `rejected`; `approved` ↔ `suspended` (disable/enable). `rejected` can be approved later from the panel. |
| Coach rejected | The `CoachAccount` stays with `status = "rejected"`; since a user has at most one coach profile, the email cannot apply again. The awaiting-approval page shows "your request was not accepted". Deleting the profile frees the email. A rejected coach can still be an athlete through an invitation. |
| Coach disabled | `suspended`: no coach zone (awaiting-approval page shows "account disabled"). Their published programs **stay visible** to their athletes, who can keep logging results. Their invitation links stop working while suspended. Enabling restores everything as it was. |
| Coach deleted | The coach profile is deleted and the email becomes free. Their programs are **kept for the athletes**, frozen: published content stays (with results, leaderboards and fist bumps) and athletes can keep logging and editing results on it; unpublished content is deleted **with any results logged on it**; the invitation stops working; the coach's name is kept on the program as text. See "Deleting a coach". |
| Athlete disabled | A new `AthleteAccount.disabledAt`. The athlete zone shows "account disabled" and every athlete action refuses. Their results are hidden from leaderboards and coach result views while disabled. Enrollments are untouched. |
| Athlete deleted | The athlete profile is deleted with its enrollments, results, fist bumps and 1RMs (the existing cascades). The email becomes free. |
| Editing someone's data | Through impersonation, for coaches and athletes alike. There is no separate edit form. |
| Impersonation | Better Auth `admin` plugin (`impersonateUser`, `stopImpersonating`). Sessions last **1 hour**. A banner across every page of both zones: "You are viewing X's account — Exit". Impersonating another admin is not allowed (plugin default). The impersonated user sees exactly what they would see, including "account disabled" pages. |
| Audit log | One table, `AdminAuditLog`. It records every panel action and every mutation made during an impersonation, with the admin as the actor. Rows are never edited or deleted. |
| Invitation-only athletes | A setting, `ATHLETE_SIGNUP=invite_only` (default) or `open`. When `invite_only`, the athlete onboarding creates the profile only if `next` is `/join/<code>` with a valid code; otherwise it shows "you need an invitation from your coach". Coach sign-up is unchanged (self-service, then approval). |
| `coach:approve` script | Kept, for bootstrapping and emergencies. It writes an audit row with no admin (actor `script`). |

## Data model

Better Auth's `admin` plugin adds its fields to `User` (`role`, `banned`, `banReason`,
`banExpires`) and `Session` (`impersonatedBy`) through a new migration. The ban fields are
**not used**: banning acts on the whole identity, and this project disables profiles.

```prisma
model CoachAccount {
  // status: "pending" | "approved" | "rejected" | "suspended"
  ...
}

model AthleteAccount {
  ...
  disabledAt DateTime?
}

model Program {
  coachId   String?        // null once the coach is deleted
  coach     CoachAccount?  @relation(fields: [coachId], references: [id], onDelete: SetNull)
  coachName String         // the coach's display name, kept up to date while the coach exists
  ...
}

model AdminAuditLog {
  id          String   @id @default(cuid())
  actorUserId String?  // the admin; null for the coach:approve script
  action      String   // e.g. "coach.approve", "athlete.delete", "impersonation.start", "program.regenerate_invite", or the Server Action's name during an impersonation
  targetUserId String? // whose account it concerns
  targetType  String?  // "coach" | "athlete" | "program" | ...
  targetId    String?
  targetLabel String?  // email or name at the time, readable after a deletion
  impersonating Boolean @default(false)
  details     Json?    // small, no workout text or result scores
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([targetUserId, createdAt])
}
```

`coachName` is filled from `CoachAccount.displayName` in the migration and updated when the
coach changes their name. Every place that shows "by <coach>" reads `program.coachName`.

## Deleting a coach

In one transaction:

1. **Closed programs** not published (`publishedAt` null) are deleted, with their
   enrollments and results. A closed program can have them if the coach unpublished it
   after athletes joined; the owner chose to delete them anyway.
2. **Continuous programs:** blocks on weeks without a `ProgramWeek` row (drafts or
   unpublished weeks) are deleted with their results; published weeks and their blocks stay.
3. **Published closed programs** stay whole.
4. Every remaining program gets `coachId = null`. A program without a coach behaves as
   archived for invitations (`findProgramByCode` returns null), and stays visible to its
   enrolled athletes with its results and leaderboards; athletes can still log, edit and
   delete results and give fist bumps on it. The athlete's day view shows a note:
   "This program no longer receives new sessions." Archived programs keep today's behavior
   (hidden from athletes, results kept).
5. The `CoachAccount` is deleted; if the user has no athlete profile, the `User` (and its
   sessions, Google account link and engine data) is deleted too.
6. An audit row with the coach's email and the count of programs kept and deleted.

The confirmation dialog shows those counts (programs kept, programs deleted, athletes
enrolled, results that will be deleted) and asks the admin to type the coach's email.

## Panel

```
/admin                     overview
/admin/coaches             list with status filter (pending first) and search
/admin/coaches/[id]        detail and actions
/admin/athletes            list with search
/admin/athletes/[id]       detail and actions
/admin/programs            list of all programs
/admin/audit               audit log
```

- **Overview:** pending coaches (the only figure that asks for action, with a link to the
  list), counts of approved coaches, athletes, active programs, and results logged in the
  last 7 days.
- **Search:** by email or name, on the coach and athlete lists.
- **Coach detail:** name, email, status, sign-up date, programs (name, kind, athletes,
  last published week), and the actions that apply to the status: Approve, Reject, Disable,
  Enable, Delete, "Enter as this coach".
- **Athlete detail:** name, email, time zone, language, sign-up date, enrollments (program,
  coach, joined, removed), result count, and Disable, Enable, Delete, "Enter as this
  athlete". If the same person has the other profile, a link to it.
- **Programs:** name, coach (or "deleted coach"), kind, athletes, last published week,
  archived. Actions: disable the invitation link (sets a new `Program.inviteDisabledAt`;
  the coach sees "invitation disabled by the admin" and cannot regenerate until the admin
  re-enables it) and regenerate the link.
- **Audit:** newest first, filtered by target user or action, paginated.
- **Confirmations:** reject, disable and delete ask for confirmation; delete (coach or
  athlete) asks the admin to type the email and states what will be lost.
- Visual design is decided during implementation (frontend-design), not in this spec.

## Access and enforcement

- `requireAdminPage()` and `requireAdmin()` in `src/lib/accounts.ts`, alongside the existing
  checks: no session → sign-in; not admin → 404 (page) or `not_found` (action). An
  impersonation session is never admin, even if the admin opens `/admin` while
  impersonating.
- `/admin/signin` is the admin's entry point (Google, `callbackURL=/admin`). It is a public
  path; it creates no profile.
- `requireAthletePage()` / `requireAthlete()` add the `disabledAt` check (page → "account
  disabled", action → `account_disabled`). `requireCoachPage()` / `requireCoach()` already
  refuse anything but `approved`; the awaiting-approval page learns `rejected` and
  `suspended` wording.
- Leaderboards, coach result views and result counts exclude results of disabled athletes.
- `findProgramByCode` also refuses programs whose coach is not `approved`, programs without
  a coach and programs with `inviteDisabledAt`.

### Audit during impersonation

`runAction` (`src/lib/actions.ts`) is the single entry of every Server Action. It learns the
action's name, and when the current session has `impersonatedBy`, it writes an
`AdminAuditLog` row after a successful run (`impersonating = true`, actor = the admin, target
= the impersonated user). Failed or refused actions are not logged. The engine's route
handlers (`/api/tailor/*`, `/api/profile`) are out of the beta's navigation; during an
impersonation they answer 403 rather than act.

## Rules and edge cases

- A coach who is also an athlete: disabling or deleting the coach profile leaves the athlete
  profile and its sessions alone, and vice versa.
- Impersonation replaces the admin's session cookie, so the panel is not available until the
  admin exits. Deleting a profile revokes every session of that user when the `User` is
  deleted, impersonation sessions included.
- Approving a `rejected` coach is allowed; disabling a `pending` coach is not (reject it).
- A deleted coach who signs up again starts from scratch; the kept programs are not
  reattached.
- A disabled athlete's fist bumps on others' results still count.
- `ATHLETE_SIGNUP=invite_only` does not affect athletes who already have a profile: they
  sign in at `/signin` as before.

**Errors:** new codes `account_disabled`, `invite_required`, `invalid_status_change`, each
translated; actions return `{ ok: false, code }` as today.

## Code layout

```
src/lib/auth.ts                         + admin plugin (before nextCookies)
src/lib/accounts.ts                     + requireAdmin, requireAdminPage, disabled checks
src/lib/actions.ts                      runAction(name, fn) + impersonation audit
src/lib/training/services/admin.ts      coach and athlete status changes, deletions, overview counts, program invite controls
src/lib/training/services/audit.ts      write and list audit rows
src/app/admin/                          panel routes and components
src/components/ImpersonationBanner.tsx  shown by both zone layouts
scripts/grant-admin.ts                  pnpm admin:grant <email>
```

## Testing

- **Service integration** (PGlite, as today): every status transition and its refusals;
  deleting a coach (each program kind, drafts removed, published kept, invitation dead,
  `User` kept or deleted depending on the other profile); deleting an athlete; disabled
  athletes excluded from leaderboards; `findProgramByCode` with each new refusal;
  invitation-only onboarding.
- **Unit:** `runAction` writes an audit row only on success during an impersonation.
- **Browser verification** with two Google accounts on Neon `dev`: grant admin, approve and
  reject a coach, disable and enable both kinds, impersonate (banner, change something, see
  it in the audit log, exit), delete a coach with an enrolled athlete and check the athlete's
  view, sign up as an athlete without and with an invitation.

## Left to the builder

- How `runAction` gets the action's name (an argument, a wrapper per actions file).
- Pagination size, list columns, the overview layout.
- Whether the admin's Google sign-in reuses the existing sign-in components.

## Delivery

One PR:

1. Admin plugin, migration (`role`, `impersonatedBy`, `disabledAt`, `coachName`, nullable
   `coachId`, `inviteDisabledAt`, `AdminAuditLog`), `admin:grant`.
2. `requireAdmin*`, `/admin/signin`, panel layout, overview and lists.
3. Coach actions (approve, reject, disable, enable, delete) and their effects on programs
   and invitations.
4. Athlete actions (disable, enable, delete) and their effects on leaderboards.
5. Impersonation with the banner, and the audit log with its viewer.
6. Program list with the invitation controls.
7. `ATHLETE_SIGNUP=invite_only`.
