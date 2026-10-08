# Training Tailor Coaching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches write and publish programs (continuous or closed) on a desktop web zone; athletes follow them on their phone, log results, compare them on a leaderboard with fist bumps, and keep their 1RMs.

**Architecture:** The existing Next.js 16 app gains two zones: `src/app/coach/*` (desktop) and the `(athlete)` route group at the root (phone). Business logic lives in `src/lib/training/`: pure modules (`dates`, `schemas`, `barbell`, `access`, `scoring`, `leaderboard`, `prs`) plus Prisma-backed services (`services/*.ts`) that take the Prisma client as their first argument. Pages are Server Components that read through the services; writes are Server Actions that parse input with Zod, check the account, call a service and return `ActionResult`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, Zod 4, Prisma 7 + `@prisma/adapter-pg`, Better Auth (Google), next-intl 4, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`), Vitest 4, PGlite + `@electric-sql/pglite-socket` (tests only), pnpm.

**Spec:** `docs/specs/training-tailor-coaching-design.md` (revision 1). Read it before any task: every rule here argues from it.

## Global Constraints

- Package manager **pnpm**; platform Windows (commands are cross-platform unless noted).
- **Prisma 7:** client generated to `src/generated/prisma`; import from `@/generated/prisma/client`, never `@prisma/client`. After editing `prisma/schema.prisma`, run `pnpm exec prisma generate`.
- **Migrations are generated offline** with `prisma migrate diff` (Task 2 shows the command); never `db push`. Applying them to Neon (`pnpm db:deploy`) needs the corporate VPN **off** (it blocks port 5432); local `.env` points at the Neon branch `dev`, never `production`.
- **Tests:** `pnpm test` stays deterministic: no external network, no Neon, no API key. Service tests run on an in-memory PGlite reached over loopback (`tests/helpers/db.ts`). TDD for every code task: failing test → see it fail → minimal code → see it pass → commit.
- **Boundary rule:** `src/lib/training/*.ts` (not `services/`) never imports Prisma, Next.js or `@/lib/db`. `src/lib/training/services/*.ts` never imports Next.js or `@/lib/db`; the caller passes the Prisma client.
- **Ids:** `coachId` is always `CoachAccount.id` and `athleteId` is always `AthleteAccount.id`, never the Better Auth user id.
- **Calendar dates** are `IsoDate` strings (`YYYY-MM-DD`) in code and `@db.Date` in the database; convert only with `toDbDate` / `fromDbDate`. "Today" for an athlete is `todayIn(athlete.timezone)`.
- **Errors:** services throw `TrainingError(code)`; actions return `{ ok: false, code }` and never exception text; another user's resource is `not_found` (404), never a 403. Every `ErrorCode` has a message under `errors.<code>` in both locales.
- **i18n:** every user-facing string of the coaching zones comes from `src/i18n/messages/{es,en}.json` (default `es`); both files always have the same keys (enforced by a test). URLs carry no locale prefix. The engine pages (`/tailor`, `/profile`) stay in English.
- **Divisions** are exactly `rx` and `scaled`. **Palette** is exactly `neutral`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`.
- **Commits:** Conventional Commits; end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Execution order

**Phase 1 — Programming and viewing (PR 1):** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13.
**Phase 2 — Results and competition (PR 2):** Task 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21.

Each phase ends with a verification task (13, 21) that runs the whole suite, drives the app in the browser and opens the PR.

## File structure (target)

```
prisma/schema.prisma                         + CoachAccount, AthleteAccount, Program, ProgramWeek, Block,
                                               Enrollment, Result, FistBump, PersonalRecord
prisma/migrations/<ts>_coaching/migration.sql
scripts/approve-coach.ts                     pnpm coach:approve <email>
src/proxy.ts                                 session gate for every non-public page
src/lib/routes.ts                            isPublicPath, signinPathFor, safeNext (pure)
src/lib/session.ts                           + image in the session user
src/lib/actions.ts                           runAction, orNotFound (Next-bound)
src/lib/accounts.ts                          requireAthletePage/requireCoachPage, requireAthlete/requireCoach
src/lib/format.ts                            formatDay (Intl)
src/lib/locale-cookie.ts                     setLocaleCookie (Next-bound)
src/i18n/locale.ts                           LOCALES, pickLocale (pure)
src/i18n/request.ts                          next-intl request config
src/i18n/messages/{es,en}.json
src/lib/training/
  errors.ts        TrainingError, ErrorCode, ActionResult
  dates.ts         IsoDate math, Timeline, visibility, monthGrid
  schemas.ts       Zod inputs, Scoring, BlockColor, Locale, parse()
  barbell.ts       liftCatalog, isLiftMovement, percentToKg, describeSets
  block-draft.ts   planner editor draft <-> BlockInput
  board.ts         planner drag and drop: where a drop lands, optimistic move
  access.ts        athleteTimeline, hasLeaderboard
  scoring.ts       score schemas, evaluateScore, formatScore            (phase 2)
  leaderboard.ts   rank                                                   (phase 2)
  prs.ts           currentOneRm, singleAbove                              (phase 2)
  services/
    types.ts       Db
    catalog.ts     assertLiftMovement
    accounts.ts    ensureAthleteAccount, ensureCoachAccount, approveCoach, updateAthleteSettings, getters
    programs.ts    create/list/get/update/archive, invite, publication
    blocks.ts      list/create/update/delete/move/duplicate
    enrollments.ts join by code, roster, athlete programs
    athlete-view.ts athlete day, visible days
    results.ts     save/delete/get result, leaderboard, fist bumps, coach result lists (phase 2)
    prs.ts         list/add/delete PRs, one-rep-max map                    (phase 2)
src/components/
  GoogleSignInButton.tsx, SignOutButton.tsx (translated), training/BlockCard.tsx
src/app/
  layout.tsx                                 html/body + NextIntlClientProvider only
  (athlete)/layout.tsx, AthleteNav.tsx
  (athlete)/page.tsx                         Today (day view)
  (athlete)/calendar/page.tsx
  (athlete)/signin, onboarding, me, join/[code]
  (athlete)/blocks/[id]/log, blocks/[id]/leaderboard                     (phase 2)
  (athlete)/prs, prs/[movement]                                          (phase 2)
  (athlete)/tailor, (athlete)/profile        engine pages, moved, unchanged URLs
  (athlete)/actions.ts, result-actions.ts, pr-actions.ts
  coach/layout.tsx, coach/page.tsx, signin, onboarding, pending
  coach/programs/new, coach/programs/[id] (planner), [id]/settings, [id]/athletes, [id]/athletes/[aid]
  coach/blocks/[id]/results                                              (phase 2)
  coach/*-actions.ts
tests/helpers/db.ts, tests/helpers/factories.ts
tests/training/*.test.ts (pure), tests/training/services/*.test.ts (PGlite), tests/i18n/*.test.ts
```

---

# Phase 1 — Programming and viewing

### Task 1: PGlite test database harness

Proven on 2026-10-08 in a throwaway spike: the generated Prisma 7 client over `@prisma/adapter-pg` talks to PGlite through `PGLiteSocketServer` (creates, interactive transactions, rollback, `P2002` on unique violations). `maxConnections` must be raised above the default or the server closes the connection after an error.

**Files:**
- Modify: `package.json` (dev dependencies)
- Modify: `vitest.config.ts`
- Create: `tests/helpers/db.ts`
- Test: `tests/helpers/db.test.ts`

**Interfaces:**
- Produces: `createTestDb(): Promise<TestDb>` with `TestDb = { prisma: PrismaClient; reset(): Promise<void>; close(): Promise<void> }`. Every later service test uses it as:

```ts
let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });
```

- [ ] **Step 1: Install the test dependencies**

```bash
pnpm add -D @electric-sql/pglite@^0.5.8 @electric-sql/pglite-socket@^0.2.11
```

- [ ] **Step 2: Write the failing test**

`tests/helpers/db.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./db";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("createTestDb", () => {
  it("applies the migrations and runs queries through Prisma", async () => {
    await tdb.prisma.user.create({ data: { id: "u1", name: "A", email: "a@test.local" } });
    expect(await tdb.prisma.user.count()).toBe(1);
  });

  it("starts every test from empty tables", async () => {
    expect(await tdb.prisma.user.count()).toBe(0);
  });

  it("rolls back interactive transactions and reports unique violations as P2002", async () => {
    await tdb.prisma.user.create({ data: { id: "u1", name: "A", email: "a@test.local" } });
    await expect(tdb.prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: "u2", name: "B", email: "b@test.local" } });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await tdb.prisma.user.count()).toBe(1);
    await expect(tdb.prisma.user.create({ data: { id: "u3", name: "C", email: "a@test.local" } }))
      .rejects.toMatchObject({ code: "P2002" });
    expect(await tdb.prisma.user.count()).toBe(1); // the connection survives the error
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test tests/helpers/db.test.ts`
Expected: FAIL, cannot resolve `./db`.

- [ ] **Step 4: Write the harness**

`tests/helpers/db.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

export interface TestDb {
  prisma: PrismaClient;
  /** Empties every table (CASCADE), keeping the schema. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS = path.resolve(process.cwd(), "prisma/migrations"); // Vitest runs from the repo root

/** An in-memory Postgres with every migration applied, reached by Prisma over loopback. */
export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  for (const dir of readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8"));
  }
  // maxConnections above the default: with 1, the server drops the connection after a query error.
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  const pool = new Pool({ connectionString: `postgresql://postgres@${server.getServerConn()}/postgres`, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const tables = (await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  )).rows.map((r) => `"${r.tablename}"`);

  return {
    prisma,
    async reset() {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(", ")} CASCADE`);
    },
    async close() {
      await prisma.$disconnect();
      await pool.end();
      await server.stop();
      await db.close();
    },
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test tests/helpers/db.test.ts`
Expected: PASS (3 tests). If PGlite needs longer than Vitest's default hook timeout on a cold start, the `60_000` on `beforeAll` covers it.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: everything green (the previous 299 tests + 3).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tests/helpers/db.ts tests/helpers/db.test.ts
git commit -m "test: in-memory Postgres harness (PGlite over loopback) for service tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Coaching schema, migration and test factories

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261008120000_coaching/migration.sql` (generated)
- Create: `tests/helpers/factories.ts`
- Test: `tests/training/services/schema.test.ts`

**Interfaces:**
- Produces (Prisma models, used by every later task): `CoachAccount`, `AthleteAccount`, `Program`, `ProgramWeek`, `Block`, `Enrollment`, `Result`, `FistBump`, `PersonalRecord`, with the compound unique keys `Enrollment.programId_athleteId`, `Result.blockId_athleteId`, `FistBump.resultId_athleteId`, `ProgramWeek.programId_weekIndex`.
- Produces (factories, `tests/helpers/factories.ts`):
  - `makeUser(db, name?): Promise<User>`
  - `makeCoach(db, status?: "pending" | "approved" | "suspended"): Promise<CoachAccount>` (default `approved`)
  - `makeAthlete(db, timezone?: string): Promise<AthleteAccount>` (default `Europe/Madrid`)
  - `makeContinuous(db, coachId, startDate?: IsoDate): Promise<Program>` (default `2026-10-05`, a Monday)
  - `makeClosed(db, coachId, weeks?: number, published?: boolean): Promise<Program>` (defaults 4, true)
  - `publishWeek(db, programId, weekIndex): Promise<void>`
  - `enroll(db, programId, athleteId, startDate?: IsoDate | null): Promise<Enrollment>`
  - `makeCustomBlock(db, programId, dayIndex, overrides?): Promise<Block>` (default scoring `for_time`, no cap)
  - `makeBarbellBlock(db, programId, dayIndex, movement?, sets?): Promise<Block>` (default `Back Squat`, `[{ reps: 5, percent: 80, kg: null }]`)

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Add the two relation fields to `model User` (after `usage LlmUsage[]`):

```prisma
  coachAccount   CoachAccount?
  athleteAccount AthleteAccount?
```

Append at the end of the file:

```prisma
// ---- Coaching ----
model CoachAccount {
  id          String    @id @default(cuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName String
  status      String    @default("pending") // "pending" | "approved" | "suspended"
  locale      String? // "es" | "en"
  createdAt   DateTime  @default(now())
  programs    Program[]
}

model AthleteAccount {
  id          String           @id @default(cuid())
  userId      String           @unique
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName String
  avatarUrl   String?
  timezone    String // IANA
  locale      String?
  createdAt   DateTime         @default(now())
  enrollments Enrollment[]
  results     Result[]
  fistBumps   FistBump[]
  records     PersonalRecord[]
}

model Program {
  id          String        @id @default(cuid())
  coachId     String
  coach       CoachAccount  @relation(fields: [coachId], references: [id], onDelete: Cascade)
  name        String
  description String?
  kind        String // "continuous" | "closed"
  startDate   DateTime?     @db.Date // continuous: the Monday of day 0
  weeks       Int? // closed: length in weeks
  publishedAt DateTime? // closed: the whole program is published
  inviteCode  String        @unique
  archivedAt  DateTime?
  createdAt   DateTime      @default(now())
  weeksPublished ProgramWeek[]
  blocks      Block[]
  enrollments Enrollment[]

  @@index([coachId])
}

model ProgramWeek {
  programId   String
  program     Program  @relation(fields: [programId], references: [id], onDelete: Cascade)
  weekIndex   Int
  publishedAt DateTime @default(now())

  @@id([programId, weekIndex])
}

model Block {
  id             String   @id @default(cuid())
  programId      String
  program        Program  @relation(fields: [programId], references: [id], onDelete: Cascade)
  dayIndex       Int
  position       Int
  kind           String // "custom" | "barbell"
  title          String?
  color          String
  coachingTips   String?
  videoUrl       String?
  description    String? // custom
  scoring        String? // custom
  timeCapSeconds Int? // custom, for_time
  movement       String? // barbell: canonical catalog name
  sets           Json? // barbell: BarbellSet[]
  instructions   String? // barbell
  updatedAt      DateTime @updatedAt
  results        Result[]

  @@index([programId, dayIndex, position])
}

model Enrollment {
  id        String         @id @default(cuid())
  programId String
  program   Program        @relation(fields: [programId], references: [id], onDelete: Cascade)
  athleteId String
  athlete   AthleteAccount @relation(fields: [athleteId], references: [id], onDelete: Cascade)
  startDate DateTime?      @db.Date // closed: the day the athlete joined, in their time zone
  joinedAt  DateTime       @default(now())
  removedAt DateTime?

  @@unique([programId, athleteId])
  @@index([athleteId])
}

model Result {
  id          String         @id @default(cuid())
  blockId     String
  block       Block          @relation(fields: [blockId], references: [id], onDelete: Cascade)
  athleteId   String
  athlete     AthleteAccount @relation(fields: [athleteId], references: [id], onDelete: Cascade)
  division    String // "rx" | "scaled"
  score       Json
  sortKey     Float? // higher is better; null for barbell results
  capped      Boolean        @default(false)
  notes       String?
  performedOn DateTime       @db.Date // the date the block is scheduled for this athlete
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  fistBumps   FistBump[]

  @@unique([blockId, athleteId])
  @@index([athleteId])
}

model FistBump {
  resultId  String
  result    Result         @relation(fields: [resultId], references: [id], onDelete: Cascade)
  athleteId String
  athlete   AthleteAccount @relation(fields: [athleteId], references: [id], onDelete: Cascade)
  createdAt DateTime       @default(now())

  @@id([resultId, athleteId])
}

model PersonalRecord {
  id         String         @id @default(cuid())
  athleteId  String
  athlete    AthleteAccount @relation(fields: [athleteId], references: [id], onDelete: Cascade)
  movement   String
  kg         Float
  achievedOn DateTime       @db.Date
  createdAt  DateTime       @default(now())

  @@index([athleteId, movement])
}
```

- [ ] **Step 2: Generate the client and the migration (offline)**

Bash:

```bash
pnpm exec prisma generate
git show main:prisma/schema.prisma > "$TEMP/schema-main.prisma"
mkdir -p prisma/migrations/20261008120000_coaching
pnpm exec prisma migrate diff --from-schema "$TEMP/schema-main.prisma" --to-schema prisma/schema.prisma --script -o prisma/migrations/20261008120000_coaching/migration.sql
```

Expected: `migration.sql` contains `CREATE TABLE "CoachAccount"` … `"PersonalRecord"` and the foreign keys, and nothing that touches the existing tables except new constraints. If it alters an existing table, stop: the schema edit went wrong.

- [ ] **Step 3: Write the factories**

`tests/helpers/factories.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

let seq = 0;
const next = () => `${++seq}-${Date.now().toString(36)}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function makeUser(db: PrismaClient, name = "User") {
  const id = next();
  return db.user.create({ data: { id: `user-${id}`, name: `${name} ${id}`, email: `${id}@test.local` } });
}

export async function makeCoach(db: PrismaClient, status: "pending" | "approved" | "suspended" = "approved") {
  const user = await makeUser(db, "Coach");
  return db.coachAccount.create({ data: { userId: user.id, displayName: user.name, status } });
}

export async function makeAthlete(db: PrismaClient, timezone = "Europe/Madrid") {
  const user = await makeUser(db, "Athlete");
  return db.athleteAccount.create({ data: { userId: user.id, displayName: user.name, timezone } });
}

export async function makeContinuous(db: PrismaClient, coachId: string, startDate = "2026-10-05") {
  return db.program.create({
    data: { coachId, name: "Daily", kind: "continuous", startDate: day(startDate), inviteCode: `inv-${next()}` },
  });
}

export async function makeClosed(db: PrismaClient, coachId: string, weeks = 4, published = true) {
  return db.program.create({
    data: {
      coachId, name: "Cycle", kind: "closed", weeks, inviteCode: `inv-${next()}`,
      publishedAt: published ? new Date() : null,
    },
  });
}

export async function publishWeek(db: PrismaClient, programId: string, weekIndex: number) {
  await db.programWeek.create({ data: { programId, weekIndex } });
}

export async function enroll(db: PrismaClient, programId: string, athleteId: string, startDate: string | null = null) {
  return db.enrollment.create({ data: { programId, athleteId, startDate: startDate ? day(startDate) : null } });
}

export async function makeCustomBlock(
  db: PrismaClient, programId: string, dayIndex: number,
  overrides: Partial<{ scoring: string; timeCapSeconds: number | null; position: number; title: string }> = {},
) {
  return db.block.create({
    data: {
      programId, dayIndex, position: overrides.position ?? 0, kind: "custom", color: "neutral",
      title: overrides.title ?? "WOD", description: "21-15-9 thrusters and pull-ups",
      scoring: overrides.scoring ?? "for_time", timeCapSeconds: overrides.timeCapSeconds ?? null,
    },
  });
}

export async function makeBarbellBlock(
  db: PrismaClient, programId: string, dayIndex: number, movement = "Back Squat",
  sets: { reps: number; percent: number | null; kg: number | null }[] = [{ reps: 5, percent: 80, kg: null }],
) {
  return db.block.create({
    data: {
      programId, dayIndex, position: 0, kind: "barbell", color: "neutral", movement,
      sets: sets as Prisma.InputJsonValue,
    },
  });
}
```

- [ ] **Step 4: Write the schema test**

`tests/training/services/schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAthlete, makeCoach, makeContinuous, makeCustomBlock } from "../../helpers/factories";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("coaching schema", () => {
  it("allows one enrollment per athlete and program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, program.id, athlete.id);
    await expect(enroll(tdb.prisma, program.id, athlete.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades a program's deletion to its blocks, enrollments and results", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, program.id, athlete.id);
    const block = await makeCustomBlock(tdb.prisma, program.id, 0);
    await tdb.prisma.result.create({
      data: {
        blockId: block.id, athleteId: athlete.id, division: "rx", score: { seconds: 300 }, sortKey: -300,
        performedOn: new Date("2026-10-05T00:00:00Z"),
      },
    });
    await tdb.prisma.program.delete({ where: { id: program.id } });
    expect(await tdb.prisma.block.count()).toBe(0);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
    expect(await tdb.prisma.result.count()).toBe(0);
  });

  it("stores calendar dates without a time zone shift", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-26");
    const read = await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } });
    expect(read.startDate?.toISOString().slice(0, 10)).toBe("2026-10-26");
  });
});
```

- [ ] **Step 5: Run it**

Run: `pnpm test tests/training/services/schema.test.ts`
Expected: PASS (3 tests). The harness applies the new migration automatically.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm exec tsc --noEmit` — expected clean.

```bash
git add prisma/schema.prisma prisma/migrations/20261008120000_coaching tests/helpers/factories.ts tests/training/services/schema.test.ts
git commit -m "feat: coaching schema (accounts, programs, blocks, enrollments, results, PRs) under migrations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Calendar dates and program timelines (`dates.ts`)

**Files:**
- Create: `src/lib/training/dates.ts`
- Test: `tests/training/dates.test.ts`

**Interfaces:**
- Produces:
  - `type IsoDate = string`
  - `isIsoDate(v: string): boolean`, `toDbDate(d: IsoDate): Date`, `fromDbDate(d: Date): IsoDate`
  - `addDays(d: IsoDate, n: number): IsoDate`, `daysBetween(from: IsoDate, to: IsoDate): number`
  - `isMonday(d: IsoDate): boolean`, `mondayOf(d: IsoDate): IsoDate`, `weekIndexOf(dayIndex: number): number`
  - `isValidTimeZone(tz: string): boolean`, `todayIn(tz: string, now?: Date): IsoDate`
  - `monthGrid(month: string /* YYYY-MM */): IsoDate[][]` — Monday-first weeks covering the month
  - `type Timeline = { kind: "continuous"; startDate: IsoDate; publishedWeeks: ReadonlySet<number> } | { kind: "closed"; startDate: IsoDate; weeks: number; published: boolean }`
  - `dateOfDay(t, dayIndex): IsoDate`, `inRange(t, dayIndex): boolean`, `dayIndexOf(t, date): number | null`, `isDayVisible(t, dayIndex): boolean`, `canLogDay(t, dayIndex, today: IsoDate): boolean`

- [ ] **Step 1: Write the failing test**

`tests/training/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  addDays, canLogDay, dateOfDay, dayIndexOf, daysBetween, fromDbDate, inRange, isDayVisible, isIsoDate,
  isMonday, isValidTimeZone, mondayOf, monthGrid, toDbDate, todayIn, weekIndexOf, type Timeline,
} from "@/lib/training/dates";

describe("calendar arithmetic", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-10-08")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-10-8")).toBe(false);
  });

  it("adds days across month ends and the October DST change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // Europe switches on 2026-10-25
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-05", "2026-11-02")).toBe(28);
  });

  it("round-trips database dates", () => {
    expect(fromDbDate(toDbDate("2026-10-26"))).toBe("2026-10-26");
  });

  it("knows Mondays and week indexes", () => {
    expect(isMonday("2026-10-05")).toBe(true);
    expect(isMonday("2026-10-07")).toBe(false);
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week that started Monday
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(weekIndexOf(0)).toBe(0);
    expect(weekIndexOf(6)).toBe(0);
    expect(weekIndexOf(7)).toBe(1);
  });

  it("computes today in the athlete's time zone", () => {
    const now = new Date("2026-10-07T23:30:00Z");
    expect(todayIn("Europe/Madrid", now)).toBe("2026-10-08");
    expect(todayIn("America/New_York", now)).toBe("2026-10-07");
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("builds Monday-first month grids", () => {
    const grid = monthGrid("2026-10");
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid[0][3]).toBe("2026-10-01");
    expect(grid.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
});

describe("timelines", () => {
  const continuous: Timeline = { kind: "continuous", startDate: "2026-10-05", publishedWeeks: new Set([0]) };
  const closed: Timeline = { kind: "closed", startDate: "2026-10-08", weeks: 2, published: true };

  it("maps day indexes to dates and back", () => {
    expect(dateOfDay(continuous, 2)).toBe("2026-10-07");
    expect(dayIndexOf(continuous, "2026-10-07")).toBe(2);
    expect(dayIndexOf(continuous, "2026-10-04")).toBeNull(); // before day 0
    expect(dateOfDay(closed, 0)).toBe("2026-10-08");
    expect(dayIndexOf(closed, "2026-10-22")).toBeNull(); // day 14 is past a 2-week program
    expect(inRange(closed, 13)).toBe(true);
    expect(inRange(closed, 14)).toBe(false);
  });

  it("shows only published weeks of a continuous program", () => {
    expect(isDayVisible(continuous, 6)).toBe(true);
    expect(isDayVisible(continuous, 7)).toBe(false);
  });

  it("shows a closed program only once published", () => {
    expect(isDayVisible(closed, 3)).toBe(true);
    expect(isDayVisible({ ...closed, published: false }, 3)).toBe(false);
  });

  it("allows logging visible days that have arrived", () => {
    expect(canLogDay(continuous, 2, "2026-10-07")).toBe(true);
    expect(canLogDay(continuous, 3, "2026-10-07")).toBe(false); // tomorrow
    expect(canLogDay(continuous, 0, "2026-10-20")).toBe(true); // the past stays loggable
    expect(canLogDay(continuous, 8, "2026-10-20")).toBe(false); // week 1 is not published
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/training/dates.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/lib/training/dates.ts`:

```ts
/** Calendar dates as ISO strings (YYYY-MM-DD). All arithmetic runs in UTC, so DST never shifts a day. */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}

export function isMonday(date: IsoDate): boolean {
  return toDbDate(date).getUTCDay() === 1;
}

export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, -((toDbDate(date).getUTCDay() + 6) % 7));
}

export function weekIndexOf(dayIndex: number): number {
  return Math.floor(dayIndex / 7);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Monday-first weeks covering the month `YYYY-MM`. */
export function monthGrid(month: string): IsoDate[][] {
  const first = `${month}-01`;
  const nextMonthFirst = fromDbDate(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)));
  const weeks: IsoDate[][] = [];
  for (let monday = mondayOf(first); monday < nextMonthFirst; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

export type Timeline =
  | { kind: "continuous"; startDate: IsoDate; publishedWeeks: ReadonlySet<number> }
  | { kind: "closed"; startDate: IsoDate; weeks: number; published: boolean };

export function dateOfDay(t: Timeline, dayIndex: number): IsoDate {
  return addDays(t.startDate, dayIndex);
}

export function inRange(t: Timeline, dayIndex: number): boolean {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false;
  return t.kind === "continuous" || dayIndex < t.weeks * 7;
}

export function dayIndexOf(t: Timeline, date: IsoDate): number | null {
  const index = daysBetween(t.startDate, date);
  return inRange(t, index) ? index : null;
}

export function isDayVisible(t: Timeline, dayIndex: number): boolean {
  if (!inRange(t, dayIndex)) return false;
  return t.kind === "continuous" ? t.publishedWeeks.has(weekIndexOf(dayIndex)) : t.published;
}

export function canLogDay(t: Timeline, dayIndex: number, today: IsoDate): boolean {
  return isDayVisible(t, dayIndex) && dateOfDay(t, dayIndex) <= today;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/training/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/dates.ts tests/training/dates.test.ts
git commit -m "feat: calendar dates and program timelines (visibility, logging window, month grid)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Errors, action inputs and barbell helpers

**Files:**
- Create: `src/lib/training/errors.ts`
- Create: `src/lib/training/schemas.ts`
- Create: `src/lib/training/barbell.ts`
- Create: `src/lib/training/block-draft.ts`
- Test: `tests/training/schemas.test.ts`, `tests/training/barbell.test.ts`, `tests/training/block-draft.test.ts`

**Interfaces:**
- Consumes: `isIsoDate`, `isMonday`, `isValidTimeZone` (Task 3); `Movement` from `@/lib/domain/types`.
- Produces (`errors.ts`):
  - `ERROR_CODES` (readonly tuple), `type ErrorCode`
  - `class TrainingError extends Error { code: ErrorCode }`
  - `type ActionResult<T = void> = { ok: true; value: T } | { ok: false; code: ErrorCode }`
- Produces (`schemas.ts`):
  - `Scoring` (enum: `none for_time amrap reps load calories distance max_time`), `type Scoring`
  - `Division` (enum `rx scaled`), `BlockColor` + `BLOCK_COLORS`, `Locale` (enum `es en`)
  - `BarbellSetSchema`, `type BarbellSet = { reps: number; percent: number | null; kg: number | null }`
  - `ProgramCreateInput`, `type ProgramCreate`; `ProgramUpdateInput`, `type ProgramUpdate`
  - `BlockInput`, `type BlockInputValue` (discriminated on `kind`)
  - `OnboardingInput` (`{ timezone: string }`), `AthleteSettingsInput` (`{ displayName, timezone, locale }`), `type AthleteSettings`
  - `parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S>` — throws `TrainingError("invalid_request")`
- Produces (`barbell.ts`): `liftCatalog(movements): LiftGroup[]` with `LiftGroup = { pattern: string; movements: string[] }`, `isLiftMovement(name, movements): boolean`, `percentToKg(percent, oneRm): number`, `describeSets(sets: readonly BarbellSet[], oneRm: number | null): string[]`
- Produces (`block-draft.ts`): `type BlockDraft`, `emptyDraft(kind): BlockDraft`, `draftFromBlock(block: DraftSource): BlockDraft`, `draftToInput(d: BlockDraft): unknown` (the object sent to the block actions)

- [ ] **Step 1: Write the failing tests**

`tests/training/schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ERROR_CODES, TrainingError } from "@/lib/training/errors";
import {
  AthleteSettingsInput, BlockInput, ProgramCreateInput, ProgramUpdateInput, parse,
} from "@/lib/training/schemas";

describe("ProgramCreateInput", () => {
  it("accepts a continuous program starting on a Monday", () => {
    const v = parse(ProgramCreateInput, { kind: "continuous", name: " Daily RX ", description: "", startDate: "2026-10-05" });
    expect(v).toEqual({ kind: "continuous", name: "Daily RX", description: null, startDate: "2026-10-05" });
  });

  it("rejects a continuous program that does not start on a Monday", () => {
    expect(() => parse(ProgramCreateInput, { kind: "continuous", name: "Daily", description: null, startDate: "2026-10-07" }))
      .toThrow(TrainingError);
  });

  it("accepts a closed program of 1 to 52 weeks", () => {
    expect(parse(ProgramCreateInput, { kind: "closed", name: "Cycle", description: null, weeks: 8 }).kind).toBe("closed");
    expect(() => parse(ProgramCreateInput, { kind: "closed", name: "Cycle", description: null, weeks: 53 })).toThrow();
  });

  it("allows partial date/length changes on update", () => {
    expect(parse(ProgramUpdateInput, { name: "X", description: null })).toEqual({ name: "X", description: null });
  });
});

describe("BlockInput", () => {
  const common = { title: "", color: "red", coachingTips: "", videoUrl: "" };

  it("normalizes blank optional text to null", () => {
    const v = parse(BlockInput, { kind: "custom", ...common, description: "AMRAP 12", scoring: "amrap", timeCapSeconds: null });
    expect(v).toMatchObject({ title: null, coachingTips: null, videoUrl: null });
  });

  it("only allows a time cap on for_time blocks", () => {
    expect(() => parse(BlockInput, { kind: "custom", ...common, description: "x", scoring: "amrap", timeCapSeconds: 600 })).toThrow();
    expect(parse(BlockInput, { kind: "custom", ...common, description: "x", scoring: "for_time", timeCapSeconds: 600 }))
      .toMatchObject({ timeCapSeconds: 600 });
  });

  it("accepts only https video links", () => {
    expect(() => parse(BlockInput, { kind: "custom", ...common, videoUrl: "http://x.com/v", description: "x", scoring: "none", timeCapSeconds: null })).toThrow();
    expect(parse(BlockInput, { kind: "custom", ...common, videoUrl: "https://youtu.be/abc", description: "x", scoring: "none", timeCapSeconds: null }))
      .toMatchObject({ videoUrl: "https://youtu.be/abc" });
  });

  it("requires exactly one of percent or kg per barbell set", () => {
    const base = { kind: "barbell", ...common, movement: "Back Squat", instructions: "" };
    expect(parse(BlockInput, { ...base, sets: [{ reps: 5, percent: 80, kg: null }] }).kind).toBe("barbell");
    expect(() => parse(BlockInput, { ...base, sets: [{ reps: 5, percent: 80, kg: 100 }] })).toThrow();
    expect(() => parse(BlockInput, { ...base, sets: [{ reps: 5, percent: null, kg: null }] })).toThrow();
    expect(() => parse(BlockInput, { ...base, sets: [] })).toThrow();
  });

  it("rejects unknown colors", () => {
    expect(() => parse(BlockInput, { kind: "custom", ...common, color: "pink", description: "x", scoring: "none", timeCapSeconds: null })).toThrow();
  });
});

describe("AthleteSettingsInput", () => {
  it("validates the time zone and the locale", () => {
    expect(parse(AthleteSettingsInput, { displayName: "Ana", timezone: "Europe/Madrid", locale: "es" }).locale).toBe("es");
    expect(() => parse(AthleteSettingsInput, { displayName: "Ana", timezone: "Mars/Base", locale: "es" })).toThrow();
    expect(() => parse(AthleteSettingsInput, { displayName: "Ana", timezone: "Europe/Madrid", locale: "fr" })).toThrow();
  });
});

describe("parse", () => {
  it("throws invalid_request", () => {
    try {
      parse(AthleteSettingsInput, null);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TrainingError);
      expect((e as TrainingError).code).toBe("invalid_request");
    }
  });

  it("knows every error code once", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
```

`tests/training/barbell.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDomainData } from "@/lib/domain/repository";
import { describeSets, isLiftMovement, liftCatalog, percentToKg } from "@/lib/training/barbell";

describe("liftCatalog", () => {
  it("groups barbell movements by their first pattern, squats first", async () => {
    const { movements } = await getDomainData();
    const groups = liftCatalog(movements);
    expect(groups[0].pattern).toBe("squat");
    expect(groups[0].movements).toContain("Back Squat");
    const all = groups.flatMap((g) => g.movements);
    expect(all).not.toContain("Pull-up");
    expect(new Set(all).size).toBe(all.length);
  });

  it("recognizes lift movements by exact name", async () => {
    const { movements } = await getDomainData();
    expect(isLiftMovement("Back Squat", movements)).toBe(true);
    expect(isLiftMovement("back squat", movements)).toBe(false);
    expect(isLiftMovement("Air Squat", movements)).toBe(false);
  });
});

describe("percentToKg", () => {
  it("rounds to the nearest 0.5 kg", () => {
    expect(percentToKg(80, 125)).toBe(100);
    expect(percentToKg(73, 101)).toBe(73.5); // 73.73
    expect(percentToKg(70, 101)).toBe(70.5); // 70.7
  });
});

describe("describeSets", () => {
  it("collapses identical consecutive sets", () => {
    expect(describeSets([{ reps: 5, percent: 80, kg: null }, { reps: 5, percent: 80, kg: null }, { reps: 5, percent: 80, kg: null }], null))
      .toEqual(["3 × 5 @ 80 %"]);
  });

  it("shows kg next to percentages when a 1RM is known", () => {
    expect(describeSets([{ reps: 3, percent: 85, kg: null }], 120)).toEqual(["3 @ 85 % (102 kg)"]);
  });

  it("keeps different sets on their own lines and prints fixed loads", () => {
    expect(describeSets([{ reps: 5, percent: null, kg: 60 }, { reps: 3, percent: null, kg: 70 }], null))
      .toEqual(["5 @ 60 kg", "3 @ 70 kg"]);
  });
});
```

`tests/training/block-draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BlockInput, parse } from "@/lib/training/schemas";
import { draftFromBlock, draftToInput, emptyDraft } from "@/lib/training/block-draft";

describe("block drafts", () => {
  it("turns an empty custom draft into a valid input once described", () => {
    const d = { ...emptyDraft("custom"), description: "Fran", scoring: "for_time" as const, timeCapMinutes: "10" };
    expect(parse(BlockInput, draftToInput(d))).toMatchObject({ kind: "custom", timeCapSeconds: 600, title: null });
  });

  it("drops the time cap when the scoring is not for_time", () => {
    const d = { ...emptyDraft("custom"), description: "AMRAP", scoring: "amrap" as const, timeCapMinutes: "10" };
    expect(parse(BlockInput, draftToInput(d))).toMatchObject({ timeCapSeconds: null });
  });

  it("maps barbell rows to percent or kg", () => {
    const d = {
      ...emptyDraft("barbell"), movement: "Deadlift",
      sets: [{ reps: "5", mode: "percent" as const, value: "80" }, { reps: "3", mode: "kg" as const, value: "150" }],
    };
    expect(parse(BlockInput, draftToInput(d))).toMatchObject({
      sets: [{ reps: 5, percent: 80, kg: null }, { reps: 3, percent: null, kg: 150 }],
    });
  });

  it("round-trips a stored block", () => {
    const stored = {
      kind: "barbell", title: "Strength", color: "blue", coachingTips: null, videoUrl: null, description: null,
      scoring: null, timeCapSeconds: null, movement: "Deadlift", instructions: "Belt allowed",
      sets: [{ reps: 5, percent: 80, kg: null }],
    };
    expect(parse(BlockInput, draftToInput(draftFromBlock(stored)))).toMatchObject({
      kind: "barbell", title: "Strength", color: "blue", movement: "Deadlift", instructions: "Belt allowed",
      sets: [{ reps: 5, percent: 80, kg: null }],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/training/schemas.test.ts tests/training/barbell.test.ts tests/training/block-draft.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `errors.ts`**

```ts
export const ERROR_CODES = [
  "unauthorized",
  "not_found",
  "invalid_request",
  "coach_pending",
  "program_archived",
  "start_date_locked",
  "weeks_out_of_range",
  "day_out_of_range",
  "scoring_locked",
  "invite_invalid",
  "enrollment_removed",
  "not_loggable",
  "invalid_score",
  "own_result",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** A refusal the user can be told about; its code maps to `errors.<code>` in the messages. */
export class TrainingError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "TrainingError";
  }
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; code: ErrorCode };
```

- [ ] **Step 4: Implement `schemas.ts`**

```ts
import { z } from "zod";
import { isIsoDate, isMonday, isValidTimeZone } from "./dates";
import { TrainingError } from "./errors";

export const Scoring = z.enum(["none", "for_time", "amrap", "reps", "load", "calories", "distance", "max_time"]);
export type Scoring = z.infer<typeof Scoring>;
export const Division = z.enum(["rx", "scaled"]);
export type Division = z.infer<typeof Division>;
export const BLOCK_COLORS = ["neutral", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export const BlockColor = z.enum(BLOCK_COLORS);
export type BlockColor = z.infer<typeof BlockColor>;
export const Locale = z.enum(["es", "en"]);

/** Optional free text: trimmed, blank becomes null. */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
const Name = (max: number) => z.string().trim().min(1).max(max);
const IsoDateString = z.string().refine(isIsoDate, "invalid date");
const MondayDate = IsoDateString.refine(isMonday, "not a Monday");
const Weeks = z.number().int().min(1).max(52);

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
const VideoUrl = z.string().trim().nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isHttpsUrl(v), "https only");

export const ProgramCreateInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("continuous"), name: Name(80), description: optionalText(500), startDate: MondayDate }),
  z.object({ kind: z.literal("closed"), name: Name(80), description: optionalText(500), weeks: Weeks }),
]);
export type ProgramCreate = z.output<typeof ProgramCreateInput>;

export const ProgramUpdateInput = z.object({
  name: Name(80),
  description: optionalText(500),
  startDate: MondayDate.optional(),
  weeks: Weeks.optional(),
});
export type ProgramUpdate = z.output<typeof ProgramUpdateInput>;

export const BarbellSetSchema = z.object({
  reps: z.number().int().min(1).max(100),
  percent: z.number().positive().max(150).nullable(),
  kg: z.number().positive().max(500).nullable(),
}).refine((s) => (s.percent === null) !== (s.kg === null), "exactly one of percent or kg");
export type BarbellSet = z.output<typeof BarbellSetSchema>;

const blockCommon = {
  title: optionalText(120),
  color: BlockColor,
  coachingTips: optionalText(2000),
  videoUrl: VideoUrl,
};

export const BlockInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("custom"),
    ...blockCommon,
    description: z.string().trim().min(1).max(5000),
    scoring: Scoring,
    timeCapSeconds: z.number().int().min(1).max(7200).nullable(),
  }),
  z.object({
    kind: z.literal("barbell"),
    ...blockCommon,
    movement: z.string().trim().min(1).max(80),
    sets: z.array(BarbellSetSchema).min(1).max(20),
    instructions: optionalText(2000),
  }),
]).superRefine((b, ctx) => {
  if (b.kind === "custom" && b.scoring !== "for_time" && b.timeCapSeconds !== null) {
    ctx.addIssue({ code: "custom", message: "time cap only for for_time", path: ["timeCapSeconds"] });
  }
});
export type BlockInputValue = z.output<typeof BlockInput>;

export const OnboardingInput = z.object({ timezone: z.string().max(64) });

export const AthleteSettingsInput = z.object({
  displayName: Name(60),
  timezone: z.string().refine(isValidTimeZone, "invalid time zone"),
  locale: Locale,
});
export type AthleteSettings = z.output<typeof AthleteSettingsInput>;

/** Parses action input; any mismatch is an `invalid_request`, never a Zod message. */
export function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new TrainingError("invalid_request");
  return result.data;
}
```

- [ ] **Step 5: Implement `barbell.ts`**

```ts
import type { Movement } from "@/lib/domain/types";
import type { BarbellSet } from "./schemas";

export type LiftGroup = { pattern: string; movements: string[] };

const PATTERN_ORDER = ["squat", "hinge", "olympic", "vertical_push", "horizontal_push", "lunge", "horizontal_pull", "vertical_pull"];

const isLift = (m: Movement) => m.equipment.includes("barbell");

/** Barbell movements (the ones a 1RM applies to), grouped by their first pattern. */
export function liftCatalog(movements: readonly Movement[]): LiftGroup[] {
  const groups = new Map<string, string[]>();
  for (const m of movements.filter(isLift)) {
    const pattern = m.patterns[0];
    groups.set(pattern, [...(groups.get(pattern) ?? []), m.name]);
  }
  const rank = (p: string) => (PATTERN_ORDER.includes(p) ? PATTERN_ORDER.indexOf(p) : PATTERN_ORDER.length);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([pattern, names]) => ({ pattern, movements: [...names].sort((x, y) => x.localeCompare(y)) }));
}

export function isLiftMovement(name: string, movements: readonly Movement[]): boolean {
  return movements.some((m) => m.name === name && isLift(m));
}

export function percentToKg(percent: number, oneRm: number): number {
  return Math.round((percent / 100) * oneRm * 2) / 2;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const sameSet = (a: BarbellSet, b: BarbellSet) => a.reps === b.reps && a.percent === b.percent && a.kg === b.kg;

/** "3 × 5 @ 80 % (100 kg)" lines, collapsing identical consecutive sets. */
export function describeSets(sets: readonly BarbellSet[], oneRm: number | null): string[] {
  const lines: string[] = [];
  for (let i = 0; i < sets.length;) {
    let j = i;
    while (j + 1 < sets.length && sameSet(sets[j + 1], sets[i])) j++;
    const s = sets[i];
    const load = s.percent !== null
      ? `${num(s.percent)} %${oneRm !== null ? ` (${num(percentToKg(s.percent, oneRm))} kg)` : ""}`
      : `${num(s.kg as number)} kg`;
    const count = j - i + 1;
    lines.push(`${count > 1 ? `${count} × ` : ""}${s.reps} @ ${load}`);
    i = j + 1;
  }
  return lines;
}
```

- [ ] **Step 6: Implement `block-draft.ts`**

```ts
import type { BarbellSet, BlockColor, Scoring } from "./schemas";

export type DraftSet = { reps: string; mode: "percent" | "kg"; value: string };

/** The planner editor's form state: strings as typed, converted to a BlockInput on save. */
export type BlockDraft = {
  kind: "custom" | "barbell";
  title: string;
  color: BlockColor;
  coachingTips: string;
  videoUrl: string;
  description: string;
  scoring: Scoring;
  timeCapMinutes: string;
  movement: string;
  sets: DraftSet[];
  instructions: string;
};

/** The stored fields a draft is built from (a Block row or its serialized form). */
export type DraftSource = {
  kind: string; title: string | null; color: string; coachingTips: string | null; videoUrl: string | null;
  description: string | null; scoring: string | null; timeCapSeconds: number | null;
  movement: string | null; sets: unknown; instructions: string | null;
};

export function emptyDraft(kind: BlockDraft["kind"]): BlockDraft {
  return {
    kind, title: "", color: "neutral", coachingTips: "", videoUrl: "", description: "", scoring: "none",
    timeCapMinutes: "", movement: "", sets: [{ reps: "5", mode: "percent", value: "" }], instructions: "",
  };
}

export function draftFromBlock(b: DraftSource): BlockDraft {
  const sets = Array.isArray(b.sets) ? (b.sets as BarbellSet[]) : [];
  return {
    ...emptyDraft(b.kind === "barbell" ? "barbell" : "custom"),
    title: b.title ?? "",
    color: b.color as BlockColor,
    coachingTips: b.coachingTips ?? "",
    videoUrl: b.videoUrl ?? "",
    description: b.description ?? "",
    scoring: (b.scoring ?? "none") as Scoring,
    timeCapMinutes: b.timeCapSeconds ? String(b.timeCapSeconds / 60) : "",
    movement: b.movement ?? "",
    sets: sets.length
      ? sets.map((s) => ({ reps: String(s.reps), mode: s.percent !== null ? "percent" : "kg", value: String(s.percent ?? s.kg) }))
      : emptyDraft("barbell").sets,
    instructions: b.instructions ?? "",
  };
}

const toNumber = (s: string) => (s.trim() === "" ? NaN : Number(s));

/** The object sent to the block actions; the server validates it with `BlockInput`. */
export function draftToInput(d: BlockDraft): unknown {
  const common = { title: d.title, color: d.color, coachingTips: d.coachingTips, videoUrl: d.videoUrl };
  if (d.kind === "custom") {
    const minutes = toNumber(d.timeCapMinutes);
    return {
      kind: "custom", ...common, description: d.description, scoring: d.scoring,
      timeCapSeconds: d.scoring === "for_time" && Number.isFinite(minutes) ? Math.round(minutes * 60) : null,
    };
  }
  return {
    kind: "barbell", ...common, movement: d.movement, instructions: d.instructions,
    sets: d.sets.map((s) => ({
      reps: toNumber(s.reps),
      percent: s.mode === "percent" ? toNumber(s.value) : null,
      kg: s.mode === "kg" ? toNumber(s.value) : null,
    })),
  };
}
```

- [ ] **Step 7: Run the tests**

Run: `pnpm test tests/training`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/training/errors.ts src/lib/training/schemas.ts src/lib/training/barbell.ts src/lib/training/block-draft.ts tests/training/schemas.test.ts tests/training/barbell.test.ts tests/training/block-draft.test.ts
git commit -m "feat: training error codes, action input schemas, barbell helpers and planner drafts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Accounts (services, page/action guards, coach approval script)

**Files:**
- Create: `src/lib/training/services/types.ts`
- Create: `src/lib/training/services/accounts.ts`
- Create: `src/lib/actions.ts`
- Create: `src/lib/accounts.ts`
- Modify: `src/lib/session.ts`
- Create: `scripts/approve-coach.ts`
- Modify: `package.json` (script `coach:approve`)
- Test: `tests/training/services/accounts.test.ts`

**Interfaces:**
- Consumes: `TrainingError`, `ActionResult` (Task 4), `isValidTimeZone` (Task 3), `AthleteSettings` (Task 4), factories (Task 2).
- Produces:
  - `type Db = PrismaClient` (`services/types.ts`)
  - `ensureAthleteAccount(db, user: { id; name; image: string | null }, opts: { timezone: string; locale: "es" | "en" }): Promise<AthleteAccount>` — creates once, never overwrites
  - `ensureCoachAccount(db, user: { id; name }, opts: { locale: "es" | "en" }): Promise<CoachAccount>` — creates `pending` once
  - `approveCoach(db, email): Promise<"approved" | "not_found">`
  - `updateAthleteSettings(db, athleteId, s: AthleteSettings): Promise<AthleteAccount>`
  - `getAthleteByUserId(db, userId)`, `getCoachByUserId(db, userId)` → account or `null`
  - `getSessionUser()` now returns `{ id; name; email; image: string | null } | null`
  - `runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>>`, `orNotFound<T>(p: Promise<T>): Promise<T>` (`src/lib/actions.ts`)
  - `requireAthletePage(next?: string): Promise<AthleteAccount>`, `requireCoachPage(): Promise<CoachAccount>`, `requireAthlete(): Promise<AthleteAccount>`, `requireCoach(): Promise<CoachAccount>` (`src/lib/accounts.ts`)

- [ ] **Step 1: Write the failing test**

`tests/training/services/accounts.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeUser } from "../../helpers/factories";
import {
  approveCoach, ensureAthleteAccount, ensureCoachAccount, getAthleteByUserId, getCoachByUserId, updateAthleteSettings,
} from "@/lib/training/services/accounts";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("accounts", () => {
  it("creates the athlete account once from the Google profile", async () => {
    const user = await makeUser(tdb.prisma, "Ana");
    const a = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: "https://img/a.png" }, { timezone: "Europe/Madrid", locale: "es" });
    expect(a).toMatchObject({ displayName: user.name, avatarUrl: "https://img/a.png", timezone: "Europe/Madrid", locale: "es" });
    const again = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: "Other", image: null }, { timezone: "UTC", locale: "en" });
    expect(again.id).toBe(a.id);
    expect(again.timezone).toBe("Europe/Madrid"); // never overwritten by a later sign-in
  });

  it("falls back to UTC for an invalid browser time zone", async () => {
    const user = await makeUser(tdb.prisma);
    const a = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: null }, { timezone: "Mars/Base", locale: "es" });
    expect(a.timezone).toBe("UTC");
  });

  it("keeps the coach and athlete profiles independent", async () => {
    const user = await makeUser(tdb.prisma);
    await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: null }, { timezone: "UTC", locale: "es" });
    const coach = await ensureCoachAccount(tdb.prisma, { id: user.id, name: user.name }, { locale: "es" });
    expect(coach.status).toBe("pending");
    expect(await getAthleteByUserId(tdb.prisma, user.id)).not.toBeNull();
    expect(await getCoachByUserId(tdb.prisma, user.id)).not.toBeNull();
  });

  it("approves a coach by email", async () => {
    const user = await makeUser(tdb.prisma);
    await ensureCoachAccount(tdb.prisma, { id: user.id, name: user.name }, { locale: "es" });
    expect(await approveCoach(tdb.prisma, user.email)).toBe("approved");
    expect((await getCoachByUserId(tdb.prisma, user.id))?.status).toBe("approved");
    expect(await approveCoach(tdb.prisma, "nobody@test.local")).toBe("not_found");
  });

  it("updates the athlete's settings", async () => {
    const user = await makeUser(tdb.prisma);
    const a = await ensureAthleteAccount(tdb.prisma, { id: user.id, name: user.name, image: null }, { timezone: "UTC", locale: "es" });
    const updated = await updateAthleteSettings(tdb.prisma, a.id, { displayName: "Ana G.", timezone: "America/Mexico_City", locale: "en" });
    expect(updated).toMatchObject({ displayName: "Ana G.", timezone: "America/Mexico_City", locale: "en" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/training/services/accounts.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the service**

`src/lib/training/services/types.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client";

/** Services take the client as an argument: the app passes `@/lib/db`, tests pass PGlite. */
export type Db = PrismaClient;
```

`src/lib/training/services/accounts.ts`:

```ts
import { isValidTimeZone } from "../dates";
import type { AthleteSettings } from "../schemas";
import type { Db } from "./types";

type AppLocale = "es" | "en";

export async function ensureAthleteAccount(
  db: Db, user: { id: string; name: string; image: string | null }, opts: { timezone: string; locale: AppLocale },
) {
  return db.athleteAccount.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      displayName: user.name.trim().slice(0, 60) || "Athlete",
      avatarUrl: user.image,
      timezone: isValidTimeZone(opts.timezone) ? opts.timezone : "UTC",
      locale: opts.locale,
    },
  });
}

export async function ensureCoachAccount(db: Db, user: { id: string; name: string }, opts: { locale: AppLocale }) {
  return db.coachAccount.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, displayName: user.name.trim().slice(0, 60) || "Coach", locale: opts.locale },
  });
}

export async function approveCoach(db: Db, email: string): Promise<"approved" | "not_found"> {
  const user = await db.user.findUnique({ where: { email }, include: { coachAccount: true } });
  if (!user?.coachAccount) return "not_found";
  await db.coachAccount.update({ where: { id: user.coachAccount.id }, data: { status: "approved" } });
  return "approved";
}

export async function updateAthleteSettings(db: Db, athleteId: string, s: AthleteSettings) {
  return db.athleteAccount.update({
    where: { id: athleteId },
    data: { displayName: s.displayName, timezone: s.timezone, locale: s.locale },
  });
}

export function getAthleteByUserId(db: Db, userId: string) {
  return db.athleteAccount.findUnique({ where: { userId } });
}

export function getCoachByUserId(db: Db, userId: string) {
  return db.coachAccount.findUnique({ where: { userId } });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/training/services/accounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the image to the session user**

In `src/lib/session.ts`, replace `getSessionUser` with:

```ts
export async function getSessionUser(): Promise<{ id: string; name: string; email: string; image: string | null } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session
    ? { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null }
    : null;
}
```

- [ ] **Step 6: Write the Next-bound helpers (no unit tests: they only wire Next to tested code)**

`src/lib/actions.ts`:

```ts
import { notFound, unstable_rethrow } from "next/navigation";
import { TrainingError, type ActionResult } from "@/lib/training/errors";

/** Runs a Server Action body: refusals become codes, anything else is logged and becomes `internal`. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof TrainingError) return { ok: false, code: e.code };
    console.error("[action] failed", e);
    return { ok: false, code: "internal" };
  }
}

/** For pages: a service's `not_found` becomes the 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof TrainingError && e.code === "not_found") notFound();
    throw e;
  }
}
```

`src/lib/accounts.ts`:

```ts
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TrainingError } from "@/lib/training/errors";
import { getAthleteByUserId, getCoachByUserId } from "@/lib/training/services/accounts";

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

/** Pages of the athlete zone: sign-in, then onboarding, then the page. */
export async function requireAthletePage(next?: string) {
  const user = await getSessionUser();
  if (!user) redirect(withNext("/signin", next));
  const athlete = await getAthleteByUserId(prisma, user.id);
  if (!athlete) redirect(withNext("/onboarding", next));
  return athlete;
}

/** Pages of the coach zone: sign-in, onboarding, approval, then the page. */
export async function requireCoachPage() {
  const user = await getSessionUser();
  if (!user) redirect("/coach/signin");
  const coach = await getCoachByUserId(prisma, user.id);
  if (!coach) redirect("/coach/onboarding");
  if (coach.status !== "approved") redirect("/coach/pending");
  return coach;
}

export async function requireAthlete() {
  const user = await getSessionUser();
  if (!user) throw new TrainingError("unauthorized");
  const athlete = await getAthleteByUserId(prisma, user.id);
  if (!athlete) throw new TrainingError("unauthorized");
  return athlete;
}

export async function requireCoach() {
  const user = await getSessionUser();
  if (!user) throw new TrainingError("unauthorized");
  const coach = await getCoachByUserId(prisma, user.id);
  if (!coach) throw new TrainingError("unauthorized");
  if (coach.status !== "approved") throw new TrainingError("coach_pending");
  return coach;
}
```

- [ ] **Step 7: Write the approval script**

`scripts/approve-coach.ts`:

```ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { approveCoach } from "../src/lib/training/services/accounts";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm coach:approve <email>");
    process.exit(1);
  }
  const outcome = await approveCoach(prisma, email);
  console.log(outcome === "approved" ? `Approved coach ${email}` : `No coach account for ${email} (they must sign in at /coach/signin first)`);
  await prisma.$disconnect();
  process.exit(outcome === "approved" ? 0 : 2);
}

main();
```

Add to `package.json` `scripts`: `"coach:approve": "tsx scripts/approve-coach.ts"`.

- [ ] **Step 8: Typecheck, run the suite, commit**

Run: `pnpm exec tsc --noEmit && pnpm test` — expected clean and green.

```bash
git add src/lib/training/services/types.ts src/lib/training/services/accounts.ts src/lib/actions.ts src/lib/accounts.ts src/lib/session.ts scripts/approve-coach.ts package.json tests/training/services/accounts.test.ts
git commit -m "feat: coach and athlete accounts, page/action guards and the coach approval script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: i18n base, the two zone layouts and the session gate

**Files:**
- Modify: `package.json` (dependency `next-intl`), `next.config.ts`
- Create: `src/i18n/locale.ts`, `src/i18n/request.ts`, `src/i18n/messages/es.json`, `src/i18n/messages/en.json`
- Create: `src/lib/locale-cookie.ts`, `src/lib/routes.ts`, `src/lib/format.ts`
- Modify: `src/app/layout.tsx`, `src/proxy.ts`, `src/components/SignOutButton.tsx`
- Create: `src/app/(athlete)/layout.tsx`, `src/app/(athlete)/AthleteNav.tsx`, `src/app/(athlete)/page.tsx` (placeholder, replaced in Task 12)
- Create: `src/app/coach/layout.tsx`
- Move: `src/app/tailor` → `src/app/(athlete)/tailor`, `src/app/profile` → `src/app/(athlete)/profile` (URLs unchanged)
- Delete: `src/app/page.tsx`, `src/app/signin/page.tsx` (the athlete sign-in is rebuilt in Task 7)
- Test: `tests/i18n/locale.test.ts`, `tests/i18n/messages.test.ts`, `tests/lib/routes.test.ts`

**Interfaces:**
- Consumes: `ERROR_CODES` (Task 4), `getSessionUser`, `getAthleteByUserId`, `getCoachByUserId` (Task 5).
- Produces:
  - `LOCALES`, `type AppLocale`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, `isLocale(v): v is AppLocale`, `pickLocale(cookie, acceptLanguage): AppLocale` (`src/i18n/locale.ts`)
  - `setLocaleCookie(locale: AppLocale): Promise<void>` (`src/lib/locale-cookie.ts`)
  - `isPublicPath(path): boolean`, `signinPathFor(path): "/signin" | "/coach/signin"`, `safeNext(next, fallback?): string` (`src/lib/routes.ts`)
  - `formatDay(date: IsoDate, locale: string, options?: Intl.DateTimeFormatOptions): string` (`src/lib/format.ts`)
  - `<SignOutButton to?: string />` (translated)
  - Message namespaces `common`, `auth`, `nav`, `errors` — later tasks add their own namespace to **both** JSON files.

- [ ] **Step 1: Install next-intl**

```bash
pnpm add next-intl@^4.14.9
```

- [ ] **Step 2: Write the failing tests**

`tests/i18n/locale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isLocale, pickLocale } from "@/i18n/locale";

describe("pickLocale", () => {
  it("prefers a valid cookie", () => {
    expect(pickLocale("en", "es-ES,es;q=0.9")).toBe("en");
    expect(pickLocale("fr", "en-US")).toBe("en"); // unknown cookie ignored
  });

  it("follows Accept-Language by quality", () => {
    expect(pickLocale(undefined, "en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(pickLocale(undefined, "es;q=0.4, en;q=0.9")).toBe("en");
    expect(pickLocale(undefined, "fr-FR,es;q=0.5")).toBe("es");
  });

  it("defaults to Spanish", () => {
    expect(pickLocale(undefined, "de-DE")).toBe("es");
    expect(pickLocale(undefined, null)).toBe("es");
  });

  it("guards locale values", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("pt")).toBe(false);
  });
});
```

`tests/i18n/messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import es from "@/i18n/messages/es.json";
import en from "@/i18n/messages/en.json";
import { ERROR_CODES } from "@/lib/training/errors";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
function values(obj: object): unknown[] {
  return Object.values(obj).flatMap((v) => (v !== null && typeof v === "object" ? values(v) : [v]));
}

describe("messages", () => {
  it("has the same keys in Spanish and English", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  it("has no empty message", () => {
    expect(values(es).every((v) => typeof v === "string" && v.trim() !== "")).toBe(true);
    expect(values(en).every((v) => typeof v === "string" && v.trim() !== "")).toBe(true);
  });

  it("translates every error code", () => {
    const errors = es.errors as Record<string, string>;
    for (const code of ERROR_CODES) expect(errors[code], code).toBeTruthy();
  });
});
```

`tests/lib/routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPublicPath, safeNext, signinPathFor } from "@/lib/routes";

describe("routes", () => {
  it("leaves the sign-in pages and invitations public", () => {
    expect(isPublicPath("/signin")).toBe(true);
    expect(isPublicPath("/coach/signin")).toBe(true);
    expect(isPublicPath("/join/abc123")).toBe(true);
    expect(isPublicPath("/join/abc123/x")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/coach")).toBe(false);
  });

  it("sends each zone to its own sign-in", () => {
    expect(signinPathFor("/coach")).toBe("/coach/signin");
    expect(signinPathFor("/coach/programs/1")).toBe("/coach/signin");
    expect(signinPathFor("/coachella")).toBe("/signin");
    expect(signinPathFor("/me")).toBe("/signin");
  });

  it("only follows local next paths", () => {
    expect(safeNext("/join/abc")).toBe("/join/abc");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(undefined, "/me")).toBe("/me");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test tests/i18n tests/lib/routes.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the pure modules**

`src/i18n/locale.ts`:

```ts
export const LOCALES = ["es", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "es";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie (the profile's preference, set at sign-in and in settings) → Accept-Language → Spanish. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (isLocale(cookie)) return cookie;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().slice(0, 2), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((e) => e.lang !== "" && !Number.isNaN(e.q))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = ranked.find((e) => isLocale(e.lang));
  return match ? (match.lang as AppLocale) : DEFAULT_LOCALE;
}
```

`src/lib/routes.ts`:

```ts
const PUBLIC_PATHS = [/^\/signin$/, /^\/coach\/signin$/, /^\/join\/[^/]+$/];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

export function signinPathFor(pathname: string): "/signin" | "/coach/signin" {
  return pathname === "/coach" || pathname.startsWith("/coach/") ? "/coach/signin" : "/signin";
}

/** A `next` redirect target, accepted only when it is a path on this site. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
```

- [ ] **Step 5: Write the messages**

`src/i18n/messages/es.json`:

```json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Borrar",
    "edit": "Editar",
    "back": "Volver",
    "close": "Cerrar",
    "saving": "Guardando…"
  },
  "auth": {
    "continueWithGoogle": "Continuar con Google",
    "redirecting": "Redirigiendo…",
    "failed": "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
    "signOut": "Cerrar sesión",
    "athleteTitle": "Entrar",
    "athleteIntro": "Sigue la programación de tu coach, registra tus resultados y compáralos.",
    "coachTitle": "Entrar como coach",
    "coachIntro": "Crea y publica tus programaciones. Las cuentas de coach se aprueban manualmente."
  },
  "nav": {
    "today": "Hoy",
    "me": "Perfil",
    "programs": "Mis programas"
  },
  "errors": {
    "unauthorized": "Tu sesión ha caducado. Vuelve a entrar.",
    "not_found": "No encontrado.",
    "invalid_request": "Revisa los datos: hay algún campo no válido.",
    "coach_pending": "Tu cuenta de coach aún no está aprobada.",
    "program_archived": "El programa está archivado y no se puede modificar.",
    "start_date_locked": "No puedes cambiar la fecha de inicio: ya hay semanas publicadas.",
    "weeks_out_of_range": "Hay bloques fuera de la nueva duración. Bórralos antes de acortar el programa.",
    "day_out_of_range": "Ese día está fuera del programa.",
    "scoring_locked": "Este bloque ya tiene resultados: no puedes cambiar su tipo de score.",
    "invite_invalid": "Este enlace de invitación no es válido.",
    "enrollment_removed": "Tu coach te ha quitado de este programa.",
    "not_loggable": "Todavía no puedes registrar este bloque.",
    "invalid_score": "El resultado no es válido para este bloque.",
    "own_result": "No puedes dar un fist bump a tu propio resultado.",
    "internal": "Algo ha fallado. Inténtalo de nuevo."
  }
}
```

`src/i18n/messages/en.json`:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "back": "Back",
    "close": "Close",
    "saving": "Saving…"
  },
  "auth": {
    "continueWithGoogle": "Continue with Google",
    "redirecting": "Redirecting…",
    "failed": "Google sign-in failed. Try again.",
    "signOut": "Sign out",
    "athleteTitle": "Sign in",
    "athleteIntro": "Follow your coach's programming, log your results and compare them.",
    "coachTitle": "Sign in as a coach",
    "coachIntro": "Write and publish your programs. Coach accounts are approved manually."
  },
  "nav": {
    "today": "Today",
    "me": "Me",
    "programs": "My programs"
  },
  "errors": {
    "unauthorized": "Your session expired. Sign in again.",
    "not_found": "Not found.",
    "invalid_request": "Check the form: a field is not valid.",
    "coach_pending": "Your coach account is not approved yet.",
    "program_archived": "The program is archived and cannot be changed.",
    "start_date_locked": "The start date cannot change: some weeks are already published.",
    "weeks_out_of_range": "Some blocks fall outside the new length. Delete them before shortening the program.",
    "day_out_of_range": "That day is outside the program.",
    "scoring_locked": "This block already has results: its scoring cannot change.",
    "invite_invalid": "This invitation link is not valid.",
    "enrollment_removed": "Your coach removed you from this program.",
    "not_loggable": "You cannot log this block yet.",
    "invalid_score": "The result is not valid for this block.",
    "own_result": "You cannot fist bump your own result.",
    "internal": "Something went wrong. Try again."
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test tests/i18n tests/lib/routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire next-intl**

`src/i18n/request.ts`:

```ts
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, pickLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return { locale, messages: (await import(`./messages/${locale}.json`)).default };
});
```

`next.config.ts`:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
```

`src/lib/locale-cookie.ts`:

```ts
import { cookies } from "next/headers";
import { LOCALE_COOKIE, type AppLocale } from "@/i18n/locale";

/** Mirrors the profile's language into the cookie that `src/i18n/request.ts` reads. */
export async function setLocaleCookie(locale: AppLocale) {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
```

`src/lib/format.ts`:

```ts
import { toDbDate, type IsoDate } from "@/lib/training/dates";

/** A calendar date in the viewer's language ("mié, 7 oct"). UTC because IsoDate carries no time zone. */
export function formatDay(
  date: IsoDate, locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(toDbDate(date));
}
```

- [ ] **Step 8: Split the layouts**

`src/app/layout.tsx` (replace the whole file):

```tsx
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Tailor",
  description: "Follow your coach's programming, log your results and compare them.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`src/components/SignOutButton.tsx` (replace):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to = "/signin" }: { to?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  return (
    <button className="text-neutral-600 underline" onClick={async () => {
      await authClient.signOut();
      router.push(to);
      router.refresh();
    }}>
      {t("signOut")}
    </button>
  );
}
```

`src/app/(athlete)/AthleteNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS = [
  { href: "/", key: "today" },
  { href: "/me", key: "me" },
] as const;

export function AthleteNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t bg-white">
      <ul className="mx-auto flex max-w-md justify-around py-3 text-sm">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={pathname === item.href ? "font-semibold" : "text-neutral-500"}>
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`src/app/(athlete)/layout.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { AthleteNav } from "./AthleteNav";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24 pt-4">{children}</main>
      {athlete && <AthleteNav />}
    </>
  );
}
```

`src/app/(athlete)/page.tsx` (placeholder until Task 12):

```tsx
import { getTranslations } from "next-intl/server";

export default async function TodayPage() {
  const t = await getTranslations("nav");
  return <h1 className="text-xl font-semibold">{t("today")}</h1>;
}
```

`src/app/coach/layout.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const coach = user ? await getCoachByUserId(prisma, user.id) : null;
  const t = await getTranslations("nav");
  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3 text-sm">
          <span className="font-semibold">Training Tailor · Coach</span>
          {coach?.status === "approved" && <Link href="/coach">{t("programs")}</Link>}
          {user && <span className="ml-auto"><SignOutButton to="/coach/signin" /></span>}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </>
  );
}
```

- [ ] **Step 9: Move the engine pages and keep their disclaimer**

```bash
git mv src/app/tailor "src/app/(athlete)/tailor"
git mv src/app/profile "src/app/(athlete)/profile"
git rm src/app/page.tsx src/app/signin/page.tsx
```

The old root layout carried the medical disclaimer in its footer. Add it at the end of the `<section>` in `src/app/(athlete)/tailor/page.tsx`, after `<TailorClient … />`:

```tsx
      <p className="text-xs text-neutral-500">
        Not medical advice. Training Tailor suggests workout modifications; it does not diagnose or treat
        injuries. When in doubt, consult a qualified professional.
      </p>
```

- [ ] **Step 10: Gate every non-public page**

`src/proxy.ts` (replace):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isPublicPath, signinPathFor } from "@/lib/routes";

/** Only checks that a session exists; pages check the account (src/lib/accounts.ts). */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return NextResponse.next();
  const target = new URL(signinPathFor(pathname), request.url);
  if (target.pathname === "/signin" && pathname !== "/") target.searchParams.set("next", pathname + search);
  return NextResponse.redirect(target);
}

// API routes check the session themselves and answer 401.
export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };
```

- [ ] **Step 11: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: all clean; the build lists `/`, `/tailor`, `/profile` and no `/signin` yet (Task 7). If `pnpm build` fails only because `DATABASE_URL`/Google variables are missing in this shell, load `.env` first; do not change code for it.

- [ ] **Step 12: Commit**

```bash
git add -A package.json pnpm-lock.yaml next.config.ts src/i18n src/lib/locale-cookie.ts src/lib/routes.ts src/lib/format.ts src/app src/proxy.ts src/components/SignOutButton.tsx tests/i18n tests/lib/routes.test.ts
git commit -m "feat: next-intl (es/en), athlete and coach zone layouts, session gate for every page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Entry points, onboarding and athlete settings

**Files:**
- Create: `src/components/GoogleSignInButton.tsx`
- Create: `src/app/(athlete)/signin/page.tsx`
- Create: `src/app/(athlete)/onboarding/page.tsx`, `src/app/(athlete)/onboarding/OnboardingRunner.tsx`
- Create: `src/app/(athlete)/actions.ts`
- Create: `src/app/(athlete)/me/page.tsx`, `src/app/(athlete)/me/SettingsForm.tsx`
- Create: `src/app/coach/signin/page.tsx`
- Create: `src/app/coach/onboarding/page.tsx`, `src/app/coach/onboarding/CoachOnboardingRunner.tsx`
- Create: `src/app/coach/onboarding-actions.ts`
- Create: `src/app/coach/pending/page.tsx`
- Modify: `src/i18n/messages/es.json`, `src/i18n/messages/en.json` (namespaces `onboarding`, `me`, `coachPending`)

**Interfaces:**
- Consumes: `runAction` (Task 5), `ensureAthleteAccount`, `ensureCoachAccount`, `updateAthleteSettings`, `getCoachByUserId` (Task 5), `requireAthletePage` (Task 5), `safeNext` (Task 6), `setLocaleCookie`, `isLocale`, `DEFAULT_LOCALE` (Task 6), `OnboardingInput`, `AthleteSettingsInput`, `parse` (Task 4).
- Produces:
  - `completeAthleteOnboarding(raw: { timezone: string }): Promise<ActionResult>` and `updateSettingsAction(raw: AthleteSettings): Promise<ActionResult>` in `src/app/(athlete)/actions.ts` (Task 11 adds `joinProgramAction` to the same file)
  - `enterCoach(): Promise<ActionResult<{ status: string }>>`
  - `<GoogleSignInButton callbackURL: string />`

Sign-in always lands on an onboarding page (`callbackURL`). Onboarding creates the profile the first time and, on every sign-in, copies the profile's language into the locale cookie, so a new device gets the user's language at once.

- [ ] **Step 1: Add the messages**

Add to `es.json`:

```json
  "onboarding": {
    "preparing": "Preparando tu cuenta…",
    "retry": "Reintentar"
  },
  "me": {
    "title": "Perfil",
    "displayName": "Nombre visible",
    "timezone": "Zona horaria",
    "language": "Idioma",
    "saved": "Guardado",
    "languages": { "es": "Español", "en": "English" }
  },
  "coachPending": {
    "title": "Cuenta pendiente de aprobación",
    "pending": "Hemos recibido tu solicitud. Podrás crear programas cuando aprobemos tu cuenta.",
    "suspended": "Tu cuenta de coach está suspendida. Escríbenos si crees que es un error."
  }
```

Add to `en.json`:

```json
  "onboarding": {
    "preparing": "Setting up your account…",
    "retry": "Retry"
  },
  "me": {
    "title": "Me",
    "displayName": "Display name",
    "timezone": "Time zone",
    "language": "Language",
    "saved": "Saved",
    "languages": { "es": "Español", "en": "English" }
  },
  "coachPending": {
    "title": "Account awaiting approval",
    "pending": "We received your request. You can create programs once your account is approved.",
    "suspended": "Your coach account is suspended. Contact us if you think this is a mistake."
  }
```

- [ ] **Step 2: Sign-in button and pages**

`src/components/GoogleSignInButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton({ callbackURL }: { callbackURL: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={signIn} disabled={pending} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">
        {pending ? t("redirecting") : t("continueWithGoogle")}
      </button>
      {failed && <p className="text-sm text-red-700">{t("failed")}</p>}
    </div>
  );
}
```

`src/app/(athlete)/signin/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { safeNext } from "@/lib/routes";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <section className="flex flex-col gap-6 py-12">
      <h1 className="text-2xl font-semibold">{t("athleteTitle")}</h1>
      <p className="text-sm text-neutral-600">{t("athleteIntro")}</p>
      <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(safeNext(next))}`} />
    </section>
  );
}
```

`src/app/coach/signin/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default async function CoachSignInPage() {
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-2xl font-semibold">{t("coachTitle")}</h1>
      <p className="text-sm text-neutral-600">{t("coachIntro")}</p>
      <GoogleSignInButton callbackURL="/coach/onboarding" />
    </section>
  );
}
```

- [ ] **Step 3: Athlete actions**

`src/app/(athlete)/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { setLocaleCookie } from "@/lib/locale-cookie";
import { getSessionUser } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { AthleteSettingsInput, OnboardingInput, parse } from "@/lib/training/schemas";
import { ensureAthleteAccount, updateAthleteSettings } from "@/lib/training/services/accounts";

export async function completeAthleteOnboarding(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new TrainingError("unauthorized");
    const { timezone } = parse(OnboardingInput, raw);
    const current = await getLocale();
    const athlete = await ensureAthleteAccount(prisma, user, { timezone, locale: isLocale(current) ? current : DEFAULT_LOCALE });
    if (isLocale(athlete.locale)) await setLocaleCookie(athlete.locale);
  });
}

export async function updateSettingsAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    const settings = parse(AthleteSettingsInput, raw);
    await updateAthleteSettings(prisma, athlete.id, settings);
    await setLocaleCookie(settings.locale);
    revalidatePath("/", "layout");
  });
}
```

- [ ] **Step 4: Onboarding pages**

`src/app/(athlete)/onboarding/OnboardingRunner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { completeAthleteOnboarding } from "../actions";

export function OnboardingRunner({ next }: { next: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    completeAthleteOnboarding({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        router.replace(next);
        router.refresh();
      } else {
        setError(r.code);
      }
    });
    return () => { cancelled = true; };
  }, [next, router, attempt]);

  if (!error) return <p className="py-12 text-center text-neutral-600">{t("onboarding.preparing")}</p>;
  return (
    <div className="flex flex-col gap-3 py-12">
      <p className="text-red-700">{t(`errors.${error}`)}</p>
      <button className="w-fit underline" onClick={() => { setError(null); setAttempt((a) => a + 1); }}>
        {t("onboarding.retry")}
      </button>
    </div>
  );
}
```

`src/app/(athlete)/onboarding/page.tsx`:

```tsx
import { safeNext } from "@/lib/routes";
import { OnboardingRunner } from "./OnboardingRunner";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <OnboardingRunner next={safeNext(next)} />;
}
```

`src/app/coach/onboarding-actions.ts`:

```ts
"use server";

import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { setLocaleCookie } from "@/lib/locale-cookie";
import { getSessionUser } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { ensureCoachAccount } from "@/lib/training/services/accounts";

export async function enterCoach(): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new TrainingError("unauthorized");
    const current = await getLocale();
    const coach = await ensureCoachAccount(prisma, user, { locale: isLocale(current) ? current : DEFAULT_LOCALE });
    if (isLocale(coach.locale)) await setLocaleCookie(coach.locale);
    return { status: coach.status };
  });
}
```

`src/app/coach/onboarding/CoachOnboardingRunner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { enterCoach } from "../onboarding-actions";

export function CoachOnboardingRunner() {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    enterCoach().then((r) => {
      if (cancelled) return;
      if (!r.ok) return setError(r.code);
      router.replace(r.value.status === "approved" ? "/coach" : "/coach/pending");
      router.refresh();
    });
    return () => { cancelled = true; };
  }, [router]);

  return error
    ? <p className="py-12 text-red-700">{t(`errors.${error}`)}</p>
    : <p className="py-12 text-neutral-600">{t("onboarding.preparing")}</p>;
}
```

`src/app/coach/onboarding/page.tsx`:

```tsx
import { CoachOnboardingRunner } from "./CoachOnboardingRunner";

export default function CoachOnboardingPage() {
  return <CoachOnboardingRunner />;
}
```

`src/app/coach/pending/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";

export default async function CoachPendingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/coach/signin");
  const coach = await getCoachByUserId(prisma, user.id);
  if (!coach) redirect("/coach/onboarding");
  if (coach.status === "approved") redirect("/coach");
  const t = await getTranslations("coachPending");
  return (
    <section className="mx-auto flex max-w-lg flex-col gap-3 py-12">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-neutral-700">{coach.status === "suspended" ? t("suspended") : t("pending")}</p>
    </section>
  );
}
```

- [ ] **Step 5: Athlete settings page**

`src/app/(athlete)/me/SettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { updateSettingsAction } from "../actions";

type Settings = { displayName: string; timezone: string; locale: "es" | "en" };

export function SettingsForm({ initial, timeZones }: { initial: Settings; timeZones: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | ErrorCode>("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const r = await updateSettingsAction(form);
    setState(r.ok ? "saved" : r.code);
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("me.displayName")}
        <input className="rounded border px-3 py-2" value={form.displayName} maxLength={60}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("me.timezone")}
        <select className="rounded border px-3 py-2" value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("me.language")}
        <select className="rounded border px-3 py-2" value={form.locale}
          onChange={(e) => setForm({ ...form, locale: e.target.value as Settings["locale"] })}>
          <option value="es">{t("me.languages.es")}</option>
          <option value="en">{t("me.languages.en")}</option>
        </select>
      </label>
      <button disabled={state === "saving"} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {state === "saving" ? t("common.saving") : t("common.save")}
      </button>
      {state === "saved" && <p className="text-sm text-green-700">{t("me.saved")}</p>}
      {state !== "idle" && state !== "saving" && state !== "saved" && <p className="text-sm text-red-700">{t(`errors.${state}`)}</p>}
    </form>
  );
}
```

`src/app/(athlete)/me/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";
import { isLocale } from "@/i18n/locale";
import { requireAthletePage } from "@/lib/accounts";
import { SettingsForm } from "./SettingsForm";

export default async function MePage() {
  const athlete = await requireAthletePage("/me");
  const t = await getTranslations("me");
  const timeZones = Intl.supportedValuesOf("timeZone");
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <SettingsForm
        initial={{ displayName: athlete.displayName, timezone: athlete.timezone, locale: isLocale(athlete.locale) ? athlete.locale : "es" }}
        timeZones={timeZones.includes(athlete.timezone) ? timeZones : [athlete.timezone, ...timeZones]}
      />
      <SignOutButton />
    </section>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green (the messages test checks both files gained the same keys).

- [ ] **Step 7: Commit**

```bash
git add src/components/GoogleSignInButton.tsx "src/app/(athlete)" src/app/coach src/i18n/messages
git commit -m "feat: separate athlete and coach entry points, onboarding and athlete settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Programs (service and coach pages)

**Files:**
- Create: `src/lib/training/services/programs.ts`
- Create: `src/app/coach/program-actions.ts`
- Create: `src/app/coach/page.tsx`
- Create: `src/app/coach/programs/new/page.tsx`, `src/app/coach/programs/new/NewProgramForm.tsx`
- Create: `src/app/coach/programs/[id]/settings/page.tsx`, `src/app/coach/programs/[id]/settings/ProgramSettingsForm.tsx`
- Modify: `src/i18n/messages/es.json`, `en.json` (namespace `programs`)
- Test: `tests/training/services/programs.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 5), `TrainingError` (Task 4), `ProgramCreate`, `ProgramUpdate`, `ProgramCreateInput`, `ProgramUpdateInput`, `parse` (Task 4), `toDbDate`, `fromDbDate`, `isMonday`, `addDays`, `mondayOf`, `todayIn` (Task 3), `requireCoach`, `requireCoachPage`, `runAction`, `orNotFound` (Task 5), `formatDay` (Task 6).
- Produces (`services/programs.ts`):
  - `newInviteCode(): string`
  - `createProgram(db, coachId, input: ProgramCreate): Promise<Program>`
  - `listCoachPrograms(db, coachId): Promise<(Program & { _count: { enrollments: number } })[]>` (active athletes only)
  - `getOwnedProgram(db, coachId, programId): Promise<Program>` — `not_found` for another coach's program
  - `assertWritable(program: { archivedAt: Date | null }): void` — `program_archived`
  - `updateProgram(db, coachId, programId, input: ProgramUpdate): Promise<Program>`
  - `archiveProgram(db, coachId, programId): Promise<void>`
  - `regenerateInvite(db, coachId, programId): Promise<string>`
  - `setWeekPublished(db, coachId, programId, weekIndex, published: boolean): Promise<void>` (continuous only)
  - `setProgramPublished(db, coachId, programId, published: boolean): Promise<void>` (closed only)
  - `publishedWeeks(db, programId): Promise<Set<number>>`
- Produces (actions, `src/app/coach/program-actions.ts`): `createProgramAction(raw): Promise<ActionResult<{ id: string }>>`, `updateProgramAction(raw: { programId; program }): Promise<ActionResult>`, `archiveProgramAction(programId): Promise<ActionResult>`, `regenerateInviteAction(programId): Promise<ActionResult<{ code: string }>>`, `setWeekPublishedAction(raw: { programId; weekIndex; published }): Promise<ActionResult>`, `setProgramPublishedAction(raw: { programId; published }): Promise<ActionResult>`

- [ ] **Step 1: Write the failing test**

`tests/training/services/programs.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeBarbellBlock, makeCoach, makeCustomBlock } from "../../helpers/factories";
import {
  archiveProgram, createProgram, getOwnedProgram, listCoachPrograms, publishedWeeks, regenerateInvite,
  setProgramPublished, setWeekPublished, updateProgram,
} from "@/lib/training/services/programs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const continuous = { kind: "continuous" as const, name: "Daily", description: null, startDate: "2026-10-05" };
const closed = { kind: "closed" as const, name: "Cycle", description: null, weeks: 4 };

describe("programs", () => {
  it("creates both kinds with their own timing fields and a unique invite code", async () => {
    const coach = await makeCoach(tdb.prisma);
    const a = await createProgram(tdb.prisma, coach.id, continuous);
    const b = await createProgram(tdb.prisma, coach.id, closed);
    expect(a.startDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(a.weeks).toBeNull();
    expect(b.weeks).toBe(4);
    expect(b.startDate).toBeNull();
    expect(a.inviteCode).not.toBe(b.inviteCode);
    expect(a.inviteCode).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  it("hides another coach's program", async () => {
    const owner = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, owner.id, continuous);
    await expect(getOwnedProgram(tdb.prisma, other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listCoachPrograms(tdb.prisma, other.id)).toHaveLength(0);
    expect(await listCoachPrograms(tdb.prisma, owner.id)).toHaveLength(1);
  });

  it("locks the start date once a week is published", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-12" });
    await setWeekPublished(tdb.prisma, coach.id, p.id, 0, true);
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily", description: null, startDate: "2026-10-19" }))
      .rejects.toMatchObject({ code: "start_date_locked" });
    // Same date and other fields still change.
    const renamed = await updateProgram(tdb.prisma, coach.id, p.id, { name: "Daily RX", description: "x", startDate: "2026-10-12" });
    expect(renamed.name).toBe("Daily RX");
  });

  it("refuses to shorten a closed program below its blocks", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, closed);
    await makeBarbellBlock(tdb.prisma, p.id, 20); // week 3
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "Cycle", description: null, weeks: 2 }))
      .rejects.toMatchObject({ code: "weeks_out_of_range" });
    expect((await updateProgram(tdb.prisma, coach.id, p.id, { name: "Cycle", description: null, weeks: 3 })).weeks).toBe(3);
  });

  it("publishes weeks of continuous programs and whole closed programs", async () => {
    const coach = await makeCoach(tdb.prisma);
    const c = await createProgram(tdb.prisma, coach.id, continuous);
    const k = await createProgram(tdb.prisma, coach.id, closed);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 0, true);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 2, true);
    await setWeekPublished(tdb.prisma, coach.id, c.id, 2, true); // idempotent
    await setWeekPublished(tdb.prisma, coach.id, c.id, 0, false);
    expect([...await publishedWeeks(tdb.prisma, c.id)]).toEqual([2]);
    await expect(setWeekPublished(tdb.prisma, coach.id, k.id, 0, true)).rejects.toMatchObject({ code: "invalid_request" });
    await setProgramPublished(tdb.prisma, coach.id, k.id, true);
    expect((await getOwnedProgram(tdb.prisma, coach.id, k.id)).publishedAt).not.toBeNull();
    await expect(setProgramPublished(tdb.prisma, coach.id, c.id, true)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("regenerates the invite code", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    const code = await regenerateInvite(tdb.prisma, coach.id, p.id);
    expect(code).not.toBe(p.inviteCode);
    expect((await getOwnedProgram(tdb.prisma, coach.id, p.id)).inviteCode).toBe(code);
  });

  it("makes archived programs read-only", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await createProgram(tdb.prisma, coach.id, continuous);
    await makeCustomBlock(tdb.prisma, p.id, 0);
    await archiveProgram(tdb.prisma, coach.id, p.id);
    await expect(updateProgram(tdb.prisma, coach.id, p.id, { name: "X", description: null }))
      .rejects.toMatchObject({ code: "program_archived" });
    await expect(regenerateInvite(tdb.prisma, coach.id, p.id)).rejects.toMatchObject({ code: "program_archived" });
    await expect(setWeekPublished(tdb.prisma, coach.id, p.id, 0, true)).rejects.toMatchObject({ code: "program_archived" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/training/services/programs.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the service**

`src/lib/training/services/programs.ts`:

```ts
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "../dates";
import { TrainingError } from "../errors";
import type { ProgramCreate, ProgramUpdate } from "../schemas";
import type { Db } from "./types";

export function newInviteCode(): string {
  return randomBytes(6).toString("base64url"); // 8 URL-safe characters
}

export async function createProgram(db: Db, coachId: string, input: ProgramCreate) {
  return db.program.create({
    data: {
      coachId,
      name: input.name,
      description: input.description,
      kind: input.kind,
      startDate: input.kind === "continuous" ? toDbDate(input.startDate) : null,
      weeks: input.kind === "closed" ? input.weeks : null,
      inviteCode: newInviteCode(),
    },
  });
}

export function listCoachPrograms(db: Db, coachId: string) {
  return db.program.findMany({
    where: { coachId },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    include: { _count: { select: { enrollments: { where: { removedAt: null } } } } },
  });
}

export async function getOwnedProgram(db: Db, coachId: string, programId: string) {
  const program = await db.program.findFirst({ where: { id: programId, coachId } });
  if (!program) throw new TrainingError("not_found");
  return program;
}

export function assertWritable(program: { archivedAt: Date | null }) {
  if (program.archivedAt) throw new TrainingError("program_archived");
}

export async function updateProgram(db: Db, coachId: string, programId: string, input: ProgramUpdate) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  const data: Prisma.ProgramUpdateInput = { name: input.name, description: input.description };
  if (program.kind === "continuous" && input.startDate && input.startDate !== fromDbDate(program.startDate as Date)) {
    if ((await db.programWeek.count({ where: { programId } })) > 0) throw new TrainingError("start_date_locked");
    data.startDate = toDbDate(input.startDate);
  }
  if (program.kind === "closed" && input.weeks !== undefined && input.weeks !== program.weeks) {
    const outside = await db.block.count({ where: { programId, dayIndex: { gte: input.weeks * 7 } } });
    if (outside > 0) throw new TrainingError("weeks_out_of_range");
    data.weeks = input.weeks;
  }
  return db.program.update({ where: { id: programId }, data });
}

export async function archiveProgram(db: Db, coachId: string, programId: string) {
  await getOwnedProgram(db, coachId, programId);
  await db.program.update({ where: { id: programId }, data: { archivedAt: new Date() } });
}

export async function regenerateInvite(db: Db, coachId: string, programId: string) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  const code = newInviteCode();
  await db.program.update({ where: { id: programId }, data: { inviteCode: code } });
  return code;
}

export async function setWeekPublished(db: Db, coachId: string, programId: string, weekIndex: number, published: boolean) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (program.kind !== "continuous" || !Number.isInteger(weekIndex) || weekIndex < 0) {
    throw new TrainingError("invalid_request");
  }
  if (published) {
    await db.programWeek.upsert({
      where: { programId_weekIndex: { programId, weekIndex } },
      create: { programId, weekIndex },
      update: {},
    });
  } else {
    await db.programWeek.deleteMany({ where: { programId, weekIndex } });
  }
}

export async function setProgramPublished(db: Db, coachId: string, programId: string, published: boolean) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (program.kind !== "closed") throw new TrainingError("invalid_request");
  await db.program.update({ where: { id: programId }, data: { publishedAt: published ? new Date() : null } });
}

export async function publishedWeeks(db: Db, programId: string): Promise<Set<number>> {
  const rows = await db.programWeek.findMany({ where: { programId }, select: { weekIndex: true } });
  return new Set(rows.map((r) => r.weekIndex));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/training/services/programs.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the messages**

`es.json`:

```json
  "programs": {
    "title": "Mis programas",
    "new": "Nuevo programa",
    "empty": "Todavía no tienes programas.",
    "athletes": "{count, plural, =0 {Sin atletas} one {# atleta} other {# atletas}}",
    "archived": "Archivado",
    "kind": "Tipo",
    "kinds": { "continuous": "Continuo", "closed": "Cerrado" },
    "kindHelp": {
      "continuous": "Con fechas reales: publicas semana a semana y hay leaderboard.",
      "closed": "N semanas que cada atleta empieza al unirse. Sin leaderboard."
    },
    "name": "Nombre",
    "description": "Descripción",
    "startDate": "Empieza el lunes",
    "weeks": "Semanas",
    "create": "Crear programa",
    "settings": "Ajustes",
    "planner": "Planificación",
    "roster": "Atletas",
    "archive": "Archivar programa",
    "archiveConfirm": "¿Archivar este programa? Desaparecerá para tus atletas y el enlace dejará de funcionar.",
    "startDateLockedHint": "La fecha de inicio no puede cambiar porque ya hay semanas publicadas."
  }
```

`en.json`:

```json
  "programs": {
    "title": "My programs",
    "new": "New program",
    "empty": "You have no programs yet.",
    "athletes": "{count, plural, =0 {No athletes} one {# athlete} other {# athletes}}",
    "archived": "Archived",
    "kind": "Kind",
    "kinds": { "continuous": "Continuous", "closed": "Closed" },
    "kindHelp": {
      "continuous": "Real dates: you publish week by week and there is a leaderboard.",
      "closed": "N weeks that each athlete starts when they join. No leaderboard."
    },
    "name": "Name",
    "description": "Description",
    "startDate": "Starts on Monday",
    "weeks": "Weeks",
    "create": "Create program",
    "settings": "Settings",
    "planner": "Planner",
    "roster": "Athletes",
    "archive": "Archive program",
    "archiveConfirm": "Archive this program? It disappears for your athletes and the link stops working.",
    "startDateLockedHint": "The start date cannot change because some weeks are already published."
  }
```

- [ ] **Step 6: Program actions**

`src/app/coach/program-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { ProgramCreateInput, ProgramUpdateInput, parse } from "@/lib/training/schemas";
import {
  archiveProgram, createProgram, regenerateInvite, setProgramPublished, setWeekPublished, updateProgram,
} from "@/lib/training/services/programs";

const Id = z.string().min(1).max(64);

export async function createProgramAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const coach = await requireCoach();
    const program = await createProgram(prisma, coach.id, parse(ProgramCreateInput, raw));
    revalidatePath("/coach");
    return { id: program.id };
  });
}

export async function updateProgramAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    const { programId, program } = parse(z.object({ programId: Id, program: ProgramUpdateInput }), raw);
    await updateProgram(prisma, coach.id, programId, program);
    revalidatePath(`/coach/programs/${programId}`, "layout");
  });
}

export async function archiveProgramAction(programId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    await archiveProgram(prisma, coach.id, parse(Id, programId));
    revalidatePath("/coach", "layout");
  });
}

export async function regenerateInviteAction(programId: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const coach = await requireCoach();
    const id = parse(Id, programId);
    const code = await regenerateInvite(prisma, coach.id, id);
    revalidatePath(`/coach/programs/${id}/athletes`);
    return { code };
  });
}

export async function setWeekPublishedAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    const { programId, weekIndex, published } = parse(
      z.object({ programId: Id, weekIndex: z.number().int().min(0), published: z.boolean() }), raw);
    await setWeekPublished(prisma, coach.id, programId, weekIndex, published);
    revalidatePath(`/coach/programs/${programId}`);
  });
}

export async function setProgramPublishedAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    const { programId, published } = parse(z.object({ programId: Id, published: z.boolean() }), raw);
    await setProgramPublished(prisma, coach.id, programId, published);
    revalidatePath(`/coach/programs/${programId}`);
  });
}
```

- [ ] **Step 7: Program list page**

`src/app/coach/page.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listCoachPrograms } from "@/lib/training/services/programs";

export default async function CoachHome() {
  const coach = await requireCoachPage();
  const t = await getTranslations("programs");
  const programs = await listCoachPrograms(prisma, coach.id);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/coach/programs/new" className="rounded bg-black px-4 py-2 text-sm text-white">{t("new")}</Link>
      </div>
      {programs.length === 0 && <p className="text-neutral-600">{t("empty")}</p>}
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <li key={p.id}>
            <Link href={`/coach/programs/${p.id}`} className={`block rounded border p-4 ${p.archivedAt ? "opacity-60" : ""}`}>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-neutral-600">
                {t(`kinds.${p.kind as "continuous" | "closed"}`)} · {t("athletes", { count: p._count.enrollments })}
                {p.archivedAt && ` · ${t("archived")}`}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8: New program page**

`src/app/coach/programs/new/NewProgramForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { createProgramAction } from "../../program-actions";

export function NewProgramForm({ nextMonday }: { nextMonday: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<"continuous" | "closed">("continuous");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(nextMonday);
  const [weeks, setWeeks] = useState("4");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const input = kind === "continuous"
      ? { kind, name, description, startDate }
      : { kind, name, description, weeks: Number(weeks) };
    const r = await createProgramAction(input);
    setPending(false);
    if (r.ok) router.push(`/coach/programs/${r.value.id}`);
    else setError(r.code);
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("programs.kind")}</legend>
        {(["continuous", "closed"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
            <span><b>{t(`programs.kinds.${k}`)}</b> — {t(`programs.kindHelp.${k}`)}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {t("programs.name")}
        <input required maxLength={80} className="rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("programs.description")}
        <textarea maxLength={500} className="rounded border px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {kind === "continuous" ? (
        <label className="flex flex-col gap-1 text-sm">
          {t("programs.startDate")}
          <input type="date" step={7} min={nextMonday} className="rounded border px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          {t("programs.weeks")}
          <input type="number" min={1} max={52} className="rounded border px-3 py-2" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </label>
      )}
      <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{t("programs.create")}</button>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </form>
  );
}
```

`src/app/coach/programs/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { addDays, mondayOf, todayIn } from "@/lib/training/dates";
import { NewProgramForm } from "./NewProgramForm";

export default async function NewProgramPage() {
  await requireCoachPage();
  const t = await getTranslations("programs");
  const today = todayIn("UTC");
  const nextMonday = mondayOf(today) === today ? today : addDays(mondayOf(today), 7);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <NewProgramForm nextMonday={nextMonday} />
    </section>
  );
}
```

`step={7}` with `min` set to a Monday keeps the browser date picker on Mondays; the server still validates (`MondayDate`).

- [ ] **Step 9: Program settings page**

`src/app/coach/programs/[id]/settings/ProgramSettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { archiveProgramAction, updateProgramAction } from "../../../program-actions";

type Props = {
  programId: string;
  kind: "continuous" | "closed";
  initial: { name: string; description: string; startDate: string | null; weeks: number | null };
  startDateLocked: boolean;
  archived: boolean;
};

export function ProgramSettingsForm({ programId, kind, initial, startDateLocked, archived }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState({ ...initial, weeks: String(initial.weeks ?? "") });
  const [state, setState] = useState<"idle" | "saving" | "saved" | ErrorCode>("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const program = kind === "continuous"
      ? { name: form.name, description: form.description, startDate: form.startDate ?? undefined }
      : { name: form.name, description: form.description, weeks: Number(form.weeks) };
    const r = await updateProgramAction({ programId, program });
    setState(r.ok ? "saved" : r.code);
    if (r.ok) router.refresh();
  }

  async function archive() {
    if (!window.confirm(t("programs.archiveConfirm"))) return;
    const r = await archiveProgramAction(programId);
    if (r.ok) router.push("/coach");
    else setState(r.code);
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-4">
        <fieldset disabled={archived} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("programs.name")}
            <input required maxLength={80} className="rounded border px-3 py-2" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("programs.description")}
            <textarea maxLength={500} className="rounded border px-3 py-2" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          {kind === "continuous" ? (
            <label className="flex flex-col gap-1 text-sm">
              {t("programs.startDate")}
              <input type="date" step={7} disabled={startDateLocked} className="rounded border px-3 py-2"
                value={form.startDate ?? ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              {startDateLocked && <span className="text-xs text-neutral-500">{t("programs.startDateLockedHint")}</span>}
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              {t("programs.weeks")}
              <input type="number" min={1} max={52} className="rounded border px-3 py-2" value={form.weeks}
                onChange={(e) => setForm({ ...form, weeks: e.target.value })} />
            </label>
          )}
          <button className="w-fit rounded bg-black px-4 py-2 text-white">{t("common.save")}</button>
        </fieldset>
        {state === "saved" && <p className="text-sm text-green-700">{t("me.saved")}</p>}
        {state !== "idle" && state !== "saving" && state !== "saved" && <p className="text-sm text-red-700">{t(`errors.${state}`)}</p>}
      </form>
      {!archived && (
        <button onClick={archive} className="w-fit text-sm text-red-700 underline">{t("programs.archive")}</button>
      )}
    </div>
  );
}
```

`src/app/coach/programs/[id]/settings/page.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { fromDbDate } from "@/lib/training/dates";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import { ProgramSettingsForm } from "./ProgramSettingsForm";

export default async function ProgramSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const t = await getTranslations("programs");
  const locked = program.kind === "continuous" && (await publishedWeeks(prisma, program.id)).size > 0;
  return (
    <section className="flex flex-col gap-6">
      <Link href={`/coach/programs/${program.id}`} className="text-sm underline">{t("planner")}</Link>
      <h1 className="text-2xl font-semibold">{program.name} · {t("settings")}</h1>
      <ProgramSettingsForm
        programId={program.id}
        kind={program.kind as "continuous" | "closed"}
        initial={{
          name: program.name,
          description: program.description ?? "",
          startDate: program.startDate ? fromDbDate(program.startDate) : null,
          weeks: program.weeks,
        }}
        startDateLocked={locked}
        archived={program.archivedAt !== null}
      />
    </section>
  );
}
```

- [ ] **Step 10: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add src/lib/training/services/programs.ts src/app/coach tests/training/services/programs.test.ts src/i18n/messages
git commit -m "feat: coach programs (continuous and closed), settings, archive and publication service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Blocks service (create, edit, delete, reorder, duplicate)

**Files:**
- Create: `src/lib/training/services/catalog.ts`
- Create: `src/lib/training/services/blocks.ts`
- Test: `tests/training/services/blocks.test.ts`

**Interfaces:**
- Consumes: `getOwnedProgram`, `assertWritable` (Task 8), `BlockInputValue` (Task 4), `isLiftMovement` (Task 4), `getDomainData` (existing), `toJson` (existing `src/lib/json.ts`), factories (Task 2).
- Produces:
  - `assertLiftMovement(name: string): Promise<void>` — `invalid_request` unless a catalog barbell movement (`services/catalog.ts`)
  - `listWeekBlocks(db, programId, weekIndex): Promise<(Block & { _count: { results: number } })[]>` ordered by day then position
  - `createBlock(db, coachId, programId, dayIndex, input: BlockInputValue): Promise<Block>` — appended at the end of the day
  - `updateBlock(db, coachId, blockId, input: BlockInputValue): Promise<Block>` — `scoring_locked` when results exist and kind or scoring changes
  - `deleteBlock(db, coachId, blockId): Promise<void>` — renumbers the day
  - `moveBlock(db, coachId, blockId, toDayIndex: number, toPosition: number): Promise<void>` — moves within the day or to another day; `toPosition` is the final index in the target day, clamped to its length; both days are renumbered in one transaction
  - `duplicateBlock(db, coachId, blockId, targetDayIndex): Promise<void>`
  - `duplicateDay(db, coachId, programId, fromDay, toDay): Promise<void>`
  - `duplicateWeek(db, coachId, programId, fromWeek, toWeek): Promise<void>`
  - All of them: `not_found` for another coach, `program_archived` on archived programs, `day_out_of_range` for a negative day or one past a closed program.

- [ ] **Step 1: Write the failing test**

`tests/training/services/blocks.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock } from "../../helpers/factories";
import {
  createBlock, deleteBlock, duplicateBlock, duplicateDay, duplicateWeek, listWeekBlocks, moveBlock, updateBlock,
} from "@/lib/training/services/blocks";
import { archiveProgram } from "@/lib/training/services/programs";
import type { BlockInputValue } from "@/lib/training/schemas";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const custom = (title: string, scoring: "for_time" | "amrap" | "none" = "for_time"): BlockInputValue => ({
  kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
  description: "21-15-9", scoring, timeCapSeconds: null,
});
const barbell = (movement = "Back Squat"): BlockInputValue => ({
  kind: "barbell", title: null, color: "blue", coachingTips: null, videoUrl: null,
  movement, sets: [{ reps: 5, percent: 80, kg: null }], instructions: null,
});
const titles = async (programId: string, dayIndex: number) =>
  (await tdb.prisma.block.findMany({ where: { programId, dayIndex }, orderBy: { position: "asc" } })).map((b) => `${b.position}:${b.title ?? b.movement}`);

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id);
  return { coach, program };
}

describe("blocks", () => {
  it("appends blocks to the end of their day", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 2, custom("A"));
    await createBlock(tdb.prisma, coach.id, program.id, 2, barbell());
    expect(await titles(program.id, 2)).toEqual(["0:A", "1:Back Squat"]);
  });

  it("validates the movement, the day and the owner", async () => {
    const { coach, program } = await setup();
    const other = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    await expect(createBlock(tdb.prisma, coach.id, program.id, 0, barbell("Air Squat"))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(createBlock(tdb.prisma, coach.id, program.id, -1, custom("A"))).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(createBlock(tdb.prisma, coach.id, closed.id, 14, custom("A"))).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(createBlock(tdb.prisma, other.id, program.id, 0, custom("A"))).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses changes on archived programs", async () => {
    const { coach, program } = await setup();
    await archiveProgram(tdb.prisma, coach.id, program.id);
    await expect(createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"))).rejects.toMatchObject({ code: "program_archived" });
  });

  it("switches a block between kinds and clears the other kind's fields", async () => {
    const { coach, program } = await setup();
    const b = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    const updated = await updateBlock(tdb.prisma, coach.id, b.id, barbell("Deadlift"));
    expect(updated).toMatchObject({ kind: "barbell", movement: "Deadlift", description: null, scoring: null });
  });

  it("locks the scoring once results exist", async () => {
    const { coach, program } = await setup();
    const athlete = await makeAthlete(tdb.prisma);
    const b = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A", "for_time"));
    await tdb.prisma.result.create({
      data: { blockId: b.id, athleteId: athlete.id, division: "rx", score: { seconds: 300 }, sortKey: -300, performedOn: new Date("2026-10-05T00:00:00Z") },
    });
    await expect(updateBlock(tdb.prisma, coach.id, b.id, custom("A", "amrap"))).rejects.toMatchObject({ code: "scoring_locked" });
    await expect(updateBlock(tdb.prisma, coach.id, b.id, barbell())).rejects.toMatchObject({ code: "scoring_locked" });
    expect((await updateBlock(tdb.prisma, coach.id, b.id, custom("Renamed", "for_time"))).title).toBe("Renamed");
  });

  it("renumbers the day after a deletion", async () => {
    const { coach, program } = await setup();
    const a = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("B"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("C"));
    await deleteBlock(tdb.prisma, coach.id, a.id);
    expect(await titles(program.id, 0)).toEqual(["0:B", "1:C"]);
  });

  it("moves blocks within their day and to another day, renumbering both", async () => {
    const { coach, program } = await setup();
    const a = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    const b = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("B"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("C"));
    await createBlock(tdb.prisma, coach.id, program.id, 1, custom("X"));
    await moveBlock(tdb.prisma, coach.id, a.id, 0, 2);
    expect(await titles(program.id, 0)).toEqual(["0:B", "1:C", "2:A"]);
    await moveBlock(tdb.prisma, coach.id, b.id, 1, 0);
    expect(await titles(program.id, 0)).toEqual(["0:C", "1:A"]);
    expect(await titles(program.id, 1)).toEqual(["0:B", "1:X"]);
    await moveBlock(tdb.prisma, coach.id, a.id, 1, 99); // clamped to the end
    expect(await titles(program.id, 1)).toEqual(["0:B", "1:X", "2:A"]);
    expect(await titles(program.id, 0)).toEqual(["0:C"]);
  });

  it("appends duplicated blocks, days and weeks to their target", async () => {
    const { coach, program } = await setup();
    const a = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("B"));
    await createBlock(tdb.prisma, coach.id, program.id, 3, custom("X"));
    await createBlock(tdb.prisma, coach.id, program.id, 1, custom("Existing"));

    await duplicateBlock(tdb.prisma, coach.id, a.id, 1);
    expect(await titles(program.id, 1)).toEqual(["0:Existing", "1:A"]);

    await duplicateDay(tdb.prisma, coach.id, program.id, 0, 1);
    expect(await titles(program.id, 1)).toEqual(["0:Existing", "1:A", "2:A", "3:B"]);

    await duplicateWeek(tdb.prisma, coach.id, program.id, 0, 2);
    expect(await titles(program.id, 14)).toEqual(["0:A", "1:B"]);
    expect(await titles(program.id, 17)).toEqual(["0:X"]);
    expect(await titles(program.id, 15)).toEqual(["0:Existing", "1:A", "2:A", "3:B"]);
    expect((await listWeekBlocks(tdb.prisma, program.id, 2)).length).toBe(7);
  });

  it("refuses to duplicate or move past the end of a closed program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    const b = await makeCustomBlock(tdb.prisma, closed.id, 0);
    await expect(duplicateWeek(tdb.prisma, coach.id, closed.id, 0, 2)).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(duplicateBlock(tdb.prisma, coach.id, b.id, 14)).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(moveBlock(tdb.prisma, coach.id, b.id, 14, 0)).rejects.toMatchObject({ code: "day_out_of_range" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/training/services/blocks.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/lib/training/services/catalog.ts`:

```ts
import { getDomainData } from "@/lib/domain/repository";
import { isLiftMovement } from "../barbell";
import { TrainingError } from "../errors";

export async function assertLiftMovement(name: string): Promise<void> {
  const { movements } = await getDomainData();
  if (!isLiftMovement(name, movements)) throw new TrainingError("invalid_request");
}
```

`src/lib/training/services/blocks.ts`:

```ts
import { Prisma, type Block } from "@/generated/prisma/client";
import { toJson } from "@/lib/json";
import { TrainingError } from "../errors";
import type { BlockInputValue } from "../schemas";
import { assertLiftMovement } from "./catalog";
import { assertWritable, getOwnedProgram } from "./programs";
import type { Db } from "./types";

type ProgramRange = { kind: string; weeks: number | null };

function assertDay(program: ProgramRange, dayIndex: number) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) throw new TrainingError("day_out_of_range");
  if (program.kind === "closed" && dayIndex >= (program.weeks ?? 0) * 7) throw new TrainingError("day_out_of_range");
}

/** Every column of a block, so switching kinds clears the other kind's fields. */
function columns(input: BlockInputValue) {
  const common = {
    kind: input.kind, title: input.title, color: input.color, coachingTips: input.coachingTips, videoUrl: input.videoUrl,
  };
  return input.kind === "custom"
    ? {
      ...common, description: input.description, scoring: input.scoring, timeCapSeconds: input.timeCapSeconds,
      movement: null, sets: Prisma.DbNull, instructions: null,
    }
    : {
      ...common, description: null, scoring: null, timeCapSeconds: null,
      movement: input.movement, sets: toJson(input.sets), instructions: input.instructions,
    };
}

function copyOf(b: Block) {
  return {
    kind: b.kind, title: b.title, color: b.color, coachingTips: b.coachingTips, videoUrl: b.videoUrl,
    description: b.description, scoring: b.scoring, timeCapSeconds: b.timeCapSeconds, movement: b.movement,
    sets: b.sets === null ? Prisma.DbNull : (b.sets as Prisma.InputJsonValue), instructions: b.instructions,
  };
}

async function getOwnedBlock(db: Db, coachId: string, blockId: string) {
  const block = await db.block.findFirst({
    where: { id: blockId, program: { coachId } },
    include: { program: true, _count: { select: { results: true } } },
  });
  if (!block) throw new TrainingError("not_found");
  assertWritable(block.program);
  return block;
}

async function writableProgram(db: Db, coachId: string, programId: string) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  return program;
}

const nextPosition = (db: Db, programId: string, dayIndex: number) => db.block.count({ where: { programId, dayIndex } });

export function listWeekBlocks(db: Db, programId: string, weekIndex: number) {
  return db.block.findMany({
    where: { programId, dayIndex: { gte: weekIndex * 7, lt: weekIndex * 7 + 7 } },
    orderBy: [{ dayIndex: "asc" }, { position: "asc" }],
    include: { _count: { select: { results: true } } },
  });
}

export async function createBlock(db: Db, coachId: string, programId: string, dayIndex: number, input: BlockInputValue) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, dayIndex);
  if (input.kind === "barbell") await assertLiftMovement(input.movement);
  return db.block.create({
    data: { programId, dayIndex, position: await nextPosition(db, programId, dayIndex), ...columns(input) },
  });
}

export async function updateBlock(db: Db, coachId: string, blockId: string, input: BlockInputValue) {
  const block = await getOwnedBlock(db, coachId, blockId);
  const scoringChanged = input.kind !== block.kind || (input.kind === "custom" && input.scoring !== block.scoring);
  if (block._count.results > 0 && scoringChanged) throw new TrainingError("scoring_locked");
  if (input.kind === "barbell") await assertLiftMovement(input.movement);
  return db.block.update({ where: { id: blockId }, data: columns(input) });
}

export async function deleteBlock(db: Db, coachId: string, blockId: string) {
  const block = await getOwnedBlock(db, coachId, blockId);
  await db.$transaction([
    db.block.delete({ where: { id: blockId } }),
    db.block.updateMany({
      where: { programId: block.programId, dayIndex: block.dayIndex, position: { gt: block.position } },
      data: { position: { decrement: 1 } },
    }),
  ]);
}

/** Drag and drop: `toPosition` is the block's final index in the target day (clamped). */
export async function moveBlock(db: Db, coachId: string, blockId: string, toDayIndex: number, toPosition: number) {
  const block = await getOwnedBlock(db, coachId, blockId);
  assertDay(block.program, toDayIndex);
  const { programId } = block;
  await db.$transaction(async (tx) => {
    // Close the gap in the source day, then open one in the target day.
    await tx.block.updateMany({
      where: { programId, dayIndex: block.dayIndex, position: { gt: block.position } },
      data: { position: { decrement: 1 } },
    });
    const others = await tx.block.count({ where: { programId, dayIndex: toDayIndex, id: { not: blockId } } });
    const position = Math.max(0, Math.min(toPosition, others));
    await tx.block.updateMany({
      where: { programId, dayIndex: toDayIndex, id: { not: blockId }, position: { gte: position } },
      data: { position: { increment: 1 } },
    });
    await tx.block.update({ where: { id: blockId }, data: { dayIndex: toDayIndex, position } });
  });
}

export async function duplicateBlock(db: Db, coachId: string, blockId: string, targetDayIndex: number) {
  const block = await getOwnedBlock(db, coachId, blockId);
  assertDay(block.program, targetDayIndex);
  await db.block.create({
    data: {
      programId: block.programId, dayIndex: targetDayIndex,
      position: await nextPosition(db, block.programId, targetDayIndex), ...copyOf(block),
    },
  });
}

/** Appends `blocks` (already ordered) to the day `toDay(block)`, after what is there. */
async function appendCopies(db: Db, programId: string, blocks: Block[], toDay: (b: Block) => number) {
  const positions = new Map<number, number>();
  const data = [];
  for (const b of blocks) {
    const day = toDay(b);
    const position = positions.get(day) ?? (await nextPosition(db, programId, day));
    positions.set(day, position + 1);
    data.push({ programId, dayIndex: day, position, ...copyOf(b) });
  }
  if (data.length) await db.block.createMany({ data });
}

export async function duplicateDay(db: Db, coachId: string, programId: string, fromDay: number, toDay: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, fromDay);
  assertDay(program, toDay);
  const blocks = await db.block.findMany({ where: { programId, dayIndex: fromDay }, orderBy: { position: "asc" } });
  await appendCopies(db, programId, blocks, () => toDay);
}

export async function duplicateWeek(db: Db, coachId: string, programId: string, fromWeek: number, toWeek: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, fromWeek * 7);
  assertDay(program, toWeek * 7 + 6);
  const blocks = await db.block.findMany({
    where: { programId, dayIndex: { gte: fromWeek * 7, lt: fromWeek * 7 + 7 } },
    orderBy: [{ dayIndex: "asc" }, { position: "asc" }],
  });
  await appendCopies(db, programId, blocks, (b) => toWeek * 7 + (b.dayIndex - fromWeek * 7));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/training/services/blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/services/catalog.ts src/lib/training/services/blocks.ts tests/training/services/blocks.test.ts
git commit -m "feat: blocks service (create, edit with scoring lock, delete, move by drag and drop, duplicate block/day/week)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Weekly planner (coach) with drag and drop

**Files:**
- Modify: `package.json` (dependencies `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `src/lib/training/board.ts`
- Test: `tests/training/board.test.ts`
- Create: `src/components/training/colors.ts`
- Create: `src/components/training/BlockCard.tsx`
- Create: `src/app/coach/block-actions.ts`
- Create: `src/app/coach/programs/[id]/page.tsx`
- Create: `src/app/coach/programs/[id]/planner/types.ts`
- Create: `src/app/coach/programs/[id]/planner/BlockEditor.tsx`
- Create: `src/app/coach/programs/[id]/planner/PlannerBlock.tsx`
- Create: `src/app/coach/programs/[id]/planner/CopyForm.tsx`
- Create: `src/app/coach/programs/[id]/planner/DayTools.tsx`
- Create: `src/app/coach/programs/[id]/planner/WeekTools.tsx`
- Create: `src/app/coach/programs/[id]/planner/WeekBoard.tsx`
- Modify: `src/i18n/messages/es.json`, `en.json` (namespaces `block`, `patterns`, `planner`, `editor`)
- Modify: `tests/i18n/messages.test.ts` (every movement pattern has a label)

**Interfaces:**
- Consumes: block services (Task 9), program services and actions (Task 8), `liftCatalog`, `describeSets` (Task 4), `emptyDraft`, `draftFromBlock`, `draftToInput`, `BlockDraft` (Task 4), `Scoring`, `BlockInput`, `BLOCK_COLORS` (Task 4), `formatDay` (Task 6), `orNotFound`, `requireCoachPage`, `requireCoach`, `runAction` (Task 5).
- Produces:
  - `BLOCK_BORDER: Record<BlockColor, string>`, `BLOCK_SWATCH: Record<BlockColor, string>` (`src/components/training/colors.ts`)
  - `<BlockCard block: CardBlock oneRm?: number | null>{footer}</BlockCard>` with `CardBlock = { kind: string; title: string | null; color: string; description: string | null; scoring: string | null; timeCapSeconds: number | null; movement: string | null; sets: BarbellSet[] | null; instructions: string | null; coachingTips: string | null; videoUrl: string | null }` — reused by the athlete day view (Task 12)
  - Block actions: `createBlockAction`, `updateBlockAction`, `deleteBlockAction`, `moveBlockAction({ blockId, toDayIndex, toPosition })`, `duplicateBlockAction`, `duplicateDayAction`, `duplicateWeekAction`, all `Promise<ActionResult>`
  - `board.ts`: `type Board = Record<number, string[]>` (dayIndex → block ids in order), `type Slot = { day: number; index: number }`, `dayDropId(dayIndex): string`, `locate(board, id): Slot | null`, `resolveDrop(board, activeId, overId): Slot | null`, `applyMove(board, activeId, to: Slot): Board`
  - `<WeekBoard days: { dayIndex: number; label: string }[] blocks: PlannerBlockData[] ctx: PlannerContext />` — the 7 day columns, sortable within and across days

Drag and drop uses dnd-kit: each day column is a droppable holding a `SortableContext`; each block is a `useSortable` item dragged by a handle (so its buttons and text stay usable), with pointer and keyboard sensors. On drop the board moves the block optimistically, calls `moveBlockAction`, and rolls back with an error message if the server refuses.

- [ ] **Step 0a: Install dnd-kit**

```bash
pnpm add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```

- [ ] **Step 0b: Write the failing board test**

`tests/training/board.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyMove, dayDropId, locate, resolveDrop, type Board } from "@/lib/training/board";

const board: Board = { 0: ["a", "b", "c"], 1: ["x"], 2: [] };

describe("planner board", () => {
  it("locates blocks", () => {
    expect(locate(board, "c")).toEqual({ day: 0, index: 2 });
    expect(locate(board, "zzz")).toBeNull();
  });

  it("reorders within a day like arrayMove", () => {
    const down = resolveDrop(board, "a", "c")!;
    expect(down).toEqual({ day: 0, index: 2 });
    expect(applyMove(board, "a", down)[0]).toEqual(["b", "c", "a"]);
    const up = resolveDrop(board, "c", "a")!;
    expect(applyMove(board, "c", up)[0]).toEqual(["c", "a", "b"]);
  });

  it("moves to another day before the block it is dropped on", () => {
    const to = resolveDrop(board, "b", "x")!;
    expect(to).toEqual({ day: 1, index: 0 });
    const next = applyMove(board, "b", to);
    expect(next[0]).toEqual(["a", "c"]);
    expect(next[1]).toEqual(["b", "x"]);
  });

  it("appends when dropped on a day column, including an empty one", () => {
    expect(applyMove(board, "b", resolveDrop(board, "b", dayDropId(2))!)[2]).toEqual(["b"]);
    expect(resolveDrop(board, "a", dayDropId(0))).toEqual({ day: 0, index: 2 });
  });

  it("ignores unknown items and never mutates the input", () => {
    expect(resolveDrop(board, "zzz", "a")).toBeNull();
    applyMove(board, "a", { day: 1, index: 0 });
    expect(board[0]).toEqual(["a", "b", "c"]);
  });
});
```

Run: `pnpm test tests/training/board.test.ts` — expected FAIL, module not found.

- [ ] **Step 0c: Implement `board.ts`**

`src/lib/training/board.ts`:

```ts
/** Planner drag and drop: day columns of block ids, and where a drop lands. */
export type Board = Record<number, string[]>;
export type Slot = { day: number; index: number };

const DAY_DROP = /^day-(\d+)$/;

export const dayDropId = (dayIndex: number) => `day-${dayIndex}`;

export function locate(board: Board, id: string): Slot | null {
  for (const [day, ids] of Object.entries(board)) {
    const index = ids.indexOf(id);
    if (index !== -1) return { day: Number(day), index };
  }
  return null;
}

/** Dropped on a block: take its slot. Dropped on a day column: go to the end of that day. */
export function resolveDrop(board: Board, activeId: string, overId: string): Slot | null {
  if (!locate(board, activeId)) return null;
  const match = DAY_DROP.exec(overId);
  if (match) {
    const day = Number(match[1]);
    return { day, index: (board[day] ?? []).filter((id) => id !== activeId).length };
  }
  return locate(board, overId);
}

/** Removes the block from its day and inserts it at `to` (clamped); returns a new board. */
export function applyMove(board: Board, activeId: string, to: Slot): Board {
  const next: Board = Object.fromEntries(
    Object.entries(board).map(([day, ids]) => [day, ids.filter((id) => id !== activeId)]),
  );
  const target = [...(next[to.day] ?? [])];
  target.splice(Math.max(0, Math.min(to.index, target.length)), 0, activeId);
  next[to.day] = target;
  return next;
}
```

Run: `pnpm test tests/training/board.test.ts` — expected PASS.

- [ ] **Step 1: Add the messages**

`es.json`:

```json
  "block": {
    "coachingTips": "Coaching tips",
    "video": "Ver vídeo",
    "timeCap": "Time cap {minutes} min",
    "scoring": {
      "none": "Sin score",
      "for_time": "For time",
      "amrap": "AMRAP (rondas + reps)",
      "reps": "Reps",
      "load": "Carga (kg)",
      "calories": "Calorías",
      "distance": "Distancia (m)",
      "max_time": "Tiempo (más es mejor)"
    }
  },
  "patterns": {
    "squat": "Sentadillas",
    "hinge": "Bisagra de cadera",
    "lunge": "Zancadas",
    "vertical_push": "Empujes verticales",
    "horizontal_push": "Empujes horizontales",
    "vertical_pull": "Tracciones verticales",
    "horizontal_pull": "Tracciones horizontales",
    "core": "Core",
    "carry": "Acarreos",
    "hold": "Isométricos",
    "olympic": "Halterofilia",
    "jump": "Saltos",
    "monostructural": "Monoestructurales"
  },
  "planner": {
    "week": "Semana {week}",
    "dayLabel": "Semana {week} · Día {day}",
    "prevWeek": "← Semana anterior",
    "nextWeek": "Semana siguiente →",
    "weekPublished": "Semana publicada",
    "weekDraft": "Semana en borrador",
    "publishWeek": "Publicar semana",
    "unpublishWeek": "Despublicar",
    "programPublished": "Programa publicado",
    "programDraft": "Programa en borrador",
    "publishProgram": "Publicar programa",
    "unpublishProgram": "Despublicar",
    "addBlock": "+ Bloque",
    "dragHandle": "Arrastrar para mover",
    "duplicate": "Duplicar…",
    "duplicateDay": "Duplicar día…",
    "duplicateWeek": "Duplicar semana…",
    "targetWeek": "Semana",
    "targetDay": "Día",
    "copy": "Copiar",
    "deleteConfirm": "¿Borrar este bloque?",
    "deleteConfirmResults": "Este bloque tiene {count, plural, one {# resultado} other {# resultados}} que se borrarán. ¿Continuar?",
    "results": "{count, plural, one {# resultado} other {# resultados}}",
    "archivedNotice": "Programa archivado: solo lectura."
  },
  "editor": {
    "newBlock": "Nuevo bloque",
    "editBlock": "Editar bloque",
    "kinds": { "custom": "Workout", "barbell": "Barbell Set" },
    "title": "Título",
    "description": "Descripción",
    "scoring": "Score",
    "timeCap": "Time cap (min)",
    "movement": "Movimiento",
    "sets": "Series",
    "reps": "Reps",
    "percent": "% 1RM",
    "kg": "kg",
    "addSet": "+ Serie",
    "removeSet": "Quitar",
    "instructions": "Instrucciones",
    "coachingTips": "Coaching tips",
    "videoUrl": "Enlace de vídeo",
    "color": "Color",
    "scoringLockedHint": "Este bloque ya tiene resultados: su tipo y su score no pueden cambiar."
  }
```

`en.json`:

```json
  "block": {
    "coachingTips": "Coaching tips",
    "video": "Watch video",
    "timeCap": "Time cap {minutes} min",
    "scoring": {
      "none": "No score",
      "for_time": "For time",
      "amrap": "AMRAP (rounds + reps)",
      "reps": "Reps",
      "load": "Load (kg)",
      "calories": "Calories",
      "distance": "Distance (m)",
      "max_time": "Time (more is better)"
    }
  },
  "patterns": {
    "squat": "Squats",
    "hinge": "Hinges",
    "lunge": "Lunges",
    "vertical_push": "Vertical pushes",
    "horizontal_push": "Horizontal pushes",
    "vertical_pull": "Vertical pulls",
    "horizontal_pull": "Horizontal pulls",
    "core": "Core",
    "carry": "Carries",
    "hold": "Holds",
    "olympic": "Olympic lifts",
    "jump": "Jumps",
    "monostructural": "Monostructural"
  },
  "planner": {
    "week": "Week {week}",
    "dayLabel": "Week {week} · Day {day}",
    "prevWeek": "← Previous week",
    "nextWeek": "Next week →",
    "weekPublished": "Week published",
    "weekDraft": "Week in draft",
    "publishWeek": "Publish week",
    "unpublishWeek": "Unpublish",
    "programPublished": "Program published",
    "programDraft": "Program in draft",
    "publishProgram": "Publish program",
    "unpublishProgram": "Unpublish",
    "addBlock": "+ Block",
    "dragHandle": "Drag to move",
    "duplicate": "Duplicate…",
    "duplicateDay": "Duplicate day…",
    "duplicateWeek": "Duplicate week…",
    "targetWeek": "Week",
    "targetDay": "Day",
    "copy": "Copy",
    "deleteConfirm": "Delete this block?",
    "deleteConfirmResults": "This block has {count, plural, one {# result} other {# results}} that will be deleted. Continue?",
    "results": "{count, plural, one {# result} other {# results}}",
    "archivedNotice": "Archived program: read-only."
  },
  "editor": {
    "newBlock": "New block",
    "editBlock": "Edit block",
    "kinds": { "custom": "Workout", "barbell": "Barbell Set" },
    "title": "Title",
    "description": "Description",
    "scoring": "Scoring",
    "timeCap": "Time cap (min)",
    "movement": "Movement",
    "sets": "Sets",
    "reps": "Reps",
    "percent": "% 1RM",
    "kg": "kg",
    "addSet": "+ Set",
    "removeSet": "Remove",
    "instructions": "Instructions",
    "coachingTips": "Coaching tips",
    "videoUrl": "Video link",
    "color": "Color",
    "scoringLockedHint": "This block already has results: its kind and scoring cannot change."
  }
```

Add to `tests/i18n/messages.test.ts`, inside the `describe`:

```ts
  it("labels every movement pattern", () => {
    const patterns = es.patterns as Record<string, string>;
    for (const p of MovementPattern.options) expect(patterns[p], p).toBeTruthy();
  });
```

with `import { MovementPattern } from "@/lib/domain/types";` at the top.

Run: `pnpm test tests/i18n` — expected PASS.

- [ ] **Step 2: Colors and the shared block card**

`src/components/training/colors.ts`:

```ts
import type { BlockColor } from "@/lib/training/schemas";

// Full class names so Tailwind finds them in the source.
export const BLOCK_BORDER: Record<BlockColor, string> = {
  neutral: "border-l-neutral-300",
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-400",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
};

export const BLOCK_SWATCH: Record<BlockColor, string> = {
  neutral: "bg-neutral-300",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export const borderFor = (color: string) => BLOCK_BORDER[color as BlockColor] ?? BLOCK_BORDER.neutral;
```

`src/components/training/BlockCard.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { describeSets } from "@/lib/training/barbell";
import type { BarbellSet } from "@/lib/training/schemas";
import { borderFor } from "./colors";

export type CardBlock = {
  kind: string;
  title: string | null;
  color: string;
  description: string | null;
  scoring: string | null;
  timeCapSeconds: number | null;
  movement: string | null;
  sets: BarbellSet[] | null;
  instructions: string | null;
  coachingTips: string | null;
  videoUrl: string | null;
};

/** One block as athletes see it; the coach planner shows the same card with its tools as children. */
export function BlockCard({ block, oneRm = null, children }: { block: CardBlock; oneRm?: number | null; children?: React.ReactNode }) {
  const t = useTranslations("block");
  const heading = block.title ?? (block.kind === "barbell" ? block.movement : null);
  return (
    <article className={`flex flex-col gap-2 rounded border border-l-4 p-3 ${borderFor(block.color)}`}>
      {heading && <h3 className="font-semibold">{heading}</h3>}
      {block.kind === "custom" && block.scoring && block.scoring !== "none" && (
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t(`scoring.${block.scoring as "for_time"}`)}
          {block.timeCapSeconds ? ` · ${t("timeCap", { minutes: block.timeCapSeconds / 60 })}` : ""}
        </p>
      )}
      {block.kind === "custom" && block.description && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.description}</p>
      )}
      {block.kind === "barbell" && (
        <div className="text-sm">
          {block.title && block.movement && <p className="font-medium">{block.movement}</p>}
          <ul>{describeSets(block.sets ?? [], oneRm).map((line, i) => <li key={i}>{line}</li>)}</ul>
          {block.instructions && <p className="mt-1 whitespace-pre-wrap text-neutral-700">{block.instructions}</p>}
        </div>
      )}
      {block.coachingTips && (
        <details className="text-sm">
          <summary className="cursor-pointer text-amber-700">{t("coachingTips")}</summary>
          <p className="mt-1 whitespace-pre-wrap text-neutral-700">{block.coachingTips}</p>
        </details>
      )}
      {block.videoUrl && (
        <a href={block.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">{t("video")}</a>
      )}
      {children}
    </article>
  );
}
```

- [ ] **Step 3: Block actions**

`src/app/coach/block-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { BlockInput, parse } from "@/lib/training/schemas";
import {
  createBlock, deleteBlock, duplicateBlock, duplicateDay, duplicateWeek, moveBlock, updateBlock,
} from "@/lib/training/services/blocks";

const Id = z.string().min(1).max(64);
const Day = z.number().int().min(0).max(100_000);
const PLANNER = "/coach/programs/[id]";

async function coachAction(fn: (coachId: string) => Promise<unknown>): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    await fn(coach.id);
    revalidatePath(PLANNER, "page");
  });
}

export async function createBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { programId, dayIndex, block } = parse(z.object({ programId: Id, dayIndex: Day, block: BlockInput }), raw);
    await createBlock(prisma, coachId, programId, dayIndex, block);
  });
}

export async function updateBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { blockId, block } = parse(z.object({ blockId: Id, block: BlockInput }), raw);
    await updateBlock(prisma, coachId, blockId, block);
  });
}

export async function deleteBlockAction(blockId: unknown) {
  return coachAction((coachId) => deleteBlock(prisma, coachId, parse(Id, blockId)));
}

export async function moveBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { blockId, toDayIndex, toPosition } = parse(
      z.object({ blockId: Id, toDayIndex: Day, toPosition: z.number().int().min(0).max(1000) }), raw);
    await moveBlock(prisma, coachId, blockId, toDayIndex, toPosition);
  });
}

export async function duplicateBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { blockId, targetDayIndex } = parse(z.object({ blockId: Id, targetDayIndex: Day }), raw);
    await duplicateBlock(prisma, coachId, blockId, targetDayIndex);
  });
}

export async function duplicateDayAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { programId, fromDay, toDay } = parse(z.object({ programId: Id, fromDay: Day, toDay: Day }), raw);
    await duplicateDay(prisma, coachId, programId, fromDay, toDay);
  });
}

export async function duplicateWeekAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { programId, fromWeek, toWeek } = parse(z.object({ programId: Id, fromWeek: Day, toWeek: Day }), raw);
    await duplicateWeek(prisma, coachId, programId, fromWeek, toWeek);
  });
}
```

- [ ] **Step 4: Planner client components**

`src/app/coach/programs/[id]/planner/types.ts`:

```ts
import type { LiftGroup } from "@/lib/training/barbell";
import type { BarbellSet } from "@/lib/training/schemas";

export type PlannerBlockData = {
  id: string;
  dayIndex: number;
  position: number;
  kind: "custom" | "barbell";
  title: string | null;
  color: string;
  coachingTips: string | null;
  videoUrl: string | null;
  description: string | null;
  scoring: string | null;
  timeCapSeconds: number | null;
  movement: string | null;
  sets: BarbellSet[] | null;
  instructions: string | null;
  resultCount: number;
};

export type PlannerContext = {
  programId: string;
  lifts: LiftGroup[];
  readOnly: boolean;
  /** Last week index the coach can target (closed programs), or null when unbounded. */
  maxWeek: number | null;
  weekIndex: number;
};
```

`src/app/coach/programs/[id]/planner/CopyForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  label: string;
  withDay: boolean;
  defaultWeek: number;
  maxWeek: number | null;
  onCopy: (week: number, day: number | null) => Promise<ActionResult>;
  onDone: () => void;
};

/** Asks for a target week (and day), 1-based on screen, 0-based to the action. */
export function CopyForm({ label, withDay, defaultWeek, maxWeek, onCopy, onDone }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(String(defaultWeek + 1));
  const [day, setDay] = useState("1");
  const [error, setError] = useState<ErrorCode | null>(null);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="underline">{label}</button>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await onCopy(Number(week) - 1, withDay ? Number(day) - 1 : null);
    if (r.ok) {
      setOpen(false);
      setError(null);
      onDone();
    } else {
      setError(r.code);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1 text-xs">
      <label>{t("planner.targetWeek")}{" "}
        <input type="number" min={1} max={maxWeek === null ? undefined : maxWeek + 1} value={week}
          onChange={(e) => setWeek(e.target.value)} className="w-14 rounded border px-1" />
      </label>
      {withDay && (
        <label>{t("planner.targetDay")}{" "}
          <input type="number" min={1} max={7} value={day} onChange={(e) => setDay(e.target.value)} className="w-10 rounded border px-1" />
        </label>
      )}
      <button className="underline">{t("planner.copy")}</button>
      <button type="button" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
      {error && <span className="text-red-700">{t(`errors.${error}`)}</span>}
    </form>
  );
}
```

`src/app/coach/programs/[id]/planner/BlockEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BLOCK_SWATCH } from "@/components/training/colors";
import { draftFromBlock, draftToInput, emptyDraft, type BlockDraft, type DraftSet } from "@/lib/training/block-draft";
import type { ErrorCode } from "@/lib/training/errors";
import { BLOCK_COLORS, Scoring } from "@/lib/training/schemas";
import type { LiftGroup } from "@/lib/training/barbell";
import { createBlockAction, updateBlockAction } from "../../../block-actions";
import type { PlannerBlockData } from "./types";

type Props =
  | { mode: "create"; programId: string; dayIndex: number; lifts: LiftGroup[]; onClose: () => void }
  | { mode: "edit"; block: PlannerBlockData; lifts: LiftGroup[]; onClose: () => void };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm">{label}{children}</label>;
}

const input = "rounded border px-3 py-2";

export function BlockEditor(props: Props) {
  const t = useTranslations();
  const router = useRouter();
  const locked = props.mode === "edit" && props.block.resultCount > 0;
  const [draft, setDraft] = useState<BlockDraft>(props.mode === "edit" ? draftFromBlock(props.block) : emptyDraft("custom"));
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<BlockDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setRow = (i: number, patch: Partial<DraftSet>) =>
    set({ sets: draft.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  function switchKind(kind: BlockDraft["kind"]) {
    if (kind === draft.kind) return;
    setDraft({ ...emptyDraft(kind), title: draft.title, color: draft.color, coachingTips: draft.coachingTips, videoUrl: draft.videoUrl });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const block = draftToInput(draft);
    const r = props.mode === "edit"
      ? await updateBlockAction({ blockId: props.block.id, block })
      : await createBlockAction({ programId: props.programId, dayIndex: props.dayIndex, block });
    setPending(false);
    if (r.ok) {
      props.onClose();
      router.refresh();
    } else {
      setError(r.code);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={save} className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded bg-white p-6">
        <h2 className="text-lg font-semibold">{props.mode === "edit" ? t("editor.editBlock") : t("editor.newBlock")}</h2>
        <div className="flex gap-2">
          {(["custom", "barbell"] as const).map((k) => (
            <button key={k} type="button" disabled={locked && draft.kind !== k} onClick={() => switchKind(k)}
              className={draft.kind === k ? "rounded bg-black px-3 py-1 text-white" : "rounded border px-3 py-1 disabled:opacity-40"}>
              {t(`editor.kinds.${k}`)}
            </button>
          ))}
        </div>
        <Field label={t("editor.title")}>
          <input className={input} maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        {draft.kind === "custom" ? (
          <>
            <Field label={t("editor.description")}>
              <textarea required rows={8} maxLength={5000} className={`${input} font-mono text-sm`} value={draft.description}
                onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label={t("editor.scoring")}>
                <select disabled={locked} className={input} value={draft.scoring}
                  onChange={(e) => set({ scoring: e.target.value as BlockDraft["scoring"] })}>
                  {Scoring.options.map((s) => <option key={s} value={s}>{t(`block.scoring.${s}`)}</option>)}
                </select>
              </Field>
              {draft.scoring === "for_time" && (
                <Field label={t("editor.timeCap")}>
                  <input type="number" min={1} max={120} step="0.5" className={input} value={draft.timeCapMinutes}
                    onChange={(e) => set({ timeCapMinutes: e.target.value })} />
                </Field>
              )}
            </div>
            {locked && <p className="text-xs text-neutral-500">{t("editor.scoringLockedHint")}</p>}
          </>
        ) : (
          <>
            <Field label={t("editor.movement")}>
              <select required className={input} value={draft.movement} onChange={(e) => set({ movement: e.target.value })}>
                <option value="" disabled>—</option>
                {props.lifts.map((g) => (
                  <optgroup key={g.pattern} label={t(`patterns.${g.pattern}`)}>
                    {g.movements.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm">{t("editor.sets")}</legend>
              {draft.sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-neutral-500">#{i + 1}</span>
                  <input type="number" min={1} max={100} aria-label={t("editor.reps")} className="w-16 rounded border px-2 py-1"
                    value={s.reps} onChange={(e) => setRow(i, { reps: e.target.value })} />
                  <span>{t("editor.reps")} @</span>
                  <input type="number" min={0} step="0.5" className="w-20 rounded border px-2 py-1" value={s.value}
                    onChange={(e) => setRow(i, { value: e.target.value })} />
                  <select className="rounded border px-2 py-1" value={s.mode} onChange={(e) => setRow(i, { mode: e.target.value as DraftSet["mode"] })}>
                    <option value="percent">{t("editor.percent")}</option>
                    <option value="kg">{t("editor.kg")}</option>
                  </select>
                  {draft.sets.length > 1 && (
                    <button type="button" className="text-red-700" onClick={() => set({ sets: draft.sets.filter((_, j) => j !== i) })}>
                      {t("editor.removeSet")}
                    </button>
                  )}
                </div>
              ))}
              {draft.sets.length < 20 && (
                <button type="button" className="w-fit underline text-sm" onClick={() => set({ sets: [...draft.sets, { ...draft.sets[draft.sets.length - 1] }] })}>
                  {t("editor.addSet")}
                </button>
              )}
            </fieldset>
            <Field label={t("editor.instructions")}>
              <textarea rows={3} maxLength={2000} className={input} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          </>
        )}

        <Field label={t("editor.coachingTips")}>
          <textarea rows={3} maxLength={2000} className={input} value={draft.coachingTips} onChange={(e) => set({ coachingTips: e.target.value })} />
        </Field>
        <Field label={t("editor.videoUrl")}>
          <input type="url" placeholder="https://" className={input} value={draft.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} />
        </Field>
        <fieldset className="flex items-center gap-2">
          <legend className="mb-1 text-sm">{t("editor.color")}</legend>
          {BLOCK_COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={draft.color === c} onClick={() => set({ color: c })}
              className={`h-7 w-7 rounded-full ${BLOCK_SWATCH[c]} ${draft.color === c ? "ring-2 ring-black ring-offset-2" : ""}`} />
          ))}
        </fieldset>
        {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={props.onClose}>{t("common.cancel")}</button>
          <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{t("common.save")}</button>
        </div>
      </form>
    </div>
  );
}
```

`src/app/coach/programs/[id]/planner/PlannerBlock.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BlockCard } from "@/components/training/BlockCard";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { deleteBlockAction, duplicateBlockAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyForm } from "./CopyForm";
import type { PlannerBlockData, PlannerContext } from "./types";

export function PlannerBlock({ block, ctx }: { block: PlannerBlockData; ctx: PlannerContext }) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: ctx.readOnly });

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  function remove() {
    const message = block.resultCount > 0
      ? t("planner.deleteConfirmResults", { count: block.resultCount })
      : t("planner.deleteConfirm");
    if (window.confirm(message)) run(deleteBlockAction(block.id));
  }

  return (
    <>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 opacity-60" : ""}>
      <BlockCard block={block}>
        {block.resultCount > 0 && <p className="text-xs text-neutral-500">{t("planner.results", { count: block.resultCount })}</p>}
        {!ctx.readOnly && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs">
            <button type="button" {...attributes} {...listeners} aria-label={t("planner.dragHandle")} className="cursor-grab touch-none px-1 text-neutral-500">⠿</button>
            <button onClick={() => setEditing(true)} className="underline">{t("common.edit")}</button>
            <CopyForm label={t("planner.duplicate")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
              onCopy={(week, day) => duplicateBlockAction({ blockId: block.id, targetDayIndex: week * 7 + (day ?? 0) })}
              onDone={() => router.refresh()} />
            <button onClick={remove} className="text-red-700 underline">{t("common.delete")}</button>
          </div>
        )}
        {error && <p className="text-xs text-red-700">{t(`errors.${error}`)}</p>}
      </BlockCard>
      </div>
      {/* Outside the sortable node: a transformed ancestor would break the modal's fixed positioning. */}
      {editing && <BlockEditor mode="edit" block={block} lifts={ctx.lifts} onClose={() => setEditing(false)} />}
    </>
  );
}
```

`src/app/coach/programs/[id]/planner/DayTools.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { duplicateDayAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyForm } from "./CopyForm";
import type { PlannerContext } from "./types";

export function DayTools({ dayIndex, ctx }: { dayIndex: number; ctx: PlannerContext }) {
  const t = useTranslations("planner");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <button onClick={() => setAdding(true)} className="rounded border border-dashed py-2 text-sm">{t("addBlock")}</button>
      <CopyForm label={t("duplicateDay")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
        onCopy={(week, day) => duplicateDayAction({ programId: ctx.programId, fromDay: dayIndex, toDay: week * 7 + (day ?? 0) })}
        onDone={() => router.refresh()} />
      {adding && <BlockEditor mode="create" programId={ctx.programId} dayIndex={dayIndex} lifts={ctx.lifts} onClose={() => setAdding(false)} />}
    </div>
  );
}
```

`src/app/coach/programs/[id]/planner/WeekTools.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { duplicateWeekAction } from "../../../block-actions";
import { setProgramPublishedAction, setWeekPublishedAction } from "../../../program-actions";
import { CopyForm } from "./CopyForm";
import type { PlannerContext } from "./types";

type Props = { ctx: PlannerContext; kind: "continuous" | "closed"; published: boolean };

export function WeekTools({ ctx, kind, published }: Props) {
  const t = useTranslations("planner");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  const toggle = () => run(kind === "continuous"
    ? setWeekPublishedAction({ programId: ctx.programId, weekIndex: ctx.weekIndex, published: !published })
    : setProgramPublishedAction({ programId: ctx.programId, published: !published }));

  const status = kind === "continuous"
    ? (published ? t("weekPublished") : t("weekDraft"))
    : (published ? t("programPublished") : t("programDraft"));
  const action = kind === "continuous"
    ? (published ? t("unpublishWeek") : t("publishWeek"))
    : (published ? t("unpublishProgram") : t("publishProgram"));

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <span className={published ? "text-green-700" : "text-neutral-500"}>{status}</span>
      {!ctx.readOnly && (
        <>
          <button onClick={toggle} className={published ? "underline" : "rounded bg-black px-3 py-1 text-white"}>{action}</button>
          <CopyForm label={t("duplicateWeek")} withDay={false} defaultWeek={ctx.weekIndex + 1} maxWeek={ctx.maxWeek}
            onCopy={(week) => duplicateWeekAction({ programId: ctx.programId, fromWeek: ctx.weekIndex, toWeek: week })}
            onDone={() => router.refresh()} />
        </>
      )}
      {error && <span className="text-red-700">{te(error)}</span>}
    </div>
  );
}
```

`src/app/coach/programs/[id]/planner/WeekBoard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { applyMove, dayDropId, locate, resolveDrop, type Board } from "@/lib/training/board";
import type { ErrorCode } from "@/lib/training/errors";
import { moveBlockAction } from "../../../block-actions";
import { DayTools } from "./DayTools";
import { PlannerBlock } from "./PlannerBlock";
import type { PlannerBlockData, PlannerContext } from "./types";

type Day = { dayIndex: number; label: string };

function boardOf(days: Day[], blocks: PlannerBlockData[]): Board {
  return Object.fromEntries(days.map((d) => [
    d.dayIndex,
    blocks.filter((b) => b.dayIndex === d.dayIndex).sort((a, b) => a.position - b.position).map((b) => b.id),
  ]));
}

function DayColumn({ day, ids, byId, ctx }: { day: Day; ids: string[]; byId: Map<string, PlannerBlockData>; ctx: PlannerContext }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day.dayIndex), disabled: ctx.readOnly });
  return (
    <div ref={setNodeRef} className={`flex min-h-24 min-w-0 flex-col gap-2 rounded p-1 ${isOver ? "bg-neutral-100" : ""}`}>
      <h2 className="text-sm font-medium capitalize">{day.label}</h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => <PlannerBlock key={id} block={byId.get(id) as PlannerBlockData} ctx={ctx} />)}
      </SortableContext>
      <DayTools dayIndex={day.dayIndex} ctx={ctx} />
    </div>
  );
}

export function WeekBoard({ days, blocks, ctx }: { days: Day[]; blocks: PlannerBlockData[]; ctx: PlannerContext }) {
  const te = useTranslations("errors");
  const router = useRouter();
  const [source, setSource] = useState(blocks);
  const [board, setBoard] = useState(() => boardOf(days, blocks));
  const [error, setError] = useState<ErrorCode | null>(null);
  // New server data (after router.refresh) replaces the optimistic board.
  if (source !== blocks) {
    setSource(blocks);
    setBoard(boardOf(days, blocks));
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(blocks.map((b) => [b.id, b]));

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const from = locate(board, activeId);
    const to = resolveDrop(board, activeId, String(over.id));
    if (!from || !to || (from.day === to.day && from.index === to.index)) return;
    const previous = board;
    setBoard(applyMove(board, activeId, to));
    const r = await moveBlockAction({ blockId: activeId, toDayIndex: to.day, toPosition: to.index });
    if (r.ok) {
      setError(null);
      router.refresh();
    } else {
      setBoard(previous);
      setError(r.code);
    }
  }

  return (
    // A fixed id keeps dnd-kit's generated aria ids identical on the server and the client.
    <DndContext id={`planner-${ctx.programId}`} sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      {error && <p className="text-sm text-red-700">{te(error)}</p>}
      <div className="grid grid-cols-7 gap-3">
        {days.map((d) => <DayColumn key={d.dayIndex} day={d} ids={board[d.dayIndex] ?? []} byId={byId} ctx={ctx} />)}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 5: Planner page**

`src/app/coach/programs/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDay } from "@/lib/format";
import { liftCatalog } from "@/lib/training/barbell";
import { addDays, daysBetween, fromDbDate, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { listWeekBlocks } from "@/lib/training/services/blocks";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import type { PlannerBlockData, PlannerContext } from "./planner/types";
import { WeekBoard } from "./planner/WeekBoard";
import { WeekTools } from "./planner/WeekTools";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> };

export default async function PlannerPage({ params, searchParams }: Params) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const { week } = await searchParams;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const t = await getTranslations();
  const locale = await getLocale();

  const continuous = program.kind === "continuous";
  const startDate = continuous ? fromDbDate(program.startDate as Date) : null;
  const maxWeek = continuous ? null : (program.weeks as number) - 1;
  const clamp = (w: number) => Math.max(0, maxWeek === null ? w : Math.min(w, maxWeek));
  const requested = Number.parseInt(week ?? "", 10);
  const weekIndex = clamp(Number.isInteger(requested)
    ? requested
    : startDate ? weekIndexOf(daysBetween(startDate, todayIn("UTC"))) : 0);

  const [blocks, weeks, domain] = await Promise.all([
    listWeekBlocks(prisma, program.id, weekIndex),
    publishedWeeks(prisma, program.id),
    getDomainData(),
  ]);
  const ctx: PlannerContext = {
    programId: program.id, lifts: liftCatalog(domain.movements), readOnly: program.archivedAt !== null, maxWeek, weekIndex,
  };
  const toData = (b: (typeof blocks)[number]): PlannerBlockData => ({
    id: b.id, dayIndex: b.dayIndex, position: b.position, kind: b.kind as PlannerBlockData["kind"], title: b.title,
    color: b.color, coachingTips: b.coachingTips, videoUrl: b.videoUrl, description: b.description, scoring: b.scoring,
    timeCapSeconds: b.timeCapSeconds, movement: b.movement, sets: b.sets as BarbellSet[] | null,
    instructions: b.instructions, resultCount: b._count.results,
  });
  const dayLabel = (dayIndex: number) => startDate
    ? formatDay(addDays(startDate, dayIndex), locale)
    : t("planner.dayLabel", { week: weekIndexOf(dayIndex) + 1, day: (dayIndex % 7) + 1 });
  const published = continuous ? weeks.has(weekIndex) : program.publishedAt !== null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold">{program.name}</h1>
        <Link href={`/coach/programs/${program.id}/athletes`} className="text-sm underline">{t("programs.roster")}</Link>
        <Link href={`/coach/programs/${program.id}/settings`} className="text-sm underline">{t("programs.settings")}</Link>
      </div>
      {ctx.readOnly && <p className="rounded bg-neutral-100 p-2 text-sm">{t("planner.archivedNotice")}</p>}
      <div className="flex flex-wrap items-center gap-4">
        {weekIndex > 0 && <Link href={`?week=${weekIndex - 1}`} className="text-sm underline">{t("planner.prevWeek")}</Link>}
        <span className="font-medium">{t("planner.week", { week: weekIndex + 1 })}</span>
        {(maxWeek === null || weekIndex < maxWeek) && <Link href={`?week=${weekIndex + 1}`} className="text-sm underline">{t("planner.nextWeek")}</Link>}
        <WeekTools ctx={ctx} kind={program.kind as "continuous" | "closed"} published={published} />
      </div>
      <WeekBoard
        days={Array.from({ length: 7 }, (_, d) => weekIndex * 7 + d).map((dayIndex) => ({ dayIndex, label: dayLabel(dayIndex) }))}
        blocks={blocks.map(toData)}
        ctx={ctx}
      />
    </section>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green. The planner components import the actions as `../../../block-actions` and `../../../program-actions` (three levels up from `programs/[id]/planner/` is `src/app/coach/`).

```bash
git add package.json pnpm-lock.yaml src/lib/training/board.ts tests/training/board.test.ts src/components/training src/app/coach src/i18n/messages tests/i18n/messages.test.ts
git commit -m "feat: weekly planner with block editor, colors, drag and drop between days, duplication and publication

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Invitations, enrollments and the roster

**Files:**
- Create: `src/lib/training/services/enrollments.ts`
- Modify: `src/app/(athlete)/actions.ts` (add `joinProgramAction`)
- Create: `src/app/(athlete)/join/[code]/page.tsx`, `src/app/(athlete)/join/[code]/JoinButton.tsx`
- Create: `src/app/coach/roster-actions.ts`
- Create: `src/app/coach/programs/[id]/athletes/page.tsx`, `.../athletes/InviteLink.tsx`, `.../athletes/RosterRow.tsx`
- Modify: `src/i18n/messages/es.json`, `en.json` (namespaces `join`, `roster`)
- Test: `tests/training/services/enrollments.test.ts`

**Interfaces:**
- Consumes: `getOwnedProgram` (Task 8), `toDbDate`, `todayIn` (Task 3), `TrainingError` (Task 4), `GoogleSignInButton` (Task 7), `regenerateInviteAction` (Task 8), factories (Task 2).
- Produces:
  - `findProgramByCode(db, code): Promise<(Program & { coach: CoachAccount }) | null>` — null when unknown, archived or a closed program not yet published
  - `joinByCode(db, athlete: { id: string; timezone: string }, code: string, now?: Date): Promise<{ programId: string; status: "joined" | "already" }>` — `invite_invalid`, `enrollment_removed`
  - `getEnrollmentStatus(db, athleteId, programId): Promise<"active" | "removed" | null>`
  - `listRoster(db, coachId, programId): Promise<(Enrollment & { athlete: AthleteAccount })[]>`
  - `setEnrollmentRemoved(db, coachId, enrollmentId, removed: boolean): Promise<void>`
  - `listAthletePrograms(db, athleteId): Promise<(Enrollment & { program: Program & { coach: CoachAccount } })[]>` — active enrollments of non-archived programs, newest first
  - `joinProgramAction(code): Promise<ActionResult<{ programId: string }>>`, `removeAthleteAction(enrollmentId)`, `restoreAthleteAction(enrollmentId)`

- [ ] **Step 1: Write the failing test**

`tests/training/services/enrollments.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete, makeClosed, makeCoach, makeContinuous } from "../../helpers/factories";
import {
  findProgramByCode, getEnrollmentStatus, joinByCode, listAthletePrograms, listRoster, setEnrollmentRemoved,
} from "@/lib/training/services/enrollments";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("enrollments", () => {
  it("joins a continuous program once, without a start date", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    expect(await joinByCode(tdb.prisma, athlete, p.inviteCode)).toEqual({ programId: p.id, status: "joined" });
    expect(await joinByCode(tdb.prisma, athlete, p.inviteCode)).toEqual({ programId: p.id, status: "already" });
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(e.startDate).toBeNull();
  });

  it("starts a closed program on the athlete's local today", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma, "Europe/Madrid");
    const p = await makeClosed(tdb.prisma, coach.id, 4, true);
    await joinByCode(tdb.prisma, athlete, p.inviteCode, new Date("2026-10-07T23:30:00Z"));
    const e = await tdb.prisma.enrollment.findFirstOrThrow({ where: { athleteId: athlete.id } });
    expect(e.startDate?.toISOString().slice(0, 10)).toBe("2026-10-08");
  });

  it("rejects unknown, archived and unpublished-closed invitations", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const draft = await makeClosed(tdb.prisma, coach.id, 4, false);
    const archived = await makeContinuous(tdb.prisma, coach.id);
    await tdb.prisma.program.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    for (const code of ["nope", draft.inviteCode, archived.inviteCode]) {
      await expect(joinByCode(tdb.prisma, athlete, code)).rejects.toMatchObject({ code: "invite_invalid" });
      expect(await findProgramByCode(tdb.prisma, code)).toBeNull();
    }
  });

  it("keeps removed athletes out until the coach restores them", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, p.inviteCode);
    const [row] = await listRoster(tdb.prisma, coach.id, p.id);
    await setEnrollmentRemoved(tdb.prisma, coach.id, row.id, true);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("removed");
    await expect(joinByCode(tdb.prisma, athlete, p.inviteCode)).rejects.toMatchObject({ code: "enrollment_removed" });
    expect(await listAthletePrograms(tdb.prisma, athlete.id)).toHaveLength(0);
    await setEnrollmentRemoved(tdb.prisma, coach.id, row.id, false);
    expect(await getEnrollmentStatus(tdb.prisma, athlete.id, p.id)).toBe("active");
    expect(await listAthletePrograms(tdb.prisma, athlete.id)).toHaveLength(1);
  });

  it("hides the roster from other coaches", async () => {
    const coach = await makeCoach(tdb.prisma);
    const other = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, p.inviteCode);
    const [row] = await listRoster(tdb.prisma, coach.id, p.id);
    await expect(listRoster(tdb.prisma, other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(setEnrollmentRemoved(tdb.prisma, other.id, row.id, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the athlete's programs newest first, without archived ones", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const a = await makeContinuous(tdb.prisma, coach.id);
    const b = await makeClosed(tdb.prisma, coach.id);
    await joinByCode(tdb.prisma, athlete, a.inviteCode);
    await joinByCode(tdb.prisma, athlete, b.inviteCode);
    expect((await listAthletePrograms(tdb.prisma, athlete.id)).map((e) => e.programId)).toEqual([b.id, a.id]);
    await tdb.prisma.program.update({ where: { id: b.id }, data: { archivedAt: new Date() } });
    expect((await listAthletePrograms(tdb.prisma, athlete.id)).map((e) => e.programId)).toEqual([a.id]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/training/services/enrollments.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/lib/training/services/enrollments.ts`:

```ts
import { toDbDate, todayIn } from "../dates";
import { TrainingError } from "../errors";
import { getOwnedProgram } from "./programs";
import type { Db } from "./types";

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function findProgramByCode(db: Db, code: string) {
  const program = await db.program.findUnique({ where: { inviteCode: code }, include: { coach: true } });
  if (!program || program.archivedAt || (program.kind === "closed" && !program.publishedAt)) return null;
  return program;
}

export async function joinByCode(db: Db, athlete: { id: string; timezone: string }, code: string, now: Date = new Date()) {
  const program = await findProgramByCode(db, code);
  if (!program) throw new TrainingError("invite_invalid");
  const existing = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId: program.id, athleteId: athlete.id } },
  });
  if (existing) {
    if (existing.removedAt) throw new TrainingError("enrollment_removed");
    return { programId: program.id, status: "already" as const };
  }
  try {
    await db.enrollment.create({
      data: {
        programId: program.id,
        athleteId: athlete.id,
        startDate: program.kind === "closed" ? toDbDate(todayIn(athlete.timezone, now)) : null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { programId: program.id, status: "already" as const }; // double click
    throw e;
  }
  return { programId: program.id, status: "joined" as const };
}

export async function getEnrollmentStatus(db: Db, athleteId: string, programId: string) {
  const e = await db.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  if (!e) return null;
  return e.removedAt ? ("removed" as const) : ("active" as const);
}

export async function listRoster(db: Db, coachId: string, programId: string) {
  await getOwnedProgram(db, coachId, programId);
  return db.enrollment.findMany({ where: { programId }, include: { athlete: true }, orderBy: { joinedAt: "asc" } });
}

export async function setEnrollmentRemoved(db: Db, coachId: string, enrollmentId: string, removed: boolean) {
  const e = await db.enrollment.findFirst({ where: { id: enrollmentId, program: { coachId } } });
  if (!e) throw new TrainingError("not_found");
  await db.enrollment.update({ where: { id: enrollmentId }, data: { removedAt: removed ? new Date() : null } });
}

export function listAthletePrograms(db: Db, athleteId: string) {
  return db.enrollment.findMany({
    where: { athleteId, removedAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
    orderBy: { joinedAt: "desc" },
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/training/services/enrollments.test.ts`
Expected: PASS. If the "newest first" assertion is flaky because both joins share a millisecond, add `await new Promise((r) => setTimeout(r, 5))` between the two joins in the test.

- [ ] **Step 5: Add the messages**

`es.json`:

```json
  "join": {
    "invalid": "Este enlace de invitación no es válido o ha caducado.",
    "by": "Programa de {coach}",
    "signInToJoin": "Entra con Google para unirte.",
    "needsProfile": "Completa tu perfil de atleta para unirte.",
    "continue": "Continuar",
    "join": "Unirme al programa",
    "removed": "Tu coach te ha quitado de este programa."
  },
  "roster": {
    "title": "Atletas",
    "inviteLink": "Enlace de invitación",
    "copy": "Copiar",
    "copied": "Copiado",
    "regenerate": "Generar un enlace nuevo",
    "regenerateConfirm": "El enlace actual dejará de funcionar. ¿Continuar?",
    "empty": "Todavía no hay atletas. Comparte el enlace de invitación.",
    "joined": "Desde {date}",
    "removedBadge": "Quitado",
    "remove": "Quitar",
    "restore": "Restaurar",
    "removeConfirm": "¿Quitar a este atleta del programa? Sus resultados se conservan.",
    "results": "Resultados",
    "notPublishedHint": "El enlace solo funciona cuando el programa está publicado."
  }
```

`en.json`:

```json
  "join": {
    "invalid": "This invitation link is not valid or has expired.",
    "by": "Program by {coach}",
    "signInToJoin": "Sign in with Google to join.",
    "needsProfile": "Complete your athlete profile to join.",
    "continue": "Continue",
    "join": "Join the program",
    "removed": "Your coach removed you from this program."
  },
  "roster": {
    "title": "Athletes",
    "inviteLink": "Invitation link",
    "copy": "Copy",
    "copied": "Copied",
    "regenerate": "Generate a new link",
    "regenerateConfirm": "The current link will stop working. Continue?",
    "empty": "No athletes yet. Share the invitation link.",
    "joined": "Since {date}",
    "removedBadge": "Removed",
    "remove": "Remove",
    "restore": "Restore",
    "removeConfirm": "Remove this athlete from the program? Their results are kept.",
    "results": "Results",
    "notPublishedHint": "The link only works once the program is published."
  }
```

- [ ] **Step 6: Join flow**

Add to `src/app/(athlete)/actions.ts` (imports: `z` from `zod`, `joinByCode` from `@/lib/training/services/enrollments`):

```ts
export async function joinProgramAction(code: unknown): Promise<ActionResult<{ programId: string }>> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    const { programId } = await joinByCode(prisma, athlete, parse(z.string().min(1).max(64), code));
    revalidatePath("/");
    return { programId };
  });
}
```

`src/app/(athlete)/join/[code]/JoinButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { joinProgramAction } from "../../actions";

export function JoinButton({ code }: { code: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function join() {
    setPending(true);
    const r = await joinProgramAction(code);
    if (r.ok) {
      router.push(`/?program=${r.value.programId}`);
    } else {
      setError(r.code);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={join} disabled={pending} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">{t("join.join")}</button>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}
```

`src/app/(athlete)/join/[code]/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { findProgramByCode, getEnrollmentStatus } from "@/lib/training/services/enrollments";
import { JoinButton } from "./JoinButton";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("join");
  const program = await findProgramByCode(prisma, code);
  if (!program) return <p className="py-12">{t("invalid")}</p>;

  const here = `/join/${code}`;
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  const status = athlete ? await getEnrollmentStatus(prisma, athlete.id, program.id) : null;
  if (status === "active") redirect(`/?program=${program.id}`);

  return (
    <section className="flex flex-col gap-4 py-8">
      <h1 className="text-2xl font-semibold">{program.name}</h1>
      <p className="text-sm text-neutral-600">{t("by", { coach: program.coach.displayName })}</p>
      {program.description && <p className="whitespace-pre-wrap text-sm">{program.description}</p>}
      {!user && (
        <>
          <p className="text-sm">{t("signInToJoin")}</p>
          <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(here)}`} />
        </>
      )}
      {user && !athlete && (
        <>
          <p className="text-sm">{t("needsProfile")}</p>
          <Link href={`/onboarding?next=${encodeURIComponent(here)}`} className="w-fit rounded bg-black px-4 py-2 text-white">{t("continue")}</Link>
        </>
      )}
      {athlete && status === "removed" && <p className="text-sm text-red-700">{t("removed")}</p>}
      {athlete && status === null && <JoinButton code={code} />}
    </section>
  );
}
```

- [ ] **Step 7: Roster**

`src/app/coach/roster-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { setEnrollmentRemoved } from "@/lib/training/services/enrollments";

async function setRemoved(enrollmentId: unknown, removed: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    await setEnrollmentRemoved(prisma, coach.id, parse(z.string().min(1).max(64), enrollmentId), removed);
    revalidatePath("/coach/programs/[id]/athletes", "page");
  });
}

export async function removeAthleteAction(enrollmentId: unknown) {
  return setRemoved(enrollmentId, true);
}

export async function restoreAthleteAction(enrollmentId: unknown) {
  return setRemoved(enrollmentId, false);
}
```

`src/app/coach/programs/[id]/athletes/InviteLink.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { regenerateInviteAction } from "../../../program-actions";

export function InviteLink({ programId, url, readOnly }: { programId: string; url: string; readOnly: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerate() {
    if (!window.confirm(t("roster.regenerateConfirm"))) return;
    const r = await regenerateInviteAction(programId);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("roster.inviteLink")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-neutral-100 px-2 py-1 text-sm">{url}</code>
        <button onClick={copy} className="text-sm underline">{copied ? t("roster.copied") : t("roster.copy")}</button>
        {!readOnly && <button onClick={regenerate} className="text-sm underline">{t("roster.regenerate")}</button>}
      </div>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}
```

`src/app/coach/programs/[id]/athletes/RosterRow.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeAthleteAction, restoreAthleteAction } from "../../../roster-actions";

type Props = { enrollmentId: string; name: string; joined: string; removed: boolean; resultsHref: string };

export function RosterRow({ enrollmentId, name, joined, removed, resultsHref }: Props) {
  const t = useTranslations("roster");
  const router = useRouter();

  async function toggle() {
    if (!removed && !window.confirm(t("removeConfirm"))) return;
    const r = removed ? await restoreAthleteAction(enrollmentId) : await removeAthleteAction(enrollmentId);
    if (r.ok) router.refresh();
  }

  return (
    <li className={`flex items-center gap-4 border-b py-2 ${removed ? "opacity-60" : ""}`}>
      <span className="font-medium">{name}</span>
      <span className="text-sm text-neutral-500">{t("joined", { date: joined })}</span>
      {removed && <span className="rounded bg-neutral-200 px-2 text-xs">{t("removedBadge")}</span>}
      <a href={resultsHref} className="ml-auto text-sm underline">{t("results")}</a>
      <button onClick={toggle} className="text-sm underline">{removed ? t("restore") : t("remove")}</button>
    </li>
  );
}
```

`src/app/coach/programs/[id]/athletes/page.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { fromDbDate } from "@/lib/training/dates";
import { listRoster } from "@/lib/training/services/enrollments";
import { getOwnedProgram } from "@/lib/training/services/programs";
import { InviteLink } from "./InviteLink";
import { RosterRow } from "./RosterRow";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const roster = await listRoster(prisma, coach.id, program.id);
  const t = await getTranslations();
  const locale = await getLocale();
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return (
    <section className="flex flex-col gap-6">
      <Link href={`/coach/programs/${program.id}`} className="text-sm underline">{t("programs.planner")}</Link>
      <h1 className="text-2xl font-semibold">{program.name} · {t("roster.title")}</h1>
      <InviteLink programId={program.id} url={`${base}/join/${program.inviteCode}`} readOnly={program.archivedAt !== null} />
      {program.kind === "closed" && !program.publishedAt && <p className="text-sm text-amber-700">{t("roster.notPublishedHint")}</p>}
      {roster.length === 0 ? <p className="text-neutral-600">{t("roster.empty")}</p> : (
        <ul>
          {roster.map((e) => (
            <RosterRow key={e.id} enrollmentId={e.id} name={e.athlete.displayName}
              joined={formatDay(fromDbDate(e.joinedAt), locale, { day: "numeric", month: "short", year: "numeric" })}
              removed={e.removedAt !== null} resultsHref={`/coach/programs/${program.id}/athletes/${e.athleteId}`} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

The per-athlete results page (`resultsHref`) is built in Task 20; until then the link 404s.

- [ ] **Step 8: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add src/lib/training/services/enrollments.ts "src/app/(athlete)" src/app/coach src/i18n/messages tests/training/services/enrollments.test.ts
git commit -m "feat: invitation links, joining a program, and the coach roster (remove, restore, regenerate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Athlete day view and calendar

**Files:**
- Create: `src/lib/training/access.ts`
- Create: `src/lib/training/services/athlete-view.ts`
- Modify: `src/app/(athlete)/page.tsx` (replace the placeholder)
- Create: `src/app/(athlete)/ProgramSelect.tsx`, `src/app/(athlete)/WeekStrip.tsx`
- Create: `src/app/(athlete)/calendar/page.tsx`
- Modify: `src/i18n/messages/es.json`, `en.json` (namespaces `today`, `calendar`)
- Test: `tests/training/access.test.ts`, `tests/training/services/athlete-view.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `dateOfDay`, `dayIndexOf`, `isDayVisible`, `canLogDay`, `daysBetween`, `fromDbDate`, `todayIn`, `mondayOf`, `addDays`, `monthGrid`, `weekIndexOf` (Task 3), `publishedWeeks` (Task 8), `listAthletePrograms` (Task 11), `BlockCard` (Task 10), `formatDay` (Task 6), `requireAthletePage`, `orNotFound` (Task 5).
- Produces:
  - `athleteTimeline(program: ProgramTiming, enrollment: { startDate: Date | null }, publishedWeeks: ReadonlySet<number>): Timeline` with `ProgramTiming = { kind: string; startDate: Date | null; weeks: number | null; publishedAt: Date | null }`
  - `hasLeaderboard(block: { kind: string; scoring: string | null }, program: { kind: string }): boolean` (used in phase 2)
  - `loadAthleteTimeline(db, athleteId, programId): Promise<{ enrollment; program; timeline: Timeline }>` — `not_found` without an active enrollment in a non-archived program
  - `getAthleteDay(db, athleteId, programId, date: IsoDate, today: IsoDate): Promise<AthleteDay>` with `AthleteDay = { program; timeline; dayIndex: number | null; status: "ok" | "before_start" | "finished" | "unpublished"; loggable: boolean; blocks: Block[] }`
  - `getVisibleDays(db, athleteId, programId, from: IsoDate, to: IsoDate): Promise<Set<IsoDate>>` — dates in the range with at least one visible block

- [ ] **Step 1: Write the failing tests**

`tests/training/access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { athleteTimeline, hasLeaderboard } from "@/lib/training/access";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("athleteTimeline", () => {
  it("anchors continuous programs on the program start", () => {
    const t = athleteTimeline({ kind: "continuous", startDate: d("2026-10-05"), weeks: null, publishedAt: null }, { startDate: null }, new Set([0]));
    expect(t).toEqual({ kind: "continuous", startDate: "2026-10-05", publishedWeeks: new Set([0]) });
  });

  it("anchors closed programs on the athlete's enrollment", () => {
    const t = athleteTimeline({ kind: "closed", startDate: null, weeks: 6, publishedAt: new Date() }, { startDate: d("2026-10-08") }, new Set());
    expect(t).toEqual({ kind: "closed", startDate: "2026-10-08", weeks: 6, published: true });
  });

  it("refuses inconsistent rows", () => {
    expect(() => athleteTimeline({ kind: "closed", startDate: null, weeks: 6, publishedAt: null }, { startDate: null }, new Set())).toThrow();
  });
});

describe("hasLeaderboard", () => {
  it("exists only for scored custom blocks of continuous programs", () => {
    expect(hasLeaderboard({ kind: "custom", scoring: "for_time" }, { kind: "continuous" })).toBe(true);
    expect(hasLeaderboard({ kind: "custom", scoring: "none" }, { kind: "continuous" })).toBe(false);
    expect(hasLeaderboard({ kind: "barbell", scoring: null }, { kind: "continuous" })).toBe(false);
    expect(hasLeaderboard({ kind: "custom", scoring: "amrap" }, { kind: "closed" })).toBe(false);
  });
});
```

`tests/training/services/athlete-view.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock, publishWeek } from "../../helpers/factories";
import { getAthleteDay, getVisibleDays, loadAthleteTimeline } from "@/lib/training/services/athlete-view";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

async function continuousSetup() {
  const coach = await makeCoach(tdb.prisma);
  const athlete = await makeAthlete(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
  await enroll(tdb.prisma, program.id, athlete.id);
  return { coach, athlete, program };
}

describe("athlete view", () => {
  it("shows the blocks of a published day in order, loggable once the day arrives", async () => {
    const { athlete, program } = await continuousSetup();
    await makeCustomBlock(tdb.prisma, program.id, 2, { position: 1, title: "B" });
    await makeCustomBlock(tdb.prisma, program.id, 2, { position: 0, title: "A" });
    await publishWeek(tdb.prisma, program.id, 0);
    const day = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-07", "2026-10-07");
    expect(day.status).toBe("ok");
    expect(day.loggable).toBe(true);
    expect(day.blocks.map((b) => b.title)).toEqual(["A", "B"]);
    const tomorrow = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-08", "2026-10-07");
    expect(tomorrow.loggable).toBe(false);
  });

  it("hides unpublished weeks and reports dates before the start", async () => {
    const { athlete, program } = await continuousSetup();
    await makeCustomBlock(tdb.prisma, program.id, 8);
    const unpublished = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-13", "2026-10-13");
    expect(unpublished).toMatchObject({ status: "unpublished", blocks: [] });
    const before = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-01", "2026-10-01");
    expect(before.status).toBe("before_start");
  });

  it("runs closed programs from the athlete's own start and finishes them", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeClosed(tdb.prisma, coach.id, 1, true);
    await enroll(tdb.prisma, program.id, athlete.id, "2026-10-08");
    await makeCustomBlock(tdb.prisma, program.id, 0, { title: "Day 1" });
    const first = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-08", "2026-10-08");
    expect(first.blocks.map((b) => b.title)).toEqual(["Day 1"]);
    const after = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-15", "2026-10-15");
    expect(after.status).toBe("finished");
  });

  it("refuses programs the athlete does not follow", async () => {
    const { program } = await continuousSetup();
    const stranger = await makeAthlete(tdb.prisma);
    await expect(loadAthleteTimeline(tdb.prisma, stranger.id, program.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the visible days of a range", async () => {
    const { athlete, program } = await continuousSetup();
    await makeCustomBlock(tdb.prisma, program.id, 0);
    await makeCustomBlock(tdb.prisma, program.id, 2);
    await makeCustomBlock(tdb.prisma, program.id, 9); // week 1, unpublished
    await publishWeek(tdb.prisma, program.id, 0);
    const days = await getVisibleDays(tdb.prisma, athlete.id, program.id, "2026-10-01", "2026-10-18");
    expect([...days].sort()).toEqual(["2026-10-05", "2026-10-07"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/training/access.test.ts tests/training/services/athlete-view.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/lib/training/access.ts`:

```ts
import { fromDbDate, type Timeline } from "./dates";

export type ProgramTiming = { kind: string; startDate: Date | null; weeks: number | null; publishedAt: Date | null };

/** The athlete's calendar for a program: continuous anchors on the program, closed on the enrollment. */
export function athleteTimeline(
  program: ProgramTiming, enrollment: { startDate: Date | null }, publishedWeeks: ReadonlySet<number>,
): Timeline {
  if (program.kind === "continuous" && program.startDate) {
    return { kind: "continuous", startDate: fromDbDate(program.startDate), publishedWeeks };
  }
  if (program.kind === "closed" && program.weeks && enrollment.startDate) {
    return { kind: "closed", startDate: fromDbDate(enrollment.startDate), weeks: program.weeks, published: program.publishedAt !== null };
  }
  throw new Error(`inconsistent program timing (${program.kind})`);
}

export function hasLeaderboard(block: { kind: string; scoring: string | null }, program: { kind: string }): boolean {
  return program.kind === "continuous" && block.kind === "custom" && block.scoring !== null && block.scoring !== "none";
}
```

`src/lib/training/services/athlete-view.ts`:

```ts
import { athleteTimeline } from "../access";
import { canLogDay, dateOfDay, dayIndexOf, daysBetween, isDayVisible, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { publishedWeeks } from "./programs";
import type { Db } from "./types";

export async function loadAthleteTimeline(db: Db, athleteId: string, programId: string) {
  const enrollment = await db.enrollment.findFirst({
    where: { athleteId, programId, removedAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
  });
  if (!enrollment) throw new TrainingError("not_found");
  const timeline = athleteTimeline(enrollment.program, enrollment, await publishedWeeks(db, programId));
  return { enrollment, program: enrollment.program, timeline };
}

export async function getAthleteDay(db: Db, athleteId: string, programId: string, date: IsoDate, today: IsoDate) {
  const { program, timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const dayIndex = dayIndexOf(timeline, date);
  const empty = { program, timeline, dayIndex, loggable: false, blocks: [] };
  if (dayIndex === null) return { ...empty, status: date < timeline.startDate ? "before_start" as const : "finished" as const };
  if (!isDayVisible(timeline, dayIndex)) return { ...empty, status: "unpublished" as const };
  const blocks = await db.block.findMany({ where: { programId, dayIndex }, orderBy: { position: "asc" } });
  return { program, timeline, dayIndex, status: "ok" as const, loggable: canLogDay(timeline, dayIndex, today), blocks };
}

export type AthleteDay = Awaited<ReturnType<typeof getAthleteDay>>;

export async function getVisibleDays(db: Db, athleteId: string, programId: string, from: IsoDate, to: IsoDate) {
  const { timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const groups = await db.block.groupBy({
    by: ["dayIndex"],
    where: { programId, dayIndex: { gte: Math.max(0, daysBetween(timeline.startDate, from)), lte: daysBetween(timeline.startDate, to) } },
  });
  return new Set(groups.filter((g) => isDayVisible(timeline, g.dayIndex)).map((g) => dateOfDay(timeline, g.dayIndex)));
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test tests/training/access.test.ts tests/training/services/athlete-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the messages**

`es.json`:

```json
  "today": {
    "noPrograms": "Todavía no sigues ningún programa. Pide a tu coach su enlace de invitación.",
    "program": "Programa",
    "today": "Hoy",
    "startsOn": "Este programa empieza el {date}.",
    "finished": "Programa terminado. Tu historial sigue disponible.",
    "nothing": "Nada publicado para este día.",
    "calendar": "Calendario",
    "dayOfProgram": "Semana {week} · Día {day}"
  },
  "calendar": {
    "title": "Calendario",
    "prevMonth": "← Mes anterior",
    "nextMonth": "Mes siguiente →"
  }
```

`en.json`:

```json
  "today": {
    "noPrograms": "You do not follow any program yet. Ask your coach for their invitation link.",
    "program": "Program",
    "today": "Today",
    "startsOn": "This program starts on {date}.",
    "finished": "Program finished. Your history is still available.",
    "nothing": "Nothing published for this day.",
    "calendar": "Calendar",
    "dayOfProgram": "Week {week} · Day {day}"
  },
  "calendar": {
    "title": "Calendar",
    "prevMonth": "← Previous month",
    "nextMonth": "Next month →"
  }
```

- [ ] **Step 6: Day view components**

`src/app/(athlete)/ProgramSelect.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function ProgramSelect({ programs, selected }: { programs: { id: string; name: string }[]; selected: string }) {
  const t = useTranslations("today");
  const router = useRouter();
  if (programs.length < 2) return <h1 className="text-center text-lg font-semibold">{programs[0]?.name}</h1>;
  return (
    <select aria-label={t("program")} value={selected} onChange={(e) => router.push(`/?program=${e.target.value}`)}
      className="w-full rounded border px-3 py-2 text-center font-semibold">
      {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
```

`src/app/(athlete)/WeekStrip.tsx`:

```tsx
import Link from "next/link";
import { formatDay } from "@/lib/format";
import { addDays, mondayOf, type IsoDate } from "@/lib/training/dates";

type Props = { programId: string; selected: IsoDate; today: IsoDate; withBlocks: Set<IsoDate>; locale: string };

/** Monday-to-Sunday strip around the selected date; a dot marks days with published blocks. */
export function WeekStrip({ programId, selected, today, withBlocks, locale }: Props) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="flex items-center gap-1">
      <Link href={`/?program=${programId}&date=${addDays(monday, -7)}`} className="px-1 text-neutral-500" aria-label="previous week">‹</Link>
      <ol className="grid flex-1 grid-cols-7 gap-1 text-center text-xs">
        {days.map((d) => (
          <li key={d}>
            <Link href={`/?program=${programId}&date=${d}`}
              className={`flex flex-col items-center rounded py-1 ${d === selected ? "border border-black" : ""} ${d === today ? "font-bold" : ""}`}>
              <span className="uppercase text-neutral-500">{formatDay(d, locale, { weekday: "short" })}</span>
              <span className="text-base">{Number(d.slice(8))}</span>
              <span className={`h-1 w-1 rounded-full ${withBlocks.has(d) ? "bg-black" : "bg-transparent"}`} />
            </Link>
          </li>
        ))}
      </ol>
      <Link href={`/?program=${programId}&date=${addDays(monday, 7)}`} className="px-1 text-neutral-500" aria-label="next week">›</Link>
    </div>
  );
}
```

- [ ] **Step 7: Day view page**

`src/app/(athlete)/page.tsx` (replace the placeholder):

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BlockCard } from "@/components/training/BlockCard";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { addDays, isIsoDate, mondayOf, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { getAthleteDay, getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { ProgramSelect } from "./ProgramSelect";
import { WeekStrip } from "./WeekStrip";

type Props = { searchParams: Promise<{ program?: string; date?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  const athlete = await requireAthletePage();
  const { program: programParam, date: dateParam } = await searchParams;
  const t = await getTranslations("today");
  const locale = await getLocale();

  const enrollments = await listAthletePrograms(prisma, athlete.id);
  if (enrollments.length === 0) return <p className="py-12 text-center text-neutral-600">{t("noPrograms")}</p>;

  const programId = enrollments.some((e) => e.programId === programParam) ? programParam as string : enrollments[0].programId;
  const today = todayIn(athlete.timezone);
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const monday = mondayOf(date);
  const [day, withBlocks] = await Promise.all([
    orNotFound(getAthleteDay(prisma, athlete.id, programId, date, today)),
    getVisibleDays(prisma, athlete.id, programId, monday, addDays(monday, 6)),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <ProgramSelect programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={programId} />
      <WeekStrip programId={programId} selected={date} today={today} withBlocks={withBlocks} locale={locale} />
      <div className="flex items-center justify-between text-sm">
        <span className="capitalize text-neutral-600">
          {formatDay(date, locale, { weekday: "long", day: "numeric", month: "long" })}
          {day.timeline.kind === "closed" && day.dayIndex !== null &&
            ` · ${t("dayOfProgram", { week: weekIndexOf(day.dayIndex) + 1, day: (day.dayIndex % 7) + 1 })}`}
        </span>
        <span className="flex gap-3">
          {date !== today && <Link href={`/?program=${programId}`} className="underline">{t("today")}</Link>}
          <Link href={`/calendar?program=${programId}&month=${date.slice(0, 7)}`} className="underline">{t("calendar")}</Link>
        </span>
      </div>
      {day.status === "before_start" && <p className="text-neutral-600">{t("startsOn", { date: formatDay(day.timeline.startDate, locale) })}</p>}
      {day.status === "finished" && <p className="text-neutral-600">{t("finished")}</p>}
      {(day.status === "unpublished" || (day.status === "ok" && day.blocks.length === 0)) && <p className="text-neutral-600">{t("nothing")}</p>}
      {day.blocks.map((b) => (
        <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} />
      ))}
    </section>
  );
}
```

- [ ] **Step 8: Calendar page**

`src/app/(athlete)/calendar/page.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { monthGrid, todayIn } from "@/lib/training/dates";
import { getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ program?: string; month?: string }> }) {
  const athlete = await requireAthletePage();
  const { program: programParam, month: monthParam } = await searchParams;
  const t = await getTranslations("calendar");
  const locale = await getLocale();
  const enrollments = await listAthletePrograms(prisma, athlete.id);
  const enrollment = enrollments.find((e) => e.programId === programParam) ?? enrollments[0];
  if (!enrollment) return null;

  const today = todayIn(athlete.timezone);
  const month = monthParam && MONTH.test(monthParam) ? monthParam : today.slice(0, 7);
  const weeks = monthGrid(month);
  const withBlocks = await orNotFound(getVisibleDays(prisma, athlete.id, enrollment.programId, weeks[0][0], weeks.at(-1)![6]));
  const href = (m: string) => `/calendar?program=${enrollment.programId}&month=${m}`;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-center text-lg font-semibold">{enrollment.program.name}</h1>
      <div className="flex items-center justify-between text-sm">
        <Link href={href(shiftMonth(month, -1))} className="underline">{t("prevMonth")}</Link>
        <span className="font-medium capitalize">{formatDay(`${month}-01`, locale, { month: "long", year: "numeric" })}</span>
        <Link href={href(shiftMonth(month, 1))} className="underline">{t("nextMonth")}</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {weeks[0].map((d) => <span key={d} className="uppercase text-neutral-500">{formatDay(d, locale, { weekday: "narrow" })}</span>)}
        {weeks.flat().map((d) => (
          <Link key={d} href={`/?program=${enrollment.programId}&date=${d}`}
            className={`flex flex-col items-center rounded py-2 ${d.slice(0, 7) === month ? "" : "text-neutral-300"} ${d === today ? "font-bold" : ""}`}>
            {Number(d.slice(8))}
            <span className={`mt-1 h-1 w-1 rounded-full ${withBlocks.has(d) ? "bg-black" : "bg-transparent"}`} />
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add src/lib/training/access.ts src/lib/training/services/athlete-view.ts "src/app/(athlete)" src/i18n/messages tests/training/access.test.ts tests/training/services/athlete-view.test.ts
git commit -m "feat: athlete day view (program selector, week strip, blocks) and month calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Phase 1 verification and PR

**Files:** none new (fixes only, if the checks find issues).

- [ ] **Step 1: Full local checks**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: all clean and green.

- [ ] **Step 2: Apply the migration to the Neon `dev` branch**

Ask the user to turn the corporate VPN off (it blocks port 5432), then run:

```bash
pnpm db:deploy
```

Expected: `20261008120000_coaching` applied. Never point this at `production`.

- [ ] **Step 3: Drive the app in the browser**

Start the `dev` configuration from `.claude/launch.json` with the preview tools. The user signs in with Google themselves in the browser pane (never enter credentials for them). Verify, taking a screenshot of each:

1. `/coach/signin` → Google → `/coach/pending` shows "awaiting approval". Run `pnpm coach:approve <the user's email>`; reloading `/coach` shows "My programs".
2. Create a continuous program starting next Monday; add a Custom block (for_time, cap 15) and a Barbell Set (Back Squat, 3 × 5 @ 80 %) on two days; drag a block to reorder it within its day and to another day (also with the keyboard: focus the handle, Space, arrows, Space), reload and check the order persisted; recolor, duplicate a day; publish week 1.
3. Create a closed program of 2 weeks; check the roster shows "the link only works once published"; publish it.
4. Open the continuous program's invitation link in the same browser: it redirects through `/onboarding` and joins; `/` shows the program, the week strip marks the two days, the blocks render with their colors, "80 %" shows without kg.
5. Unpublish week 1 as coach: the athlete's day shows "Nothing published for this day."
6. Switch the athlete language to English in `/me`: the UI changes language; switch back.
7. Remove the athlete from the roster: `/` shows the empty state; restore them.

Check `read_console_messages` and `preview_logs` for errors after each flow.

- [ ] **Step 4: Push and open PR 1**

```bash
git push -u origin feat/coaching
```

Open the PR against `main` with `gh pr create`, titled "Coaching phase 1: programs, planner, invitations and the athlete day view", summarizing the tasks, the verification above, and that the migration must be applied to production Neon before the first production deploy. End the description with the attribution line from the session instructions.

---
# Phase 2 — Results and competition

Start phase 2 once PR 1 is merged: update `main` and branch `feat/coaching-results` from it. If PR 1 is still open, continue on `feat/coaching` and say so in PR 2.

### Task 14: Scores (`scoring.ts`), result inputs and the log form draft

**Files:**
- Create: `src/lib/training/scoring.ts`
- Create: `src/lib/training/log-draft.ts`
- Modify: `src/lib/training/schemas.ts` (add `ResultInput`, `PrInput`)
- Test: `tests/training/scoring.test.ts`, `tests/training/log-draft.test.ts`

**Interfaces:**
- Consumes: `Scoring`, `Division`, `BarbellSet`, `parse` (Task 4), `isIsoDate` (Task 3), `percentToKg` (Task 4).
- Produces (`scoring.ts`):
  - `BarbellResultSchema`, `type BarbellResult = { sets: { kg: number; reps: number }[] }`
  - `type ScoreTarget = { kind: "custom"; scoring: Scoring; timeCapSeconds: number | null } | { kind: "barbell" }`
  - `scoreTarget(block: { kind: string; scoring: string | null; timeCapSeconds: number | null }): ScoreTarget`
  - `type EvaluatedScore = { score: object; sortKey: number | null; capped: boolean }`
  - `evaluateScore(target, raw: unknown): EvaluatedScore | null`
  - `formatDuration(seconds: number): string`, `formatScore(target, score: unknown): string`
- Produces (`schemas.ts`): `ResultInput` (`{ blockId; division; score: unknown; notes: string | null }`), `type ResultInputValue`; `PrInput` (`{ movement; kg; achievedOn: IsoDate }`), `type PrInputValue`
- Produces (`log-draft.ts`): `type LogDraft`, `logDraftFor(target, existing: unknown | null, prescribed: BarbellSet[], oneRm: number | null): LogDraft`, `buildScore(target, d: LogDraft): unknown`

- [ ] **Step 1: Write the failing tests**

`tests/training/scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateScore, formatDuration, formatScore, scoreTarget, type ScoreTarget } from "@/lib/training/scoring";

const custom = (scoring: string, timeCapSeconds: number | null = null): ScoreTarget =>
  scoreTarget({ kind: "custom", scoring, timeCapSeconds });

describe("evaluateScore", () => {
  it("ranks finished for-time results by time, faster higher", () => {
    expect(evaluateScore(custom("for_time"), { seconds: 572 })).toEqual({ score: { seconds: 572 }, sortKey: -572, capped: false });
  });

  it("accepts capped results only on blocks with a time cap, ranked by reps", () => {
    expect(evaluateScore(custom("for_time", 900), { capped: true, reps: 87 })).toEqual({ score: { capped: true, reps: 87 }, sortKey: 87, capped: true });
    expect(evaluateScore(custom("for_time"), { capped: true, reps: 87 })).toBeNull();
  });

  it("rejects a finish time beyond the cap and a zero time", () => {
    expect(evaluateScore(custom("for_time", 900), { seconds: 901 })).toBeNull();
    expect(evaluateScore(custom("for_time"), { seconds: 0 })).toBeNull();
  });

  it("orders AMRAPs by rounds then reps", () => {
    const a = evaluateScore(custom("amrap"), { rounds: 5, reps: 12 })!;
    const b = evaluateScore(custom("amrap"), { rounds: 6, reps: 0 })!;
    expect(b.sortKey! > a.sortKey!).toBe(true);
  });

  it("takes single values for the other scorings", () => {
    expect(evaluateScore(custom("reps"), { reps: 150 })?.sortKey).toBe(150);
    expect(evaluateScore(custom("load"), { kg: 102.5 })?.sortKey).toBe(102.5);
    expect(evaluateScore(custom("calories"), { calories: 45 })?.sortKey).toBe(45);
    expect(evaluateScore(custom("distance"), { meters: 1200 })?.sortKey).toBe(1200);
    expect(evaluateScore(custom("max_time"), { seconds: 95 })?.sortKey).toBe(95);
  });

  it("rejects wrong shapes, extra keys, negatives, fractions of reps and 'none'", () => {
    expect(evaluateScore(custom("reps"), { kg: 10 })).toBeNull();
    expect(evaluateScore(custom("reps"), { reps: 10, extra: 1 })).toBeNull();
    expect(evaluateScore(custom("reps"), { reps: -1 })).toBeNull();
    expect(evaluateScore(custom("reps"), { reps: 1.5 })).toBeNull();
    expect(evaluateScore(custom("none"), {})).toBeNull();
  });

  it("stores barbell sets without a rank", () => {
    expect(evaluateScore({ kind: "barbell" }, { sets: [{ kg: 100, reps: 5 }] })).toEqual({ score: { sets: [{ kg: 100, reps: 5 }] }, sortKey: null, capped: false });
    expect(evaluateScore({ kind: "barbell" }, { sets: [] })).toBeNull();
  });
});

describe("formatScore", () => {
  it("formats durations", () => {
    expect(formatDuration(572)).toBe("9:32");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("formats every scoring", () => {
    expect(formatScore(custom("for_time"), { seconds: 572 })).toBe("9:32");
    expect(formatScore(custom("for_time", 900), { capped: true, reps: 87 })).toBe("CAP · 87");
    expect(formatScore(custom("amrap"), { rounds: 5, reps: 12 })).toBe("5 + 12");
    expect(formatScore(custom("reps"), { reps: 150 })).toBe("150");
    expect(formatScore(custom("load"), { kg: 102.5 })).toBe("102.5 kg");
    expect(formatScore(custom("calories"), { calories: 45 })).toBe("45 cal");
    expect(formatScore(custom("distance"), { meters: 1200 })).toBe("1200 m");
    expect(formatScore(custom("max_time"), { seconds: 95 })).toBe("1:35");
    expect(formatScore({ kind: "barbell" }, { sets: [{ kg: 100, reps: 5 }, { kg: 102.5, reps: 3 }] })).toBe("5×100 kg · 3×102.5 kg");
  });
});
```

`tests/training/log-draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildScore, logDraftFor } from "@/lib/training/log-draft";
import { evaluateScore, scoreTarget } from "@/lib/training/scoring";

const custom = (scoring: string, cap: number | null = null) => scoreTarget({ kind: "custom", scoring, timeCapSeconds: cap });

describe("log drafts", () => {
  it("builds a for-time score from minutes and seconds", () => {
    const d = { ...logDraftFor(custom("for_time"), null, [], null), minutes: "9", seconds: "32" };
    expect(buildScore(custom("for_time"), d)).toEqual({ seconds: 572 });
  });

  it("builds a capped score from the reps done", () => {
    const d = { ...logDraftFor(custom("for_time", 900), null, [], null), capped: true, reps: "87" };
    expect(buildScore(custom("for_time", 900), d)).toEqual({ capped: true, reps: 87 });
  });

  it("round-trips an existing AMRAP result", () => {
    const d = logDraftFor(custom("amrap"), { rounds: 5, reps: 12 }, [], null);
    expect(buildScore(custom("amrap"), d)).toEqual({ rounds: 5, reps: 12 });
  });

  it("prefills barbell rows from the prescription and the 1RM", () => {
    const d = logDraftFor({ kind: "barbell" }, null, [{ reps: 5, percent: 80, kg: null }, { reps: 3, percent: null, kg: 110 }], 125);
    expect(d.sets).toEqual([{ kg: "100", reps: "5" }, { kg: "110", reps: "3" }]);
    expect(evaluateScore({ kind: "barbell" }, buildScore({ kind: "barbell" }, d))).not.toBeNull();
  });

  it("leaves the kg empty for a percentage without a 1RM", () => {
    expect(logDraftFor({ kind: "barbell" }, null, [{ reps: 5, percent: 80, kg: null }], null).sets).toEqual([{ kg: "", reps: "5" }]);
  });

  it("produces an invalid score for empty required fields", () => {
    const d = logDraftFor(custom("reps"), null, [], null);
    expect(evaluateScore(custom("reps"), buildScore(custom("reps"), d))).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/training/scoring.test.ts tests/training/log-draft.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `scoring.ts`**

```ts
import { z } from "zod";
import type { Scoring } from "./schemas";

const Count = z.number().int().min(0).max(100_000);
const Duration = z.number().int().min(1).max(86_400);

export const BarbellResultSchema = z.object({
  sets: z.array(z.object({ kg: z.number().min(0).max(500), reps: z.number().int().min(0).max(100) }).strict()).min(1).max(20),
}).strict();
export type BarbellResult = z.output<typeof BarbellResultSchema>;

const ForTime = z.union([
  z.object({ seconds: Duration }).strict(),
  z.object({ capped: z.literal(true), reps: Count }).strict(),
]);
const Amrap = z.object({ rounds: Count, reps: z.number().int().min(0).max(9_999) }).strict();
const Reps = z.object({ reps: Count }).strict();
const Load = z.object({ kg: z.number().min(0).max(1_000) }).strict();
const Calories = z.object({ calories: Count }).strict();
const Distance = z.object({ meters: z.number().min(0).max(1_000_000) }).strict();
const MaxTime = z.object({ seconds: Duration }).strict();

export type ScoreTarget = { kind: "custom"; scoring: Scoring; timeCapSeconds: number | null } | { kind: "barbell" };
export type EvaluatedScore = { score: object; sortKey: number | null; capped: boolean };

export function scoreTarget(block: { kind: string; scoring: string | null; timeCapSeconds: number | null }): ScoreTarget {
  return block.kind === "barbell"
    ? { kind: "barbell" }
    : { kind: "custom", scoring: (block.scoring ?? "none") as Scoring, timeCapSeconds: block.timeCapSeconds };
}

function single<T extends object>(schema: z.ZodType<T>, raw: unknown, key: (s: T) => number): EvaluatedScore | null {
  const r = schema.safeParse(raw);
  return r.success ? { score: r.data, sortKey: key(r.data), capped: false } : null;
}

/** Validates a score against its block and computes its rank key (higher is better). */
export function evaluateScore(target: ScoreTarget, raw: unknown): EvaluatedScore | null {
  if (target.kind === "barbell") {
    const r = BarbellResultSchema.safeParse(raw);
    return r.success ? { score: r.data, sortKey: null, capped: false } : null;
  }
  switch (target.scoring) {
    case "for_time": {
      const r = ForTime.safeParse(raw);
      if (!r.success) return null;
      if ("capped" in r.data) {
        return target.timeCapSeconds === null ? null : { score: r.data, sortKey: r.data.reps, capped: true };
      }
      if (target.timeCapSeconds !== null && r.data.seconds > target.timeCapSeconds) return null;
      return { score: r.data, sortKey: -r.data.seconds, capped: false };
    }
    case "amrap": return single(Amrap, raw, (s) => s.rounds * 10_000 + s.reps);
    case "reps": return single(Reps, raw, (s) => s.reps);
    case "load": return single(Load, raw, (s) => s.kg);
    case "calories": return single(Calories, raw, (s) => s.calories);
    case "distance": return single(Distance, raw, (s) => s.meters);
    case "max_time": return single(MaxTime, raw, (s) => s.seconds);
    case "none": return null;
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** Language-neutral score text ("9:32", "5 + 12", "CAP · 87", "100 kg"). */
export function formatScore(target: ScoreTarget, score: unknown): string {
  const s = score as Record<string, number> & { sets?: { kg: number; reps: number }[]; capped?: boolean };
  if (target.kind === "barbell") return (s.sets ?? []).map((x) => `${x.reps}×${num(x.kg)} kg`).join(" · ");
  switch (target.scoring) {
    case "for_time": return s.capped ? `CAP · ${s.reps}` : formatDuration(s.seconds);
    case "amrap": return `${s.rounds} + ${s.reps}`;
    case "reps": return String(s.reps);
    case "load": return `${num(s.kg)} kg`;
    case "calories": return `${s.calories} cal`;
    case "distance": return `${num(s.meters)} m`;
    case "max_time": return formatDuration(s.seconds);
    case "none": return "";
  }
}
```

- [ ] **Step 4: Add the inputs to `schemas.ts`**

Append:

```ts
export const ResultInput = z.object({
  blockId: z.string().min(1).max(64),
  division: Division,
  score: z.unknown(),
  notes: optionalText(1000),
});
export type ResultInputValue = z.output<typeof ResultInput>;

export const PrInput = z.object({
  movement: z.string().trim().min(1).max(80),
  kg: z.number().positive().max(500),
  achievedOn: IsoDateString,
});
export type PrInputValue = z.output<typeof PrInput>;
```

- [ ] **Step 5: Implement `log-draft.ts`**

```ts
import { percentToKg } from "./barbell";
import type { BarbellSet } from "./schemas";
import type { ScoreTarget } from "./scoring";

/** The log form's state: strings as typed. */
export type LogDraft = {
  minutes: string;
  seconds: string;
  capped: boolean;
  rounds: string;
  reps: string;
  value: string;
  sets: { kg: string; reps: string }[];
};

const str = (n: unknown) => (typeof n === "number" ? String(n) : "");

export function logDraftFor(target: ScoreTarget, existing: unknown | null, prescribed: BarbellSet[], oneRm: number | null): LogDraft {
  const s = (existing ?? {}) as Record<string, number> & { capped?: boolean; sets?: { kg: number; reps: number }[] };
  const draft: LogDraft = { minutes: "", seconds: "", capped: false, rounds: "", reps: "", value: "", sets: [] };
  if (target.kind === "barbell") {
    draft.sets = s.sets
      ? s.sets.map((x) => ({ kg: String(x.kg), reps: String(x.reps) }))
      : prescribed.map((p) => ({
        kg: p.kg !== null ? String(p.kg) : p.percent !== null && oneRm !== null ? String(percentToKg(p.percent, oneRm)) : "",
        reps: String(p.reps),
      }));
    return draft;
  }
  if (typeof s.seconds === "number") {
    draft.minutes = String(Math.floor(s.seconds / 60));
    draft.seconds = String(s.seconds % 60);
  }
  draft.capped = s.capped === true;
  draft.rounds = str(s.rounds);
  draft.reps = str(s.reps);
  draft.value = str(s.kg ?? s.calories ?? s.meters ?? (target.scoring === "reps" ? s.reps : undefined));
  return draft;
}

const int = (v: string) => (v.trim() === "" ? NaN : Number(v));
const part = (v: string) => (v.trim() === "" ? 0 : Number(v));

/** The raw score sent to the server, which validates it with `evaluateScore`. */
export function buildScore(target: ScoreTarget, d: LogDraft): unknown {
  if (target.kind === "barbell") return { sets: d.sets.map((x) => ({ kg: int(x.kg), reps: int(x.reps) })) };
  const seconds = part(d.minutes) * 60 + part(d.seconds);
  switch (target.scoring) {
    case "for_time": return d.capped ? { capped: true, reps: int(d.reps) } : { seconds };
    case "max_time": return { seconds };
    case "amrap": return { rounds: int(d.rounds), reps: part(d.reps) };
    case "reps": return { reps: int(d.value) };
    case "load": return { kg: int(d.value) };
    case "calories": return { calories: int(d.value) };
    case "distance": return { meters: int(d.value) };
    case "none": return {};
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test tests/training`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/training/scoring.ts src/lib/training/log-draft.ts src/lib/training/schemas.ts tests/training/scoring.test.ts tests/training/log-draft.test.ts
git commit -m "feat: score validation, rank keys and formatting for every scoring type; log form drafts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Ranking (`leaderboard.ts`) and PR rules (`prs.ts`)

**Files:**
- Create: `src/lib/training/leaderboard.ts`, `src/lib/training/prs.ts`
- Test: `tests/training/leaderboard.test.ts`, `tests/training/prs.test.ts`

**Interfaces:**
- Produces:
  - `type RankInput = { division: string; capped: boolean; sortKey: number | null; createdAt: Date }`
  - `rank<T extends RankInput>(entries: readonly T[]): (T & { rank: number })[]` — rx before scaled, finished before capped, `sortKey` descending; equal keys share a rank (1, 1, 3); ties listed by `createdAt`
  - `currentOneRm(entries: readonly { kg: number }[]): number | null`
  - `singleAbove(sets: readonly { kg: number; reps: number }[], current: number | null): number | null`

- [ ] **Step 1: Write the failing tests**

`tests/training/leaderboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rank } from "@/lib/training/leaderboard";

const at = (n: number) => new Date(2026, 9, 7, 10, n);
const e = (id: string, division: string, sortKey: number, capped = false, minute = 0) => ({ id, division, sortKey, capped, createdAt: at(minute) });

describe("rank", () => {
  it("puts rx first, finished before capped, then higher keys", () => {
    const ranked = rank([
      e("scaled-fast", "scaled", -400),
      e("rx-capped", "rx", 80, true),
      e("rx-slow", "rx", -700),
      e("rx-fast", "rx", -500),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["rx-fast", "rx-slow", "rx-capped", "scaled-fast"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("shares ranks between equal scores and lists ties by entry time", () => {
    const ranked = rank([e("b", "rx", -500, false, 2), e("a", "rx", -500, false, 1), e("c", "rx", -600)]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
  });

  it("handles an empty board", () => {
    expect(rank([])).toEqual([]);
  });
});
```

`tests/training/prs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { currentOneRm, singleAbove } from "@/lib/training/prs";

describe("PR rules", () => {
  it("takes the heaviest entry as the current 1RM", () => {
    expect(currentOneRm([{ kg: 140 }, { kg: 150 }, { kg: 145 }])).toBe(150);
    expect(currentOneRm([])).toBeNull();
  });

  it("detects a logged single above the current 1RM", () => {
    expect(singleAbove([{ kg: 140, reps: 3 }, { kg: 152.5, reps: 1 }, { kg: 155, reps: 1 }], 150)).toBe(155);
    expect(singleAbove([{ kg: 150, reps: 1 }], 150)).toBeNull(); // equal is not a PR
    expect(singleAbove([{ kg: 160, reps: 2 }], 150)).toBeNull(); // only singles count
  });

  it("offers the first single as a 1RM when there is none", () => {
    expect(singleAbove([{ kg: 100, reps: 1 }], null)).toBe(100);
    expect(singleAbove([{ kg: 0, reps: 1 }], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/training/leaderboard.test.ts tests/training/prs.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/lib/training/leaderboard.ts`:

```ts
export type RankInput = { division: string; capped: boolean; sortKey: number | null; createdAt: Date };

function compare(a: RankInput, b: RankInput): number {
  const division = (x: RankInput) => (x.division === "rx" ? 0 : 1);
  return division(a) - division(b) || Number(a.capped) - Number(b.capped) || (b.sortKey ?? 0) - (a.sortKey ?? 0);
}

/** Competition ranking (1, 1, 3): rx before scaled, finished before capped, higher sortKey first. */
export function rank<T extends RankInput>(entries: readonly T[]): (T & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => compare(a, b) || a.createdAt.getTime() - b.createdAt.getTime());
  const ranked: (T & { rank: number })[] = [];
  sorted.forEach((entry, i) => {
    const tied = i > 0 && compare(sorted[i - 1], entry) === 0;
    ranked.push({ ...entry, rank: tied ? ranked[i - 1].rank : i + 1 });
  });
  return ranked;
}
```

`src/lib/training/prs.ts`:

```ts
/** The current 1RM is the heaviest recorded entry. */
export function currentOneRm(entries: readonly { kg: number }[]): number | null {
  return entries.length ? Math.max(...entries.map((e) => e.kg)) : null;
}

/** The heaviest single above the current 1RM, if any: the app then offers to record it. */
export function singleAbove(sets: readonly { kg: number; reps: number }[], current: number | null): number | null {
  const singles = sets.filter((s) => s.reps === 1 && s.kg > 0).map((s) => s.kg);
  if (singles.length === 0) return null;
  const top = Math.max(...singles);
  return current === null || top > current ? top : null;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test tests/training/leaderboard.test.ts tests/training/prs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/leaderboard.ts src/lib/training/prs.ts tests/training/leaderboard.test.ts tests/training/prs.test.ts
git commit -m "feat: leaderboard ranking (divisions, caps, shared ranks) and PR rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Results, leaderboard, fist bumps and PRs (services)

**Files:**
- Create: `src/lib/training/services/results.ts`
- Create: `src/lib/training/services/prs.ts`
- Test: `tests/training/services/results.test.ts`, `tests/training/services/prs.test.ts`

**Interfaces:**
- Consumes: `athleteTimeline`, `hasLeaderboard` (Task 12), `canLogDay`, `dateOfDay`, `isDayVisible`, `todayIn`, `toDbDate`, `fromDbDate`, `addDays` (Task 3), `evaluateScore`, `formatScore`, `scoreTarget`, `BarbellResult` (Task 14), `rank` (Task 15), `currentOneRm`, `singleAbove` (Task 15), `publishedWeeks`, `getOwnedProgram` (Task 8), `assertLiftMovement` (Task 9), `ResultInputValue`, `PrInputValue` (Task 14), `toJson` (existing).
- Produces (`services/results.ts`):
  - `getVisibleBlock(db, athlete: { id; timezone }, blockId, now?: Date): Promise<{ block: Block & { program: Program }; timeline: Timeline; date: IsoDate; loggable: boolean }>` — `not_found` unless enrolled (active), program not archived and day visible; `loggable` is false for `scoring: "none"`
  - `type SinglePrompt = { movement: string; from: number | null; to: number }`
  - `saveResult(db, athlete, input: ResultInputValue, now?: Date): Promise<{ resultId: string; singlePrompt: SinglePrompt | null }>` — `not_loggable`, `invalid_score`; upserts (one result per athlete and block); barbell results are stored as `rx`
  - `deleteResult(db, athleteId, blockId): Promise<void>`
  - `getMyResult(db, athleteId, blockId): Promise<Result | null>`
  - `getDayResults(db, athleteId, programId, blockIds: string[]): Promise<{ mine: Map<string, Result>; counts: Map<string, number> }>` (counts only active enrollments)
  - `type LeaderboardEntry = { resultId; rank; athleteId; displayName; avatarUrl: string | null; division; capped; formatted; notes: string | null; bumps: number; bumpedByViewer: boolean; own: boolean }`
  - `getLeaderboard(db, viewer: { athlete: { id; timezone } } | { coachId: string }, blockId): Promise<{ block; date: IsoDate; entries: LeaderboardEntry[] }>` — `not_found` when the block has no leaderboard
  - `toggleFistBump(db, athlete, resultId): Promise<{ bumped: boolean; count: number }>` — `own_result`
  - `listBlockResults(db, coachId, blockId): Promise<{ block; results: CoachResultRow[] }>` and `listAthleteResults(db, coachId, programId, athleteId): Promise<{ athlete; results: CoachResultRow[] }>` with `CoachResultRow = { id; athleteId; displayName; blockId; blockTitle: string; division; formatted; notes: string | null; performedOn: IsoDate }`
- Produces (`services/prs.ts`): `listPrs(db, athleteId): Promise<PersonalRecord[]>` (movement asc, newest first), `listMovementPrs(db, athleteId, movement)`, `addPr(db, athleteId, input: PrInputValue): Promise<PersonalRecord>`, `deletePr(db, athleteId, prId): Promise<void>`, `oneRmMap(db, athleteId, movements: string[]): Promise<Map<string, number>>`

- [ ] **Step 1: Write the failing tests**

`tests/training/services/results.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import {
  enroll, makeAthlete, makeBarbellBlock, makeClosed, makeCoach, makeContinuous, makeCustomBlock, publishWeek,
} from "../../helpers/factories";
import {
  deleteResult, getDayResults, getLeaderboard, getMyResult, listAthleteResults, listBlockResults, saveResult, toggleFistBump,
} from "@/lib/training/services/results";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const NOW = new Date("2026-10-07T18:00:00Z"); // Wednesday of week 0 (program starts Monday 2026-10-05)

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
  await publishWeek(tdb.prisma, program.id, 0);
  const [ana, ben, cai] = [await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma), await makeAthlete(tdb.prisma)];
  for (const a of [ana, ben, cai]) await enroll(tdb.prisma, program.id, a.id);
  const wod = await makeCustomBlock(tdb.prisma, program.id, 2, { scoring: "for_time", timeCapSeconds: 900 });
  return { coach, program, ana, ben, cai, wod };
}
const log = (athlete: { id: string; timezone: string }, blockId: string, score: unknown, division: "rx" | "scaled" = "rx") =>
  saveResult(tdb.prisma, athlete, { blockId, division, score, notes: null }, NOW);

describe("results", () => {
  it("saves one result per athlete and block, editing it in place", async () => {
    const { ana, wod } = await setup();
    await log(ana, wod.id, { seconds: 600 });
    await log(ana, wod.id, { seconds: 580 });
    expect(await tdb.prisma.result.count()).toBe(1);
    const mine = await getMyResult(tdb.prisma, ana.id, wod.id);
    expect(mine).toMatchObject({ sortKey: -580, capped: false });
    expect(mine?.performedOn.toISOString().slice(0, 10)).toBe("2026-10-07");
  });

  it("refuses future days, unscored blocks, invalid scores and strangers", async () => {
    const { program, ana, wod } = await setup();
    const tomorrow = await makeCustomBlock(tdb.prisma, program.id, 3);
    const noScore = await makeCustomBlock(tdb.prisma, program.id, 2, { scoring: "none", position: 1 });
    const stranger = await makeAthlete(tdb.prisma);
    await expect(log(ana, tomorrow.id, { seconds: 600 })).rejects.toMatchObject({ code: "not_loggable" });
    await expect(log(ana, noScore.id, {})).rejects.toMatchObject({ code: "not_loggable" });
    await expect(log(ana, wod.id, { seconds: 901 })).rejects.toMatchObject({ code: "invalid_score" });
    await expect(log(stranger, wod.id, { seconds: 600 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("ranks the leaderboard and keeps removed athletes out of it", async () => {
    const { coach, ana, ben, cai, wod } = await setup();
    await log(ana, wod.id, { seconds: 640 });
    await log(ben, wod.id, { seconds: 600 }, "scaled");
    await log(cai, wod.id, { capped: true, reps: 90 });
    const board = await getLeaderboard(tdb.prisma, { athlete: ana }, wod.id);
    expect(board.date).toBe("2026-10-07");
    expect(board.entries.map((e) => [e.displayName === ana.displayName, e.formatted, e.rank])).toEqual([
      [true, "10:40", 1], [false, "CAP · 90", 2], [false, "10:00", 3],
    ]);
    expect(board.entries[0].own).toBe(true);
    await tdb.prisma.enrollment.updateMany({ where: { athleteId: cai.id }, data: { removedAt: new Date() } });
    const coachView = await getLeaderboard(tdb.prisma, { coachId: coach.id }, wod.id);
    expect(coachView.entries).toHaveLength(2);
  });

  it("has no leaderboard for barbell blocks or closed programs", async () => {
    const { program, ana } = await setup();
    const squat = await makeBarbellBlock(tdb.prisma, program.id, 2);
    await expect(getLeaderboard(tdb.prisma, { athlete: ana }, squat.id)).rejects.toMatchObject({ code: "not_found" });
    const closed = await makeClosed(tdb.prisma, program.coachId, 2, true);
    await enroll(tdb.prisma, closed.id, ana.id, "2026-10-05");
    const wod = await makeCustomBlock(tdb.prisma, closed.id, 0);
    await expect(getLeaderboard(tdb.prisma, { athlete: ana }, wod.id)).rejects.toMatchObject({ code: "not_found" });
    await log(ana, wod.id, { seconds: 300 }); // results are still stored in closed programs
    expect(await getMyResult(tdb.prisma, ana.id, wod.id)).not.toBeNull();
  });

  it("toggles fist bumps but never on your own result", async () => {
    const { ana, ben, wod } = await setup();
    const { resultId } = await log(ana, wod.id, { seconds: 640 });
    expect(await toggleFistBump(tdb.prisma, ben, resultId)).toEqual({ bumped: true, count: 1 });
    expect(await toggleFistBump(tdb.prisma, ben, resultId)).toEqual({ bumped: false, count: 0 });
    await expect(toggleFistBump(tdb.prisma, ana, resultId)).rejects.toMatchObject({ code: "own_result" });
    await toggleFistBump(tdb.prisma, ben, resultId);
    const board = await getLeaderboard(tdb.prisma, { athlete: ben }, wod.id);
    expect(board.entries[0]).toMatchObject({ bumps: 1, bumpedByViewer: true });
  });

  it("offers to update the 1RM after a heavier single", async () => {
    const { program, ana } = await setup();
    const squat = await makeBarbellBlock(tdb.prisma, program.id, 2, "Back Squat", [{ reps: 1, percent: 90, kg: null }]);
    await tdb.prisma.personalRecord.create({ data: { athleteId: ana.id, movement: "Back Squat", kg: 150, achievedOn: new Date("2026-09-01T00:00:00Z") } });
    const lighter = await log(ana, squat.id, { sets: [{ kg: 140, reps: 1 }] });
    expect(lighter.singlePrompt).toBeNull();
    const heavier = await log(ana, squat.id, { sets: [{ kg: 155, reps: 1 }] });
    expect(heavier.singlePrompt).toEqual({ movement: "Back Squat", from: 150, to: 155 });
    expect((await getMyResult(tdb.prisma, ana.id, squat.id))?.division).toBe("rx");
  });

  it("deletes a result and counts the day's scores", async () => {
    const { program, ana, ben, wod } = await setup();
    await log(ana, wod.id, { seconds: 640 });
    await log(ben, wod.id, { seconds: 600 });
    const day = await getDayResults(tdb.prisma, ana.id, program.id, [wod.id]);
    expect(day.counts.get(wod.id)).toBe(2);
    expect(day.mine.get(wod.id)?.sortKey).toBe(-640);
    await deleteResult(tdb.prisma, ana.id, wod.id);
    expect(await getMyResult(tdb.prisma, ana.id, wod.id)).toBeNull();
  });

  it("lists results for the coach, by block and by athlete", async () => {
    const { coach, program, ana, wod } = await setup();
    const other = await makeCoach(tdb.prisma);
    await log(ana, wod.id, { seconds: 640 });
    expect((await listBlockResults(tdb.prisma, coach.id, wod.id)).results[0]).toMatchObject({ formatted: "10:40", performedOn: "2026-10-07" });
    expect((await listAthleteResults(tdb.prisma, coach.id, program.id, ana.id)).results).toHaveLength(1);
    await expect(listBlockResults(tdb.prisma, other.id, wod.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listAthleteResults(tdb.prisma, other.id, program.id, ana.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
```

`tests/training/services/prs.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete } from "../../helpers/factories";
import { addPr, deletePr, listMovementPrs, listPrs, oneRmMap } from "@/lib/training/services/prs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("PRs", () => {
  it("adds catalog barbell PRs only and keeps the history", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 140, achievedOn: "2026-06-01" });
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 150, achievedOn: "2026-09-01" });
    await expect(addPr(tdb.prisma, a.id, { movement: "Air Squat", kg: 10, achievedOn: "2026-09-01" })).rejects.toMatchObject({ code: "invalid_request" });
    expect((await listMovementPrs(tdb.prisma, a.id, "Back Squat")).map((p) => p.kg)).toEqual([150, 140]);
    expect(await listPrs(tdb.prisma, a.id)).toHaveLength(2);
  });

  it("maps movements to their heaviest entry", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 150, achievedOn: "2026-09-01" });
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 145, achievedOn: "2026-10-01" });
    await addPr(tdb.prisma, a.id, { movement: "Deadlift", kg: 180, achievedOn: "2026-10-01" });
    const map = await oneRmMap(tdb.prisma, a.id, ["Back Squat", "Clean"]);
    expect([...map]).toEqual([["Back Squat", 150]]);
  });

  it("deletes only the athlete's own entries", async () => {
    const a = await makeAthlete(tdb.prisma);
    const b = await makeAthlete(tdb.prisma);
    const pr = await addPr(tdb.prisma, a.id, { movement: "Deadlift", kg: 180, achievedOn: "2026-10-01" });
    await expect(deletePr(tdb.prisma, b.id, pr.id)).rejects.toMatchObject({ code: "not_found" });
    await deletePr(tdb.prisma, a.id, pr.id);
    expect(await listPrs(tdb.prisma, a.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/training/services/results.test.ts tests/training/services/prs.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `services/prs.ts`**

```ts
import { toDbDate } from "../dates";
import { TrainingError } from "../errors";
import type { PrInputValue } from "../schemas";
import { assertLiftMovement } from "./catalog";
import type { Db } from "./types";

export function listPrs(db: Db, athleteId: string) {
  return db.personalRecord.findMany({
    where: { athleteId },
    orderBy: [{ movement: "asc" }, { achievedOn: "desc" }, { createdAt: "desc" }],
  });
}

export function listMovementPrs(db: Db, athleteId: string, movement: string) {
  return db.personalRecord.findMany({
    where: { athleteId, movement },
    orderBy: [{ achievedOn: "desc" }, { createdAt: "desc" }],
  });
}

export async function addPr(db: Db, athleteId: string, input: PrInputValue) {
  await assertLiftMovement(input.movement);
  return db.personalRecord.create({
    data: { athleteId, movement: input.movement, kg: input.kg, achievedOn: toDbDate(input.achievedOn) },
  });
}

export async function deletePr(db: Db, athleteId: string, prId: string) {
  const { count } = await db.personalRecord.deleteMany({ where: { id: prId, athleteId } });
  if (count === 0) throw new TrainingError("not_found");
}

export async function oneRmMap(db: Db, athleteId: string, movements: string[]): Promise<Map<string, number>> {
  if (movements.length === 0) return new Map();
  const rows = await db.personalRecord.groupBy({
    by: ["movement"], where: { athleteId, movement: { in: movements } }, _max: { kg: true },
  });
  return new Map(rows.filter((r) => r._max.kg !== null).map((r) => [r.movement, r._max.kg as number]));
}
```

- [ ] **Step 4: Implement `services/results.ts`**

```ts
import { toJson } from "@/lib/json";
import { athleteTimeline, hasLeaderboard } from "../access";
import { addDays, canLogDay, dateOfDay, fromDbDate, isDayVisible, toDbDate, todayIn, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { rank } from "../leaderboard";
import { currentOneRm, singleAbove } from "../prs";
import type { ResultInputValue } from "../schemas";
import { evaluateScore, formatScore, scoreTarget, type BarbellResult } from "../scoring";
import { getOwnedProgram, publishedWeeks } from "./programs";
import type { Db } from "./types";

type AthleteRef = { id: string; timezone: string };

/** A block the athlete may see: active enrollment, program not archived, day visible. */
export async function getVisibleBlock(db: Db, athlete: AthleteRef, blockId: string, now: Date = new Date()) {
  const block = await db.block.findUnique({ where: { id: blockId }, include: { program: true } });
  if (!block || block.program.archivedAt) throw new TrainingError("not_found");
  const enrollment = await db.enrollment.findFirst({ where: { programId: block.programId, athleteId: athlete.id, removedAt: null } });
  if (!enrollment) throw new TrainingError("not_found");
  const timeline = athleteTimeline(block.program, enrollment, await publishedWeeks(db, block.programId));
  if (!isDayVisible(timeline, block.dayIndex)) throw new TrainingError("not_found");
  const scored = block.kind === "barbell" || (block.scoring !== null && block.scoring !== "none");
  return {
    block,
    timeline,
    date: dateOfDay(timeline, block.dayIndex),
    loggable: scored && canLogDay(timeline, block.dayIndex, todayIn(athlete.timezone, now)),
  };
}

export type SinglePrompt = { movement: string; from: number | null; to: number };

export async function saveResult(db: Db, athlete: AthleteRef, input: ResultInputValue, now: Date = new Date()) {
  const { block, date, loggable } = await getVisibleBlock(db, athlete, input.blockId, now);
  if (!loggable) throw new TrainingError("not_loggable");
  const evaluated = evaluateScore(scoreTarget(block), input.score);
  if (!evaluated) throw new TrainingError("invalid_score");
  const data = {
    division: block.kind === "barbell" ? "rx" : input.division,
    score: toJson(evaluated.score),
    sortKey: evaluated.sortKey,
    capped: evaluated.capped,
    notes: input.notes,
    performedOn: toDbDate(date),
  };
  const result = await db.result.upsert({
    where: { blockId_athleteId: { blockId: block.id, athleteId: athlete.id } },
    create: { blockId: block.id, athleteId: athlete.id, ...data },
    update: data,
  });

  let singlePrompt: SinglePrompt | null = null;
  if (block.kind === "barbell" && block.movement) {
    const records = await db.personalRecord.findMany({ where: { athleteId: athlete.id, movement: block.movement }, select: { kg: true } });
    const current = currentOneRm(records);
    const top = singleAbove((evaluated.score as BarbellResult).sets, current);
    if (top !== null) singlePrompt = { movement: block.movement, from: current, to: top };
  }
  return { resultId: result.id, singlePrompt };
}

export async function deleteResult(db: Db, athleteId: string, blockId: string) {
  await db.result.deleteMany({ where: { blockId, athleteId } });
}

export function getMyResult(db: Db, athleteId: string, blockId: string) {
  return db.result.findUnique({ where: { blockId_athleteId: { blockId, athleteId } } });
}

/** The viewer's results and the active-athlete score counts for the blocks of one day. */
export async function getDayResults(db: Db, athleteId: string, programId: string, blockIds: string[]) {
  if (blockIds.length === 0) return { mine: new Map(), counts: new Map<string, number>() };
  const [mine, counts] = await Promise.all([
    db.result.findMany({ where: { athleteId, blockId: { in: blockIds } } }),
    db.result.groupBy({
      by: ["blockId"],
      where: { blockId: { in: blockIds }, athlete: { enrollments: { some: { programId, removedAt: null } } } },
      _count: { _all: true },
    }),
  ]);
  return {
    mine: new Map(mine.map((r) => [r.blockId, r])),
    counts: new Map(counts.map((c) => [c.blockId, c._count._all])),
  };
}

export type LeaderboardEntry = {
  resultId: string; rank: number; athleteId: string; displayName: string; avatarUrl: string | null;
  division: string; capped: boolean; formatted: string; notes: string | null;
  bumps: number; bumpedByViewer: boolean; own: boolean;
};

type Viewer = { athlete: AthleteRef } | { coachId: string };

async function leaderboardBlock(db: Db, viewer: Viewer, blockId: string) {
  if ("coachId" in viewer) {
    const block = await db.block.findFirst({ where: { id: blockId, program: { coachId: viewer.coachId } }, include: { program: true } });
    if (!block) throw new TrainingError("not_found");
    return block;
  }
  return (await getVisibleBlock(db, viewer.athlete, blockId)).block;
}

export async function getLeaderboard(db: Db, viewer: Viewer, blockId: string) {
  const block = await leaderboardBlock(db, viewer, blockId);
  if (!hasLeaderboard(block, block.program) || !block.program.startDate) throw new TrainingError("not_found");
  const viewerId = "athlete" in viewer ? viewer.athlete.id : null;
  const results = await db.result.findMany({
    where: { blockId, athlete: { enrollments: { some: { programId: block.programId, removedAt: null } } } },
    include: {
      athlete: true,
      _count: { select: { fistBumps: true } },
      fistBumps: { where: { athleteId: viewerId ?? "" }, select: { athleteId: true } },
    },
  });
  const target = scoreTarget(block);
  const entries: LeaderboardEntry[] = rank(results).map((r) => ({
    resultId: r.id, rank: r.rank, athleteId: r.athleteId, displayName: r.athlete.displayName, avatarUrl: r.athlete.avatarUrl,
    division: r.division, capped: r.capped, formatted: formatScore(target, r.score), notes: r.notes,
    bumps: r._count.fistBumps, bumpedByViewer: r.fistBumps.length > 0, own: r.athleteId === viewerId,
  }));
  return { block, date: addDays(fromDbDate(block.program.startDate), block.dayIndex), entries };
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function toggleFistBump(db: Db, athlete: AthleteRef, resultId: string) {
  const result = await db.result.findUnique({ where: { id: resultId } });
  if (!result) throw new TrainingError("not_found");
  const { block } = await getVisibleBlock(db, athlete, result.blockId);
  if (!hasLeaderboard(block, block.program)) throw new TrainingError("not_found");
  if (result.athleteId === athlete.id) throw new TrainingError("own_result");
  const key = { resultId_athleteId: { resultId, athleteId: athlete.id } };
  const existing = await db.fistBump.findUnique({ where: key });
  if (existing) {
    await db.fistBump.delete({ where: key });
  } else {
    try {
      await db.fistBump.create({ data: { resultId, athleteId: athlete.id } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // double tap
    }
  }
  return { bumped: !existing, count: await db.fistBump.count({ where: { resultId } }) };
}

export type CoachResultRow = {
  id: string; athleteId: string; displayName: string; blockId: string; blockTitle: string;
  division: string; formatted: string; notes: string | null; performedOn: IsoDate;
};

type ResultWithRefs = {
  id: string; athleteId: string; blockId: string; division: string; score: unknown; notes: string | null; performedOn: Date;
  athlete: { displayName: string };
  block: { kind: string; scoring: string | null; timeCapSeconds: number | null; title: string | null; movement: string | null };
};

const toRow = (r: ResultWithRefs): CoachResultRow => ({
  id: r.id, athleteId: r.athleteId, displayName: r.athlete.displayName, blockId: r.blockId,
  blockTitle: r.block.title ?? r.block.movement ?? "", division: r.division,
  formatted: formatScore(scoreTarget(r.block), r.score), notes: r.notes, performedOn: fromDbDate(r.performedOn),
});

export async function listBlockResults(db: Db, coachId: string, blockId: string) {
  const block = await db.block.findFirst({ where: { id: blockId, program: { coachId } }, include: { program: true } });
  if (!block) throw new TrainingError("not_found");
  const results = await db.result.findMany({
    where: { blockId }, include: { athlete: true, block: true }, orderBy: [{ performedOn: "desc" }, { createdAt: "asc" }],
  });
  return { block, results: results.map(toRow) };
}

export async function listAthleteResults(db: Db, coachId: string, programId: string, athleteId: string) {
  await getOwnedProgram(db, coachId, programId);
  const enrollment = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId, athleteId } }, include: { athlete: true },
  });
  if (!enrollment) throw new TrainingError("not_found");
  const results = await db.result.findMany({
    where: { athleteId, block: { programId } }, include: { athlete: true, block: true }, orderBy: { performedOn: "desc" },
  });
  return { athlete: enrollment.athlete, results: results.map(toRow) };
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm test tests/training/services/results.test.ts tests/training/services/prs.test.ts`
Expected: PASS. If the ranked-order assertion in "ranks the leaderboard" fails, check the expectation first: Ana 10:40 rx (1), Cai capped rx (2), Ben 10:00 scaled (3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/training/services/results.ts src/lib/training/services/prs.ts tests/training/services/results.test.ts tests/training/services/prs.test.ts
git commit -m "feat: results, leaderboard, fist bumps, coach result lists and PR services

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Logging a result (athlete)

**Files:**
- Create: `src/app/(athlete)/result-actions.ts`
- Create: `src/app/(athlete)/pr-actions.ts`
- Create: `src/app/(athlete)/blocks/[id]/log/page.tsx`, `src/app/(athlete)/blocks/[id]/log/LogForm.tsx`
- Modify: `src/i18n/messages/es.json`, `en.json` (namespace `log`)

**Interfaces:**
- Consumes: `getVisibleBlock`, `saveResult`, `deleteResult`, `getMyResult` (Task 16), `addPr`, `deletePr`, `oneRmMap` (Task 16), `scoreTarget`, `ScoreTarget` (Task 14), `logDraftFor`, `buildScore`, `LogDraft` (Task 14), `ResultInput`, `PrInput`, `parse` (Task 14), `requireAthlete`, `requireAthletePage`, `runAction`, `orNotFound` (Task 5).
- Produces:
  - `saveResultAction(raw: ResultInputValue): Promise<ActionResult<{ singlePrompt: SinglePrompt | null }>>`, `deleteResultAction(blockId): Promise<ActionResult>` (`result-actions.ts`)
  - `addPrAction(raw: PrInputValue): Promise<ActionResult>`, `deletePrAction(prId): Promise<ActionResult>` (`pr-actions.ts`)

- [ ] **Step 1: Add the messages**

`es.json`:

```json
  "log": {
    "title": "Registrar resultado",
    "editTitle": "Editar resultado",
    "rx": "Rx",
    "scaled": "Scaled",
    "minutes": "Minutos",
    "seconds": "Segundos",
    "capped": "No terminé dentro del time cap",
    "repsDone": "Reps completadas",
    "rounds": "Rondas",
    "reps": "Reps",
    "kg": "kg",
    "calories": "Calorías",
    "meters": "Metros",
    "set": "Serie {n}",
    "notes": "Notas",
    "save": "Guardar resultado",
    "delete": "Borrar resultado",
    "deleteConfirm": "¿Borrar tu resultado?",
    "notLoggable": "Este bloque todavía no se puede registrar.",
    "singlePrompt": "¿Actualizar tu 1RM de {movement} de {from} kg a {to} kg?",
    "singlePromptFirst": "¿Guardar {to} kg como tu 1RM de {movement}?",
    "yes": "Sí, actualizar",
    "no": "No"
  }
```

`en.json`:

```json
  "log": {
    "title": "Log result",
    "editTitle": "Edit result",
    "rx": "Rx",
    "scaled": "Scaled",
    "minutes": "Minutes",
    "seconds": "Seconds",
    "capped": "I did not finish within the time cap",
    "repsDone": "Reps completed",
    "rounds": "Rounds",
    "reps": "Reps",
    "kg": "kg",
    "calories": "Calories",
    "meters": "Meters",
    "set": "Set {n}",
    "notes": "Notes",
    "save": "Save result",
    "delete": "Delete result",
    "deleteConfirm": "Delete your result?",
    "notLoggable": "This block cannot be logged yet.",
    "singlePrompt": "Update your {movement} 1RM from {from} kg to {to} kg?",
    "singlePromptFirst": "Save {to} kg as your {movement} 1RM?",
    "yes": "Yes, update",
    "no": "No"
  }
```

- [ ] **Step 2: Actions**

`src/app/(athlete)/result-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { ResultInput, parse } from "@/lib/training/schemas";
import { deleteResult, saveResult, toggleFistBump, type SinglePrompt } from "@/lib/training/services/results";

const Id = z.string().min(1).max(64);

export async function saveResultAction(raw: unknown): Promise<ActionResult<{ singlePrompt: SinglePrompt | null }>> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    const { singlePrompt } = await saveResult(prisma, athlete, parse(ResultInput, raw));
    revalidatePath("/", "layout");
    return { singlePrompt };
  });
}

export async function deleteResultAction(blockId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    await deleteResult(prisma, athlete.id, parse(Id, blockId));
    revalidatePath("/", "layout");
  });
}

export async function toggleFistBumpAction(resultId: unknown): Promise<ActionResult<{ bumped: boolean; count: number }>> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    return toggleFistBump(prisma, athlete, parse(Id, resultId));
  });
}
```

`src/app/(athlete)/pr-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { PrInput, parse } from "@/lib/training/schemas";
import { addPr, deletePr } from "@/lib/training/services/prs";

export async function addPrAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    await addPr(prisma, athlete.id, parse(PrInput, raw));
    revalidatePath("/", "layout");
  });
}

export async function deletePrAction(prId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    await deletePr(prisma, athlete.id, parse(z.string().min(1).max(64), prId));
    revalidatePath("/", "layout");
  });
}
```

- [ ] **Step 3: Log form**

`src/app/(athlete)/blocks/[id]/log/LogForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { buildScore, type LogDraft } from "@/lib/training/log-draft";
import type { ScoreTarget } from "@/lib/training/scoring";
import { addPrAction } from "../../../pr-actions";
import { deleteResultAction, saveResultAction } from "../../../result-actions";

type Props = {
  blockId: string;
  target: ScoreTarget;
  date: string;
  backHref: string;
  initial: LogDraft;
  initialDivision: "rx" | "scaled";
  initialNotes: string;
  hasResult: boolean;
};

type Prompt = { movement: string; from: number | null; to: number };

const box = "rounded border px-3 py-2";

export function LogForm({ blockId, target, date, backHref, initial, initialDivision, initialNotes, hasResult }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [division, setDivision] = useState(initialDivision);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const set = (patch: Partial<LogDraft>) => setD((x) => ({ ...x, ...patch }));
  const done = () => { router.push(backHref); router.refresh(); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const r = await saveResultAction({ blockId, division, score: buildScore(target, d), notes });
    setPending(false);
    if (!r.ok) return setError(r.code);
    if (r.value.singlePrompt) setPrompt(r.value.singlePrompt);
    else done();
  }

  async function acceptPrompt() {
    if (!prompt) return;
    const r = await addPrAction({ movement: prompt.movement, kg: prompt.to, achievedOn: date });
    if (r.ok) done();
    else setError(r.code);
  }

  async function remove() {
    if (!window.confirm(t("log.deleteConfirm"))) return;
    const r = await deleteResultAction(blockId);
    if (r.ok) done();
    else setError(r.code);
  }

  if (prompt) {
    return (
      <div className="flex flex-col gap-4 rounded border p-4">
        <p>{prompt.from === null
          ? t("log.singlePromptFirst", { movement: prompt.movement, to: prompt.to })
          : t("log.singlePrompt", { movement: prompt.movement, from: prompt.from, to: prompt.to })}</p>
        <div className="flex gap-3">
          <button onClick={acceptPrompt} className="rounded bg-black px-4 py-2 text-white">{t("log.yes")}</button>
          <button onClick={done} className="underline">{t("log.no")}</button>
        </div>
        {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
      </div>
    );
  }

  const time = (
    <div className="grid grid-cols-2 gap-2">
      <input inputMode="numeric" placeholder={t("log.minutes")} className={box} value={d.minutes} onChange={(e) => set({ minutes: e.target.value })} />
      <input inputMode="numeric" placeholder={t("log.seconds")} className={box} value={d.seconds} onChange={(e) => set({ seconds: e.target.value })} />
    </div>
  );
  const single = (placeholder: string, decimal = false) => (
    <input inputMode={decimal ? "decimal" : "numeric"} placeholder={placeholder} className={box} value={d.value} onChange={(e) => set({ value: e.target.value })} />
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {target.kind === "barbell" ? (
        d.sets.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-16 text-sm text-neutral-500">{t("log.set", { n: i + 1 })}</span>
            <input inputMode="decimal" placeholder={t("log.kg")} className={`${box} w-24`} value={s.kg}
              onChange={(e) => set({ sets: d.sets.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)) })} />
            <span>×</span>
            <input inputMode="numeric" placeholder={t("log.reps")} className={`${box} w-20`} value={s.reps}
              onChange={(e) => set({ sets: d.sets.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)) })} />
          </div>
        ))
      ) : (
        <>
          {target.scoring === "for_time" && (
            <>
              {d.capped
                ? <input inputMode="numeric" placeholder={t("log.repsDone")} className={box} value={d.reps} onChange={(e) => set({ reps: e.target.value })} />
                : time}
              {target.timeCapSeconds !== null && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.capped} onChange={(e) => set({ capped: e.target.checked })} />
                  {t("log.capped")}
                </label>
              )}
            </>
          )}
          {target.scoring === "max_time" && time}
          {target.scoring === "amrap" && (
            <div className="grid grid-cols-2 gap-2">
              <input inputMode="numeric" placeholder={t("log.rounds")} className={box} value={d.rounds} onChange={(e) => set({ rounds: e.target.value })} />
              <input inputMode="numeric" placeholder={t("log.reps")} className={box} value={d.reps} onChange={(e) => set({ reps: e.target.value })} />
            </div>
          )}
          {target.scoring === "reps" && single(t("log.reps"))}
          {target.scoring === "load" && single(t("log.kg"), true)}
          {target.scoring === "calories" && single(t("log.calories"))}
          {target.scoring === "distance" && single(t("log.meters"), true)}
          <div className="grid grid-cols-2 rounded bg-neutral-100 p-1">
            {(["rx", "scaled"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setDivision(v)}
                className={`rounded py-2 ${division === v ? "bg-white font-semibold shadow" : ""}`}>{t(`log.${v}`)}</button>
            ))}
          </div>
        </>
      )}
      <textarea rows={4} maxLength={1000} placeholder={t("log.notes")} className={box} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
      <button disabled={pending} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">{t("log.save")}</button>
      {hasResult && <button type="button" onClick={remove} className="text-sm text-red-700 underline">{t("log.delete")}</button>}
    </form>
  );
}
```

- [ ] **Step 4: Log page**

`src/app/(athlete)/blocks/[id]/log/page.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { logDraftFor } from "@/lib/training/log-draft";
import type { BarbellSet } from "@/lib/training/schemas";
import { scoreTarget } from "@/lib/training/scoring";
import { oneRmMap } from "@/lib/training/services/prs";
import { getMyResult, getVisibleBlock } from "@/lib/training/services/results";
import { LogForm } from "./LogForm";

export default async function LogPage({ params }: { params: Promise<{ id: string }> }) {
  const athlete = await requireAthletePage();
  const { id } = await params;
  const { block, date, loggable } = await orNotFound(getVisibleBlock(prisma, athlete, id));
  const t = await getTranslations("log");
  const backHref = `/?program=${block.programId}&date=${date}`;
  if (!loggable) {
    return (
      <section className="flex flex-col gap-4">
        <p>{t("notLoggable")}</p>
        <Link href={backHref} className="underline">←</Link>
      </section>
    );
  }
  const [mine, oneRms] = await Promise.all([
    getMyResult(prisma, athlete.id, block.id),
    block.movement ? oneRmMap(prisma, athlete.id, [block.movement]) : Promise.resolve(new Map<string, number>()),
  ]);
  const target = scoreTarget(block);
  const prescribed = (block.sets as BarbellSet[] | null) ?? [];
  return (
    <section className="flex flex-col gap-4">
      <Link href={backHref} className="text-sm underline">←</Link>
      <h1 className="text-xl font-semibold">{mine ? t("editTitle") : t("title")}</h1>
      <p className="text-neutral-600">{block.title ?? block.movement}</p>
      <LogForm
        blockId={block.id}
        target={target}
        date={date}
        backHref={backHref}
        initial={logDraftFor(target, mine?.score ?? null, prescribed, block.movement ? oneRms.get(block.movement) ?? null : null)}
        initialDivision={mine?.division === "scaled" ? "scaled" : "rx"}
        initialNotes={mine?.notes ?? ""}
        hasResult={mine !== null}
      />
    </section>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add "src/app/(athlete)" src/i18n/messages
git commit -m "feat: result logging for every scoring type, per-set barbell loads and the 1RM prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Leaderboard page and results in the day view

**Files:**
- Create: `src/app/(athlete)/blocks/[id]/leaderboard/page.tsx`, `.../leaderboard/FistBumpButton.tsx`
- Modify: `src/app/(athlete)/page.tsx` (log/edit link, my score, score count, kg from 1RMs)
- Modify: `src/i18n/messages/es.json`, `en.json` (namespace `leaderboard`; keys in `today`)

**Interfaces:**
- Consumes: `getLeaderboard`, `getDayResults` (Task 16), `oneRmMap` (Task 16), `toggleFistBumpAction` (Task 17), `hasLeaderboard` (Task 12), `formatScore`, `scoreTarget` (Task 14), `BlockCard` (Task 10).

- [ ] **Step 1: Add the messages**

Add to `today` in `es.json`: `"logResult": "Registrar resultado"`, `"editResult": "Editar"`, `"myResult": "Tu resultado: {score}"`, `"scores": "{count, plural, =0 {Sin scores} one {# score} other {# scores}}"`, `"addOneRm": "Añade tu 1RM de {movement} para ver los kg"`. In `en.json`: `"logResult": "Log result"`, `"editResult": "Edit"`, `"myResult": "Your result: {score}"`, `"scores": "{count, plural, =0 {No scores} one {# score} other {# scores}}"`, `"addOneRm": "Add your {movement} 1RM to see the kg"`.

New namespace, `es.json`:

```json
  "leaderboard": {
    "title": "Leaderboard",
    "empty": "Todavía nadie ha registrado este bloque.",
    "you": "Tú",
    "fistBump": "Fist bump"
  }
```

`en.json`:

```json
  "leaderboard": {
    "title": "Leaderboard",
    "empty": "Nobody has logged this block yet.",
    "you": "You",
    "fistBump": "Fist bump"
  }
```

- [ ] **Step 2: Fist bump button**

`src/app/(athlete)/blocks/[id]/leaderboard/FistBumpButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toggleFistBumpAction } from "../../../result-actions";

export function FistBumpButton({ resultId, initialCount, initialBumped, disabled }: {
  resultId: string; initialCount: number; initialBumped: boolean; disabled: boolean;
}) {
  const t = useTranslations("leaderboard");
  const [count, setCount] = useState(initialCount);
  const [bumped, setBumped] = useState(initialBumped);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const r = await toggleFistBumpAction(resultId);
    setPending(false);
    if (r.ok) {
      setCount(r.value.count);
      setBumped(r.value.bumped);
    }
  }

  return (
    <button onClick={toggle} disabled={disabled || pending} aria-pressed={bumped} aria-label={t("fistBump")}
      className={`flex items-center gap-1 rounded-full px-2 py-1 text-sm ${bumped ? "bg-amber-100" : ""} disabled:opacity-50`}>
      <span aria-hidden>👊</span>{count > 0 && count}
    </button>
  );
}
```

- [ ] **Step 3: Leaderboard page**

`src/app/(athlete)/blocks/[id]/leaderboard/page.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { getLeaderboard } from "@/lib/training/services/results";
import { FistBumpButton } from "./FistBumpButton";

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const athlete = await requireAthletePage();
  const { id } = await params;
  const { block, date, entries } = await orNotFound(getLeaderboard(prisma, { athlete }, id));
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <section className="flex flex-col gap-4">
      <Link href={`/?program=${block.programId}&date=${date}`} className="text-sm underline">←</Link>
      <div>
        <h1 className="text-2xl font-semibold">{t("leaderboard.title")}</h1>
        <p className="text-neutral-600">{block.title} · {formatDay(date, locale, { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      {entries.length === 0 && <p className="text-neutral-600">{t("leaderboard.empty")}</p>}
      <ol className="flex flex-col">
        {entries.map((e) => (
          <li key={e.resultId} className={`flex items-center gap-3 border-b py-3 ${e.own ? "bg-amber-50" : ""}`}>
            <span className="w-6 text-right text-neutral-500">{e.rank}</span>
            {e.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={e.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200">{e.displayName.slice(0, 1)}</span>}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{e.own ? t("leaderboard.you") : e.displayName}</span>
              <span className="text-sm">
                {e.formatted}{" "}
                <span className={`rounded px-1 text-xs ${e.division === "rx" ? "bg-red-100 text-red-800" : "bg-neutral-200"}`}>{t(`log.${e.division as "rx" | "scaled"}`)}</span>
              </span>
              {e.notes && <span className="truncate text-xs text-neutral-500">{e.notes}</span>}
            </div>
            <FistBumpButton resultId={e.resultId} initialCount={e.bumps} initialBumped={e.bumpedByViewer} disabled={e.own} />
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Results in the day view**

In `src/app/(athlete)/page.tsx`:

Add imports:

```tsx
import { hasLeaderboard } from "@/lib/training/access";
import { formatScore, scoreTarget } from "@/lib/training/scoring";
import { oneRmMap } from "@/lib/training/services/prs";
import { getDayResults } from "@/lib/training/services/results";
```

After `const [day, withBlocks] = …`, load the results and the 1RMs:

```tsx
  const movements = day.blocks.flatMap((b) => (b.movement ? [b.movement] : []));
  const [dayResults, oneRms] = await Promise.all([
    getDayResults(prisma, athlete.id, programId, day.blocks.map((b) => b.id)),
    oneRmMap(prisma, athlete.id, movements),
  ]);
```

Replace the `day.blocks.map(…)` rendering with:

```tsx
      {day.blocks.map((b) => {
        const mine = dayResults.mine.get(b.id);
        const scored = b.kind === "barbell" || (b.scoring !== null && b.scoring !== "none");
        const board = hasLeaderboard(b, day.program);
        return (
          <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} oneRm={b.movement ? oneRms.get(b.movement) ?? null : null}>
            {b.kind === "barbell" && b.movement && !oneRms.has(b.movement) && (b.sets as BarbellSet[] | null)?.some((s) => s.percent !== null) && (
              <Link href={`/prs/${encodeURIComponent(b.movement)}`} className="text-xs underline">{t("addOneRm", { movement: b.movement })}</Link>
            )}
            {mine && <p className="text-sm font-medium">{t("myResult", { score: formatScore(scoreTarget(b), mine.score) })}</p>}
            {(scored && day.loggable) || board ? (
              <div className="flex gap-2">
                {scored && day.loggable && (
                  <Link href={`/blocks/${b.id}/log`} className="flex-1 rounded bg-red-50 py-2 text-center text-sm font-medium text-red-800">
                    {mine ? t("editResult") : t("logResult")}
                  </Link>
                )}
                {board && (
                  <Link href={`/blocks/${b.id}/leaderboard`} className="flex-1 rounded bg-red-50 py-2 text-center text-sm font-medium text-red-800">
                    {t("scores", { count: dayResults.counts.get(b.id) ?? 0 })}
                  </Link>
                )}
              </div>
            ) : null}
          </BlockCard>
        );
      })}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add "src/app/(athlete)" src/i18n/messages
git commit -m "feat: leaderboard with fist bumps; log, edit and score count in the day view; % shown in kg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: PRs pages (athlete)

**Files:**
- Create: `src/app/(athlete)/prs/page.tsx`, `src/app/(athlete)/prs/PrList.tsx`
- Create: `src/app/(athlete)/prs/[movement]/page.tsx`, `src/app/(athlete)/prs/[movement]/PrHistory.tsx`
- Modify: `src/app/(athlete)/AthleteNav.tsx` (add PRs)
- Modify: `src/i18n/messages/es.json`, `en.json` (namespace `prs`; `nav.prs`)

**Interfaces:**
- Consumes: `listPrs`, `listMovementPrs` (Task 16), `addPrAction`, `deletePrAction` (Task 17), `liftCatalog`, `isLiftMovement` (Task 4), `currentOneRm` (Task 15), `todayIn`, `fromDbDate` (Task 3), `formatDay` (Task 6), `getDomainData` (existing).

- [ ] **Step 1: Add the messages**

`nav.prs`: `"PRs"` in both files. New namespace, `es.json`:

```json
  "prs": {
    "title": "PRs",
    "search": "Buscar un ejercicio",
    "noResults": "Ningún ejercicio coincide.",
    "current": "1RM actual",
    "history": "Historial",
    "empty": "Todavía no has registrado ningún 1RM de este ejercicio.",
    "add": "Añadir 1RM",
    "kg": "kg",
    "date": "Fecha",
    "deleteConfirm": "¿Borrar esta entrada?"
  }
```

`en.json`:

```json
  "prs": {
    "title": "PRs",
    "search": "Search an exercise",
    "noResults": "No exercise matches.",
    "current": "Current 1RM",
    "history": "History",
    "empty": "You have not recorded a 1RM for this exercise yet.",
    "add": "Add 1RM",
    "kg": "kg",
    "date": "Date",
    "deleteConfirm": "Delete this entry?"
  }
```

In `AthleteNav.tsx`, set `ITEMS` to:

```ts
const ITEMS = [
  { href: "/", key: "today" },
  { href: "/prs", key: "prs" },
  { href: "/me", key: "me" },
] as const;
```

- [ ] **Step 2: PR list**

`src/app/(athlete)/prs/PrList.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type Group = { pattern: string; label: string; movements: { name: string; kg: number | null }[] };

export function PrList({ groups }: { groups: Group[] }) {
  const t = useTranslations("prs");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = groups
    .map((g) => ({ ...g, movements: g.movements.filter((m) => m.name.toLowerCase().includes(q)) }))
    .filter((g) => g.movements.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <input type="search" placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} className="rounded border px-3 py-2" />
      {visible.length === 0 && <p className="text-neutral-600">{t("noResults")}</p>}
      {visible.map((g) => (
        <section key={g.pattern}>
          <h2 className="mb-1 font-semibold">{g.label}</h2>
          <ul>
            {g.movements.map((m) => (
              <li key={m.name}>
                <Link href={`/prs/${encodeURIComponent(m.name)}`} className="flex justify-between border-b py-3">
                  <span className="text-neutral-700">{m.name}</span>
                  <span className="font-medium">{m.kg !== null ? `${m.kg} kg` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

`src/app/(athlete)/prs/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { liftCatalog } from "@/lib/training/barbell";
import { currentOneRm } from "@/lib/training/prs";
import { listPrs } from "@/lib/training/services/prs";
import { PrList } from "./PrList";

export default async function PrsPage() {
  const athlete = await requireAthletePage("/prs");
  const t = await getTranslations();
  const [records, domain] = await Promise.all([listPrs(prisma, athlete.id), getDomainData()]);
  const byMovement = new Map<string, { kg: number }[]>();
  for (const r of records) byMovement.set(r.movement, [...(byMovement.get(r.movement) ?? []), r]);
  const groups = liftCatalog(domain.movements).map((g) => ({
    pattern: g.pattern,
    label: t(`patterns.${g.pattern}`),
    movements: g.movements.map((name) => ({ name, kg: currentOneRm(byMovement.get(name) ?? []) })),
  }));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("prs.title")}</h1>
      <PrList groups={groups} />
    </section>
  );
}
```

- [ ] **Step 3: Movement history**

`src/app/(athlete)/prs/[movement]/PrHistory.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { addPrAction, deletePrAction } from "../../pr-actions";

type Entry = { id: string; kg: number; label: string };

export function PrHistory({ movement, today, entries }: { movement: string; today: string; entries: Entry[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await addPrAction({ movement, kg: Number(kg), achievedOn: date });
    if (r.ok) {
      setKg("");
      setError(null);
      router.refresh();
    } else {
      setError(r.code);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("prs.deleteConfirm"))) return;
    const r = await deletePrAction(id);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">{t("prs.kg")}
          <input required inputMode="decimal" className="w-24 rounded border px-3 py-2" value={kg} onChange={(e) => setKg(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t("prs.date")}
          <input type="date" max={today} className="rounded border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white">{t("prs.add")}</button>
      </form>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
      <section>
        <h2 className="mb-1 font-semibold">{t("prs.history")}</h2>
        {entries.length === 0 ? <p className="text-neutral-600">{t("prs.empty")}</p> : (
          <ul>
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b py-2">
                <span>{e.label}</span>
                <span className="flex items-center gap-3">
                  <b>{e.kg} kg</b>
                  <button onClick={() => remove(e.id)} className="text-sm text-red-700 underline">{t("common.delete")}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

`src/app/(athlete)/prs/[movement]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDay } from "@/lib/format";
import { isLiftMovement } from "@/lib/training/barbell";
import { fromDbDate, todayIn } from "@/lib/training/dates";
import { currentOneRm } from "@/lib/training/prs";
import { listMovementPrs } from "@/lib/training/services/prs";
import { PrHistory } from "./PrHistory";

export default async function MovementPrPage({ params }: { params: Promise<{ movement: string }> }) {
  const athlete = await requireAthletePage("/prs");
  const movement = decodeURIComponent((await params).movement);
  const { movements } = await getDomainData();
  if (!isLiftMovement(movement, movements)) notFound();
  const t = await getTranslations("prs");
  const locale = await getLocale();
  const records = await listMovementPrs(prisma, athlete.id, movement);
  const current = currentOneRm(records);
  return (
    <section className="flex flex-col gap-4">
      <Link href="/prs" className="text-sm underline">←</Link>
      <h1 className="text-2xl font-semibold">{movement}</h1>
      <p>{t("current")}: <b>{current !== null ? `${current} kg` : "—"}</b></p>
      <PrHistory movement={movement} today={todayIn(athlete.timezone)}
        entries={records.map((r) => ({ id: r.id, kg: r.kg, label: formatDay(fromDbDate(r.achievedOn), locale, { day: "numeric", month: "short", year: "numeric" }) }))} />
    </section>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add "src/app/(athlete)" src/i18n/messages
git commit -m "feat: PRs tab (grouped lifts with current 1RM, search, per-movement history)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Coach result views

**Files:**
- Create: `src/app/coach/blocks/[id]/results/page.tsx`
- Create: `src/app/coach/programs/[id]/athletes/[aid]/page.tsx`
- Modify: `src/app/coach/programs/[id]/planner/PlannerBlock.tsx` (link to the block's results)
- Modify: `src/i18n/messages/es.json`, `en.json` (namespace `coachResults`)

**Interfaces:**
- Consumes: `getLeaderboard`, `listBlockResults`, `listAthleteResults` (Task 16), `hasLeaderboard` (Task 12), `requireCoachPage`, `orNotFound` (Task 5), `formatDay` (Task 6).

- [ ] **Step 1: Add the messages**

`es.json`:

```json
  "coachResults": {
    "title": "Resultados",
    "empty": "Todavía no hay resultados.",
    "athlete": "Atleta",
    "block": "Bloque",
    "date": "Fecha",
    "score": "Resultado",
    "division": "Categoría",
    "notes": "Notas",
    "rank": "#",
    "bumps": "Fist bumps",
    "view": "Ver resultados"
  }
```

`en.json`:

```json
  "coachResults": {
    "title": "Results",
    "empty": "No results yet.",
    "athlete": "Athlete",
    "block": "Block",
    "date": "Date",
    "score": "Result",
    "division": "Division",
    "notes": "Notes",
    "rank": "#",
    "bumps": "Fist bumps",
    "view": "View results"
  }
```

- [ ] **Step 2: Block results page**

`src/app/coach/blocks/[id]/results/page.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { hasLeaderboard } from "@/lib/training/access";
import { getLeaderboard, listBlockResults } from "@/lib/training/services/results";

export default async function BlockResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const { block, results } = await orNotFound(listBlockResults(prisma, coach.id, id));
  const day = (iso: string) => formatDay(iso, locale, { day: "numeric", month: "short" });
  const back = <Link href={`/coach/programs/${block.programId}?week=${Math.floor(block.dayIndex / 7)}`} className="text-sm underline">{t("programs.planner")}</Link>;

  if (hasLeaderboard(block, block.program)) {
    const { entries } = await getLeaderboard(prisma, { coachId: coach.id }, id);
    return (
      <section className="flex flex-col gap-4">
        {back}
        <h1 className="text-2xl font-semibold">{block.title} · {t("leaderboard.title")}</h1>
        {entries.length === 0 ? <p className="text-neutral-600">{t("coachResults.empty")}</p> : (
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b">
              <th className="py-2">{t("coachResults.rank")}</th><th>{t("coachResults.athlete")}</th><th>{t("coachResults.score")}</th>
              <th>{t("coachResults.division")}</th><th>{t("coachResults.bumps")}</th><th>{t("coachResults.notes")}</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.resultId} className="border-b">
                  <td className="py-2">{e.rank}</td><td>{e.displayName}</td><td>{e.formatted}</td>
                  <td>{t(`log.${e.division as "rx" | "scaled"}`)}</td><td>{e.bumps}</td><td className="text-neutral-600">{e.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {back}
      <h1 className="text-2xl font-semibold">{block.title ?? block.movement} · {t("coachResults.title")}</h1>
      {results.length === 0 ? <p className="text-neutral-600">{t("coachResults.empty")}</p> : (
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">
            <th className="py-2">{t("coachResults.date")}</th><th>{t("coachResults.athlete")}</th>
            <th>{t("coachResults.score")}</th><th>{t("coachResults.notes")}</th>
          </tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2">{day(r.performedOn)}</td><td>{r.displayName}</td><td>{r.formatted}</td>
                <td className="text-neutral-600">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Athlete results page**

`src/app/coach/programs/[id]/athletes/[aid]/page.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { listAthleteResults } from "@/lib/training/services/results";

export default async function AthleteResultsPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const coach = await requireCoachPage();
  const { id, aid } = await params;
  const { athlete, results } = await orNotFound(listAthleteResults(prisma, coach.id, id, aid));
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <section className="flex flex-col gap-4">
      <Link href={`/coach/programs/${id}/athletes`} className="text-sm underline">{t("roster.title")}</Link>
      <h1 className="text-2xl font-semibold">{athlete.displayName} · {t("coachResults.title")}</h1>
      {results.length === 0 ? <p className="text-neutral-600">{t("coachResults.empty")}</p> : (
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">
            <th className="py-2">{t("coachResults.date")}</th><th>{t("coachResults.block")}</th><th>{t("coachResults.score")}</th>
            <th>{t("coachResults.division")}</th><th>{t("coachResults.notes")}</th>
          </tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2">{formatDay(r.performedOn, locale, { day: "numeric", month: "short" })}</td>
                <td><Link href={`/coach/blocks/${r.blockId}/results`} className="underline">{r.blockTitle}</Link></td>
                <td>{r.formatted}</td><td>{t(`log.${r.division as "rx" | "scaled"}`)}</td>
                <td className="text-neutral-600">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Link from the planner**

In `PlannerBlock.tsx`, replace the result-count paragraph with a link (add `import Link from "next/link";`):

```tsx
        {block.resultCount > 0 && (
          <Link href={`/coach/blocks/${block.id}/results`} className="text-xs underline">
            {t("planner.results", { count: block.resultCount })}
          </Link>
        )}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean and green.

```bash
git add src/app/coach src/i18n/messages
git commit -m "feat: coach result views per block (leaderboard or list) and per athlete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Phase 2 verification and PR

**Files:** none new (fixes only, if the checks find issues).

- [ ] **Step 1: Full local checks**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: all clean and green.

- [ ] **Step 2: Drive the app in the browser**

No new migration in phase 2. With the `dev` preview running and the user signed in (as in Task 13), using the continuous program from phase 1 with a block dated today or earlier (publish the current week if needed):

1. Log a for-time result as Rx; the day view shows "Your result: 9:32" and "1 score"; edit it to a capped result and check the leaderboard shows `CAP · 87` below finished times.
2. Have a second account (the user signs in with another Google account in a separate browser profile and joins with the invitation link) log a Scaled result; the leaderboard orders Rx first; fist bump the other result, check the counter, and that your own row cannot be bumped.
3. Add a Back Squat 1RM of 125 kg in PRs; the day view shows "3 × 5 @ 80 % (100 kg)"; the log form prefills 100 kg; log a single at 130 kg and accept the prompt; PRs shows 130 kg with history.
4. As coach, open the block's results from the planner and the athlete's results from the roster.
5. Try to change the scoring of the block with results: the editor disables it and the server answers `scoring_locked` if forced.
6. Switch to English in `/me` and repeat a glance over the log form and leaderboard.

Check `read_console_messages` and `preview_logs` for errors after each flow.

- [ ] **Step 3: Push and open PR 2**

```bash
git push -u origin HEAD
```

Open the PR against `main` with `gh pr create`, titled "Coaching phase 2: results, leaderboards, fist bumps and PRs", summarizing the tasks and the verification. End the description with the attribution line from the session instructions.
