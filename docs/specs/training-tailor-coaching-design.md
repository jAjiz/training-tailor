# Training Tailor — Coaching Design (Programs, Results, Leaderboards)

> Revision 1 (2026-10-08), amended the same day: blocks are reordered by drag and drop (dnd-kit). A new project on top of the existing app: coaches write and
> publish programs, athletes follow them on their phone, log results and compare them on a
> leaderboard. The tailoring engine (`training-tailor-engine-v1-design.md`, paused on
> 2026-10-07) is **not** part of this project; plugging it into the athlete's day view is a
> later phase.

## Problem

Coaches sell or share training programs (daily programming for a box, or closed cycles of a
few weeks), and athletes need one place to follow them: see today's session, log what they
did, see how others did, and keep their maxes. Strivee and TrainHeroic are the references.
Training Tailor needs this base product before the AI tailoring can be offered as an extra
(and later monetized).

## Phasing

| Phase | Content | Status |
|-------|---------|--------|
| **1. Programming and viewing** | Accounts and entry points, programs (continuous and closed), weekly planner with Custom and Barbell Set blocks, publication, invitations and enrollments, athlete day view | This spec |
| **2. Results and competition** | Result logging, leaderboard with fist bumps, PRs (1RM) with % → kg, coach result views | This spec |
| 3. AI tailoring in the day view | "Tailor" on a session, using the engine | Later, own spec |
| 4. Coach controls over AI | Enable/disable per program, see what athletes tailored, intent notes for the engine | Later, own spec |
| 5. Monetization | Paid programs (storefront), paid AI tier, payouts | Later, own spec |

Phases 1 and 2 share this spec and one implementation plan, delivered as two PRs. Each phase
ends with a browser verification of its main flows.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Platform | Responsive web. The **coach** side is desktop-first, under `/coach`. The **athlete** side is phone-first, at the root. One Next.js app, one deployment. |
| Accounts | One Better Auth identity (Google) with two independent profiles: `CoachAccount` and `AthleteAccount`. Each is created the first time the user comes in through its entry point. The same Google account can hold both. |
| Coach approval | Coach sign-up is self-service but lands in `pending`. Only an `approved` coach can create programs. Approval is a script (`pnpm coach:approve <email>`); no admin panel. |
| Program kinds | **Continuous**: real dates, ongoing, published week by week, with leaderboards. **Closed**: N weeks that each athlete starts on the day they join, published as a whole, no leaderboard. |
| Block kinds | **Custom Workout**: free text plus a scoring type. **Barbell Set**: one catalog movement with sets × reps × (% of 1RM or kg). Benchmarks are out of scope. |
| Divisions | Fixed **Rx / Scaled** for every program. |
| Social | Fist bumps on results, with a counter. No comments, no notifications. |
| Access | One invitation link (code) per program. The coach sees the roster, can remove and restore athletes, and can regenerate the link. |
| Several programs | An athlete can follow several programs; the day view shows one, with a selector. |
| PRs | Lift only: 1RM in kg per barbell movement. Edited by the athlete, with history. A logged single above the current 1RM triggers a prompt to update it. A 1RM is never estimated. |
| Visibility | Continuous: a week is a draft until the coach publishes it. Closed: the whole program is published at once; the invitation only works once published. |
| Planner drag and drop | **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`): reorder within a day and move between the days of the visible week, by pointer or keyboard. |
| Mutations | Server Actions validated with Zod, over a service layer in `src/lib/training/`. The engine keeps its route handlers (it needs streaming); this project has no streaming, so it deliberately uses a different pattern. |
| i18n | **next-intl**, Spanish and English, default Spanish. The locale comes from a per-profile preference, falling back to `Accept-Language`. URLs carry no locale prefix. The engine pages (`/tailor`, `/profile`) stay in English until phase 3. |
| Data | Postgres via Prisma 7, new migrations. Calendar dates are stored as `@db.Date` (no time zone). |

## Scope

**In:** everything in the decisions table, plus: a block color, ordering and duplication of
blocks, days and weeks, coaching tips, an optional video link per block, the athlete
calendar, and editing or deleting one's own results.

**Out:** benchmarks and their library; Gym/Cardio/Benchmark PRs; comments; notifications;
media upload (links only); a "Box" or "Notes" tab; athlete analytics for the coach (strength
radar, evolution charts); an admin panel; coach moderation of results; account deletion; AI
tailoring (phase 3); payments (phase 5).

## Data model

```prisma
model CoachAccount {
  id          String   @id @default(cuid())
  userId      String   @unique            // Better Auth user
  displayName String
  status      String   @default("pending") // "pending" | "approved" | "suspended"
  locale      String?                     // "es" | "en"
  createdAt   DateTime @default(now())
  programs    Program[]
}

model AthleteAccount {
  id          String   @id @default(cuid())
  userId      String   @unique
  displayName String                      // from Google at onboarding, editable
  avatarUrl   String?                     // from Google at onboarding
  timezone    String                      // IANA, from the browser at onboarding, editable
  locale      String?
  createdAt   DateTime @default(now())
}

model Program {
  id          String    @id @default(cuid())
  coachId     String
  name        String
  description String?
  kind        String                     // "continuous" | "closed"
  startDate   DateTime? @db.Date         // continuous: the Monday of day 0
  weeks       Int?                       // closed: length in weeks
  publishedAt DateTime?                  // closed: the whole program is published
  inviteCode  String    @unique          // regenerable
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
}

model ProgramWeek {                      // continuous only: one row per published week
  programId   String
  weekIndex   Int
  publishedAt DateTime
  @@id([programId, weekIndex])
}

model Block {
  id             String   @id @default(cuid())
  programId      String
  dayIndex       Int                     // 0-based from the program's day 0
  position       Int                     // order within the day
  kind           String                  // "custom" | "barbell"
  title          String?
  color          String                  // one of the fixed palette keys
  coachingTips   String?
  videoUrl       String?                 // https only
  description    String?                 // custom
  scoring        String?                 // custom: see "Scoring"
  timeCapSeconds Int?                    // custom, for_time only
  movement       String?                 // barbell: canonical catalog name
  sets           Json?                   // barbell: [{ reps, percent? , kg? }], exactly one of percent/kg
  instructions   String?                 // barbell
  updatedAt      DateTime @updatedAt
  @@index([programId, dayIndex, position])
}

model Enrollment {
  id        String    @id @default(cuid())
  programId String
  athleteId String
  startDate DateTime? @db.Date           // closed: the day the athlete joined (athlete's time zone)
  joinedAt  DateTime  @default(now())
  removedAt DateTime?
  @@unique([programId, athleteId])
}

model Result {
  id          String   @id @default(cuid())
  blockId     String
  athleteId   String
  division    String                     // "rx" | "scaled"
  score       Json                       // shape depends on the block's scoring (see "Scoring")
  sortKey     Float?                     // higher is better; null for barbell results
  capped      Boolean  @default(false)
  notes       String?
  performedOn DateTime @db.Date          // the date the block is scheduled for this athlete
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([blockId, athleteId])         // one result per athlete and block; edit instead of duplicating
  @@index([athleteId])
}

model FistBump {
  resultId  String
  athleteId String
  createdAt DateTime @default(now())
  @@id([resultId, athleteId])
}

model PersonalRecord {
  id         String   @id @default(cuid())
  athleteId  String
  movement   String                      // canonical catalog name, barbell equipment
  kg         Float
  achievedOn DateTime @db.Date
  createdAt  DateTime @default(now())
  @@index([athleteId, movement])
}
```

`coachId` references `CoachAccount.id` and every `athleteId` references `AthleteAccount.id`,
never the Better Auth user id. Relations cascade on delete from parent to child (Program →
weeks, blocks, enrollments; Block → results; Result → fist bumps). The engine models (`AthleteProfile`,
`TailoredWorkout`, `LlmUsage`, `UnrecognizedMovement`) are untouched.

**Palette:** `neutral`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`.

## Time model

There is no "day" table: a block's `dayIndex` is its position in days from the program's
day 0. A day title such as "Wednesday - Muscle snatch…" is an ordinary block with scoring
`none`.

- **Continuous:** date = `startDate + dayIndex`; week = `floor(dayIndex / 7)`. `startDate`
  is always a Monday, so weeks run Monday to Sunday. The program has no end. An athlete sees
  every published week, including those before they joined.
- **Closed:** the athlete's date = `enrollment.startDate + dayIndex`, with
  `0 ≤ dayIndex < weeks × 7`. The coach's planner shows "Week N · Day M" instead of dates.
- **Today** is computed in the athlete's time zone (`AthleteAccount.timezone`).
- An athlete can log a block only once its date has arrived (past dates are allowed),
  only if it is visible (published week, or published closed program), and only if their
  enrollment is active.

## Scoring

`scoring` on a Custom block is one of `none`, `for_time`, `amrap`, `reps`, `load`,
`calories`, `distance`, `max_time`. Barbell blocks have no `scoring`; their result is a list
of sets.

| Scoring | `score` | `sortKey` | Log form |
|---------|---------|-----------|----------|
| `for_time` | `{ seconds }` or `{ capped: true, reps }` | `-seconds`, or `reps` when capped | min + s; "capped" toggle with reps, shown only if the block has `timeCapSeconds` |
| `amrap` | `{ rounds, reps }` | `rounds × 10000 + reps` | rounds + reps |
| `reps` | `{ reps }` | `reps` | reps |
| `load` | `{ kg }` | `kg` | kg |
| `calories` | `{ calories }` | `calories` | calories |
| `distance` | `{ meters }` | `meters` | meters |
| `max_time` | `{ seconds }` | `seconds` | min + s |
| barbell | `{ sets: [{ kg, reps }] }` | `null` | one row per prescribed set, reps prefilled |
| `none` | — | — | no log button |

Each score shape has a Zod schema; a score that does not match the block's scoring is
rejected (`invalid_score`). All numbers are non-negative; integers except `kg` and
`meters`.

## Leaderboard

- Exists only for **Custom blocks with a scoring other than `none`, in continuous
  programs**.
- Includes the results of active enrollments only (a removed athlete's results stay in the
  database but leave the leaderboard).
- Order: `rx` before `scaled`; within a division, finished before capped; then `sortKey`
  descending. Equal keys share a rank.
- A row shows rank, name, avatar, division badge, the formatted score, the fist bump count
  and whether the viewer has bumped it. An athlete cannot bump their own result.
- Visible to the program's active athletes, whether or not they have logged, and to its
  coach.

In closed programs results are stored the same way, as personal history; the coach sees
them per athlete.

## PRs

- The PR list is every catalog movement with `barbell` equipment, grouped by its first
  pattern (squat, clean, press…), with a search box.
- The **current 1RM** of a movement is its entry with the most kg. The history lists every
  entry; deleting one is how mistakes are corrected.
- A Barbell Set prescribed in % shows kg = `percent × 1RM`, rounded to 0.5 kg. With no 1RM
  for that movement it shows the percentage and a link to add one.
- After saving a Barbell result, if any set has 1 rep with more kg than the current 1RM, the
  app asks "Update your 1RM from X to Y kg?". Accepting creates an entry dated
  `performedOn`.

## Routes and UI

The root layout only renders `<html>` and `<body>` with the i18n provider. Each zone has its
own layout.

```
(athlete)/                 phone layout, bottom bar: Today · PRs · Me
  /                        program selector, week strip, the day's blocks
  /calendar                month view to jump to a date
  /blocks/[id]/log         log or edit a result
  /blocks/[id]/leaderboard
  /prs, /prs/[movement]    grouped list; one movement's history
  /me                      name, avatar, time zone, language
  /join/[code]             invitation page (public)
  /signin, /onboarding     athlete entry point → creates the AthleteAccount
  /tailor, /profile        engine pages, still reachable, removed from the navigation

coach/                     desktop layout, top bar
  /coach                   my programs
  /coach/signin, /coach/onboarding → creates the CoachAccount (pending) → "awaiting approval" page
  /coach/programs/new
  /coach/programs/[id]?week=N         weekly planner, block editor in a modal
  /coach/programs/[id]/athletes       roster, remove/restore, regenerate the link
  /coach/programs/[id]/athletes/[aid] that athlete's results
  /coach/blocks/[id]/results          leaderboard (continuous) or result list (closed)
```

- **Day view:** each block shows its title, text or sets (kg when a 1RM exists), its color
  bar, and, as applicable, "Coaching tips" (expandable), the video link, "Log result" (or
  "Edit result") and "N scores" (continuous only).
- **Planner:** seven day columns per week. Continuous programs show dates and a per-week
  "Publish" / "Unpublish" toggle; closed programs show "Week N · Day M" and a program-level
  "Publish". Actions: add, edit, delete and recolor blocks; **drag and drop** a block to
  reorder it within its day or move it to another day of the visible week (dnd-kit, keyboard
  accessible); duplicate a block, a day or a week to a chosen target.
- Visual design is decided during implementation (frontend-design), not in this spec.

## Accounts and access

- **Sign-in:** Google OAuth, as today. The entry point's `callbackURL` decides which
  onboarding runs. Onboarding for an athlete takes the name and avatar from Google and the
  time zone from the browser (`Intl`); for a coach, it takes the name and sets `pending`.
- **Proxy** (`src/proxy.ts`): checks only that a session exists. Open paths: `/signin`,
  `/coach/signin`, `/join/*`, `/api/auth/*`.
- **Profile checks** (`src/lib/accounts.ts`): `requireAthlete()` and `requireCoach()`. On a
  page they redirect to onboarding or to "awaiting approval"; in an action they return an
  error code. A `suspended` coach loses the coach zone; their published programs stay
  visible to their athletes.
- **Permissions** (`src/lib/training/access.ts`): a coach reads and writes only their own
  programs; an athlete reads only programs where their enrollment is active, and only what is
  published. Another user's resource answers **404, never 403**, so its existence is not
  revealed.

## Rules and edge cases

**Invitations**
- An invalid code (regenerated, archived program, unpublished closed program) shows
  "invalid link".
- Without a session, `/join/[code]` goes through sign-in and back. Without an athlete
  profile, it goes through onboarding first.
- Already enrolled: redirect to the program.
- Removed: the link does not re-enroll ("your coach removed you from this program"); the
  coach can restore the enrollment from the roster.
- Joining a closed program sets `enrollment.startDate` to today in the athlete's time zone.

**Program changes**
- `startDate` cannot change once any week is published. In a closed program, lowering
  `weeks` is rejected if blocks would fall outside the new range.
- Archiving a program invalidates its link, removes it from athletes' selectors and makes it
  read-only for the coach; results are kept.
- A continuous program before its `startDate` shows "starts on …"; a closed program past its
  last day shows "program finished", with the athlete's history still available.

**Block changes**
- Edits to a published week or a published closed program are visible to athletes at once;
  there is no separate draft of a published week.
- Deleting a block with results asks for confirmation with the result count, then cascades.
- Changing the `scoring` of a block that has results is rejected (`scoring_locked`).
- Unpublishing a week is allowed; athletes stop seeing it and their results are kept.
- Duplicating a day or a week **appends** blocks to the target, never replaces them; a target
  outside a closed program's range is rejected.
- Moving a block (within its day or to another day) renumbers both days in one transaction;
  its results keep their `performedOn`. A target day outside a closed program is rejected. Concurrent edits: last write wins (one
  coach per program).

**Errors:** actions return `{ ok: false, code }`, never exception text (same principle as
`jsonError`). The UI maps every code to a translated message.

## Code layout

```
src/lib/accounts.ts                    requireAthlete, requireCoach, onboarding
src/lib/training/dates.ts              dayIndex ↔ date, week visibility, today in a time zone
src/lib/training/scoring.ts            score schemas, sortKey, formatting
src/lib/training/leaderboard.ts        ranking and ties
src/lib/training/prs.ts                current 1RM, % → kg, single detection
src/lib/training/access.ts             permission checks
src/lib/training/schemas.ts            Zod schemas for every action input
src/lib/training/services/*.ts         programs, blocks, enrollments, results, prs (Prisma)
src/i18n/                              next-intl config, messages/es.json, messages/en.json
scripts/approve-coach.ts               pnpm coach:approve <email>
```

The first five `training` modules are pure (no Prisma, no Next) and carry most of the
logic. Server Components read through the services; Server Actions validate their input
with `schemas.ts`, check access, then call the services. Barbell movements are validated through `src/lib/domain/repository.ts`.

## Testing

- **Unit (Vitest)** on the pure modules: `dates` (DST changes, time zones, published weeks,
  closed programs), `scoring` (every type, capped, validation), `leaderboard` (order, ties,
  removed athletes), `prs` (rounding, current 1RM, single detection), `access`.
- **Service integration** on an in-memory Postgres (**PGlite**) with the migrations applied,
  so tests need neither Neon nor the network (the corporate VPN blocks port 5432).
  **Risk:** PGlite's compatibility with Prisma 7's driver adapters is unverified. It is the
  plan's first task; if it fails, the services take store interfaces with in-memory fakes,
  as `quota-store.ts` does today.
- **Browser verification** of the main flows at the end of each phase. No Playwright in this
  project.

## Delivery

**Phase 1 — Programming and viewing (PR 1)**
1. PGlite + Prisma 7 check and the integration test harness.
2. next-intl base and the two zone layouts.
3. Accounts and onboarding for both entry points; pending coach; `coach:approve`.
4. Programs: create, edit and archive, both kinds.
5. Weekly planner with Custom and Barbell blocks (color, order, duplication); publication per
   week (continuous) or per program (closed).
6. Invitations, enrollments and the roster (remove, restore, regenerate the link).
7. Athlete day view: program selector, week strip, calendar; Barbell Sets shown in %.

**Phase 2 — Results and competition (PR 2)**
1. Result logging for every scoring type, and per-set loads for Barbell Sets.
2. Leaderboard and fist bumps.
3. PRs: list, history, % → kg in the day view, single prompt.
4. Coach result views, per block and per athlete.
