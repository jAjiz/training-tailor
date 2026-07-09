# Training Tailor v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the athlete self-serve v1 of Training Tailor — an athlete sets up a profile, supplies a functional fitness workout (paste or manual entry), states today's constraint, gets an individualized, stimulus-preserving modification with rationale, and can refine it with feedback.

**Architecture:** Next.js (App Router, TypeScript) full-stack app. A server-side **engine pipeline** (parse → classify stimulus → tailor → refine) depends only on a provider-agnostic **AI service abstraction** (`LlmProvider`); v1 ships a **Gemini** adapter. Domain knowledge (movement library, injury→contraindication map, stimulus taxonomy) is **versioned JSON in the repo**, schema-validated and read through a repository module. **Postgres** via **Prisma** holds user data only (auth, profiles, saved tailored workouts). Auth is Auth.js (NextAuth v5) email magic-link.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Prisma 7 (driver adapter `@prisma/adapter-pg`, generated client at `src/generated/prisma`) + PostgreSQL · Zod 4 · Vitest · `@google/genai` (Gemini) · Auth.js v5 · Tailwind CSS 4.

---

## Reference spec

`docs/specs/training-tailor-engine-v1-design.md`

## Status

**Phases 0–1 are already implemented and committed** (`d5ea79e` scaffold, `eb8937f` Prisma schema + db client, fix-ups `822cfe2`, `2513c5d`, `b1350b3`, and `2265875`, which reworked the schema to hold user data only — domain data is JSON-backed, not DB-backed). Their tasks below are marked done and their snippets reflect the committed code. Execution resumes at Phase 2.

## Conventions for the implementing engineer

- **Package manager:** `pnpm`. Platform is Windows; commands are cross-platform unless noted.
- **Prisma 7:** the client is generated to `src/generated/prisma` and instantiated with the `@prisma/adapter-pg` driver adapter (see `src/lib/db.ts`). Import Prisma types from `@/generated/prisma`, **not** `@prisma/client`. The datasource URL lives in `prisma.config.ts` (reads `DATABASE_URL`).
- **Testing:** Vitest. Engine/business logic is unit-tested against a **fake `LlmProvider`** so tests are deterministic and need no network/API key. The domain repository reads in-repo JSON, so its tests need no DB either. The only integration test is the real Gemini adapter, which **skips** when `GEMINI_API_KEY` is unset — `pnpm test` is fully deterministic without any infrastructure.
- **TDD loop for every code task:** write failing test → run it, see it fail → minimal implementation → run, see it pass → commit.
- **Commit style:** Conventional Commits (`feat:`, `test:`, `chore:`, `refactor:`).
- **No secrets in git.** All keys come from `.env` (gitignored). `.env.example` documents required vars.
- **Error responses:** never return raw exception text (`String(e)`) to the client — log server-side, return a generic error code.

## File structure (what each unit owns)

```
training-tailor/
├─ src/
│  ├─ lib/
│  │  ├─ ai/
│  │  │  ├─ provider.ts          # LlmProvider interface + GenerateStructuredArgs
│  │  │  ├─ gemini-provider.ts   # Gemini adapter (only file that imports @google/genai)
│  │  │  ├─ fake-provider.ts     # Test double: scripted/echo responses
│  │  │  └─ index.ts             # getProvider() factory (reads env, returns provider)
│  │  ├─ engine/
│  │  │  ├─ types.ts             # StructuredWorkout, StimulusTag, TailoringResult, etc. + Zod schemas
│  │  │  ├─ parse-workout.ts     # raw text -> StructuredWorkout (with graceful fallback)
│  │  │  ├─ classify-stimulus.ts # StructuredWorkout -> StimulusClassification
│  │  │  ├─ tailor.ts            # (workout + profile + request + domain [+ previous attempt]) -> TailoringResult
│  │  │  ├─ render-text.ts       # StructuredWorkout -> plain-text rendering (manual entry rawText)
│  │  │  └─ pipeline.ts          # orchestrates parse/classify/tailor
│  │  ├─ domain/
│  │  │  ├─ types.ts             # Movement, InjuryContraindication, StimulusDef domain types
│  │  │  └─ repository.ts        # loads + validates versioned JSON from data/ (no DB)
│  │  ├─ profile.ts              # profile normalization / body parsing helpers
│  │  ├─ tailor-service.ts       # composes domain data + pipeline (runTailorForAthlete, runRefineForAthlete)
│  │  └─ db.ts                   # Prisma client singleton (driver adapter)
│  ├─ app/
│  │  ├─ layout.tsx, globals.css
│  │  ├─ page.tsx                # landing / dashboard
│  │  ├─ signin/page.tsx         # magic-link sign-in
│  │  ├─ profile/page.tsx + ProfileForm.tsx
│  │  ├─ tailor/page.tsx + TailorClient.tsx + ManualEntryForm.tsx
│  │  ├─ history/page.tsx        # saved tailored workouts
│  │  └─ api/
│  │     ├─ tailor/route.ts        # POST: run pipeline (no persistence)
│  │     ├─ tailor/save/route.ts   # POST: persist a reviewed result (no re-run)
│  │     ├─ tailor/refine/route.ts # POST: re-tailor with athlete feedback
│  │     └─ profile/route.ts       # GET/PUT athlete profile
│  ├─ components/WorkoutView.tsx  # renders a StructuredWorkout
│  ├─ types/next-auth.d.ts        # session.user.id type augmentation
│  ├─ generated/prisma/           # Prisma 7 generated client (gitignored/generated)
│  └─ auth.ts                     # Auth.js config
├─ prisma/
│  └─ schema.prisma               # user data only: auth models, AthleteProfile, TailoredWorkout
├─ prisma.config.ts               # Prisma 7 config (schema path, DATABASE_URL)
├─ data/                          # versioned domain JSON (the domain source of truth — no DB tables)
│  ├─ movements.json
│  ├─ injury-contraindications.json
│  └─ stimulus-taxonomy.json
├─ tests/                         # mirrors src/ where useful
├─ .env.example
├─ vitest.config.ts
└─ package.json
```

**Boundary rule:** only `src/lib/ai/gemini-provider.ts` imports the Gemini SDK. The engine imports `LlmProvider` from `provider.ts` and never a concrete provider. This is what makes adding Claude/OpenAI later a one-file change.

---

## Phase 0 — Scaffolding & tooling

### Task 0.1: Initialize repo, Next.js, and Vitest — ✅ DONE

> **Status: completed** in commits `d5ea79e`, `822cfe2`, `2513c5d`, `b1350b3`. Steps below record what was actually done (some details differ from the original draft: Next.js 16 was installed, `vite-tsconfig-paths` was replaced by Vitest's native `resolve.tsconfigPaths`, and the default model is `gemini-flash-latest`).

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [x] **Step 1: Initialize git and Next.js app**

Run from `C:\Dev\training-tailor`:

```bash
git init
pnpm create next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm
```

(Installed Next.js 16.2, React 19.2.)

- [x] **Step 2: Add Vitest and supporting dev deps**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [x] **Step 3: Create `vitest.config.ts`** (uses Vitest's built-in tsconfig-paths resolution)

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

- [x] **Step 4: Add test script to `package.json`**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [x] **Step 5: Create a smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [x] **Step 6: Run the test, verify it passes**

Run: `pnpm test`
Expected: 1 passed.

- [x] **Step 7: Create `.env.example`**

```
# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/training_tailor?schema=public"

# AI provider selection: "gemini" (v1) — future: "claude", "openai"
AI_PROVIDER="gemini"
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-flash-latest"

# Auth.js
AUTH_SECRET=""
# Dev email: leave EMAIL_SERVER empty to log magic links to the console
EMAIL_SERVER=""
EMAIL_FROM="noreply@training-tailor.local"
```

`.gitignore` includes `.env` and `.env*.local` (create-next-app adds these; verified).

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and env template"
```

---

## Phase 1 — Database & data model

### Task 1.1: Set up Prisma and the schema — ✅ DONE

> **Status: completed** in commits `eb8937f` and `2265875`. Prisma 7 was installed: the client generates to `src/generated/prisma`, connects through the `@prisma/adapter-pg` driver adapter, and the datasource URL lives in `prisma.config.ts`. The schema holds **user data only** (auth models, `AthleteProfile`, `TailoredWorkout`) — domain knowledge (movements, contraindications, stimulus taxonomy) is versioned JSON in `data/` (Phase 2), never DB tables. Snippets below match the committed code.

**Files:**
- Create: `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db.ts`
- Modify: `package.json` (scripts)

- [x] **Step 1: Install Prisma**

```bash
pnpm add -D prisma
pnpm add @prisma/client @prisma/adapter-pg pg
pnpm add -D @types/pg dotenv
pnpm exec prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and `prisma.config.ts` (which reads `DATABASE_URL` via `dotenv`). Set `DATABASE_URL` in `.env` to a reachable Postgres (local Docker or a cloud dev instance).

- [x] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ---- Auth.js (NextAuth) models ----
model User {
  id            String          @id @default(cuid())
  email         String          @unique
  emailVerified DateTime?
  name          String?
  accounts      Account[]
  sessions      Session[]
  profile       AthleteProfile?
  tailored      TailoredWorkout[]
  createdAt     DateTime        @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// ---- Athlete profile ----
model AthleteProfile {
  id           String   @id @default(cuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  injuries     Json     @default("[]")   // string[] of injury keys/labels
  benchmarks   Json     @default("{}")   // { backSquat1RM?: number, canDoMuscleUp?: boolean, ... }
  equipment    Json     @default("[]")   // string[] equipment keys
  goals        Json     @default("[]")   // string[] free-text goals
  availability Json     @default("{}")   // { hoursPerDay?: number, daysPerWeek?: number, days?: string[] }
  updatedAt    DateTime @updatedAt
}

model TailoredWorkout {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  originalWorkout   Json     // StructuredWorkout (multi-block session; verbatim rawText preserved)
  request       Json     // TailorRequest
  tailoredWorkout   Json     // StructuredWorkout (multi-block session; verbatim rawText preserved)
  changes       Json     // ChangeItem[]
  rationale     String
  safetyNote    String?
  stimulus      Json     // StimulusClassification
  createdAt     DateTime @default(now())
}
```

> **Why workouts stay in `Json` columns:** a real training day is a sequence of blocks with
> different formats (strength piece, conditioning AMRAP, partner WOD), each carrying load-bearing
> prose (tempo, intensity cues, Rx+/Rx/Int scaling tiers). Modeling that relationally (a table per
> block format) is over-engineering against open-ended programming. Instead the workout is one
> `StructuredWorkout` JSON value — verbatim `rawText` as the durable source of truth plus a derived
> `blocks[]` extraction the engine reasons over (see Task 3.1). No migration is needed to support
> new formats; the schema absorbs them.

- [x] **Step 3: Add Prisma scripts to `package.json`**

```json
"db:push": "prisma db push",
"db:studio": "prisma studio"
```

(No `db:seed` script — domain data is JSON-backed, nothing is seeded into the DB.)

- [x] **Step 4: Push schema to the database**

Run: `pnpm db:push`
Expected: "Your database is now in sync with your Prisma schema." (Requires a reachable Postgres in `DATABASE_URL`.)

- [x] **Step 5: Create the Prisma client singleton `src/lib/db.ts`** (Prisma 7 driver adapter)

```ts
import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema and db client (auth, profile, tailored)"
```

---

## Phase 2 — Domain types & versioned domain data (JSON, no DB)

### Task 2.1: Define domain TypeScript types

Movements are classified on four orthogonal, enum-backed axes: **patterns[]**
(functional movement pattern — drives substitution and programming balance),
**positions[]** (whole-body positional demand — `hanging | inverted |
partial_inversion` — a body position the movement requires, which an athlete can
be categorically unable to adopt regardless of any specific injured tissue;
inversion is graded, so a contraindication may avoid full inversion without
avoiding the wall-supported kind), **stresses[]** (per-site
stress mechanisms — drive safety filtering), and **equipment[]** (required
equipment — an AND-set matched by subset against the athlete's available
equipment; empty = needs nothing; drives availability filtering, NOT
contraindication — a missing item filters substitution candidates, it does not
hard-block like an injury). A site is an anatomical site:
joints/spine regions plus muscle groups, so the same model covers joint injuries
and muscle strains. Contraindications declare `avoidStresses` in the same
`{ site, mechanisms[] }` shape, matched programmatically (site equal AND at least
one shared mechanism), and `avoidPositions` matched on simple membership — used
by limitation entries (e.g. `no_hanging`, `no_inversion`) that the LLM activates
from the athlete's situation; `avoidMovements` is an explicit-name override for
cases the stress and position vocabularies cannot capture — every use signals a
mechanism the vocabulary is missing, so the seeded data leaves it empty and a
guardrail test keeps it empty.

**Files:**
- Create: `src/lib/domain/types.ts`, `src/lib/domain/matching.ts`
- Test: `tests/domain/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/domain/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/matching";

describe("domain schemas", () => {
  it("validates a movement with patterns, positions, site stresses, and equipment", () => {
    const m = MovementSchema.parse({
      name: "Pull-up",
      patterns: ["vertical_pull"],
      positions: ["hanging"],
      stresses: [
        { site: "shoulder", mechanisms: ["traction", "kipping"] },
        { site: "elbow", mechanisms: ["traction", "kipping"] },
        { site: "biceps", mechanisms: ["eccentric"] },
      ],
      equipment: ["pullup_bar"],
      skill: "intermediate",
      substitutes: ["Ring Row", "Banded Pull-up"],
    });
    expect(m.patterns[0]).toBe("vertical_pull");
    expect(m.positions).toEqual(["hanging"]);
    expect(m.stresses).toHaveLength(3);
    expect(m.equipment).toEqual(["pullup_bar"]);
  });

  it("accepts hold as a movement pattern", () => {
    const m = MovementSchema.parse({
      name: "Handstand Hold", patterns: ["hold"], positions: ["inverted"], stresses: [],
      equipment: [], skill: "advanced", substitutes: [],
    });
    expect(m.patterns).toEqual(["hold"]);
  });

  it("accepts partial_inversion as a position", () => {
    const m = MovementSchema.parse({
      name: "Wall Climb", patterns: ["vertical_push"], positions: ["partial_inversion"], stresses: [],
      equipment: [], skill: "intermediate", substitutes: [],
    });
    expect(m.positions).toEqual(["partial_inversion"]);
  });

  it("requires at least one pattern", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", patterns: [], positions: [], stresses: [], equipment: [],
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("rejects values outside the pattern, position, site, and mechanism vocabularies", () => {
    const base = { name: "X", equipment: [], skill: "beginner", substitutes: [] };
    expect(() =>
      MovementSchema.parse({ ...base, patterns: ["yoga"], positions: [], stresses: [] })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({ ...base, patterns: ["squat"], positions: ["floating"], stresses: [] })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"], positions: [],
        stresses: [{ site: "pinky", mechanisms: ["compression"] }],
      })
    ).toThrow();
    expect(() =>
      MovementSchema.parse({
        ...base, patterns: ["squat"], positions: [],
        stresses: [{ site: "knee", mechanisms: ["vibes"] }],
      })
    ).toThrow();
  });

  it("rejects an equipment value outside the vocabulary", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", patterns: ["squat"], positions: [], stresses: [], equipment: ["rocket"],
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("validates an injury contraindication and stimulus def", () => {
    expect(
      InjuryContraindicationSchema.parse({
        injuryKey: "shoulder_impingement", label: "Shoulder impingement",
        avoidStresses: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
        avoidPositions: [], avoidMovements: [], notes: null,
      }).injuryKey
    ).toBe("shoulder_impingement");
    expect(
      StimulusDefSchema.parse({ key: "aerobic_capacity", label: "Aerobic capacity", description: "Sustained..." }).key
    ).toBe("aerobic_capacity");
  });
});

describe("matchesContraindication", () => {
  const overheadInjury = InjuryContraindicationSchema.parse({
    injuryKey: "shoulder_impingement", label: "Shoulder impingement",
    avoidStresses: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
    avoidPositions: [], avoidMovements: ["Bench Press"], notes: null,
  });
  const noInversion = InjuryContraindicationSchema.parse({
    injuryKey: "no_inversion", label: "Unable to go inverted",
    avoidStresses: [], avoidPositions: ["inverted"], avoidMovements: [], notes: null,
  });
  const press = MovementSchema.parse({
    name: "Shoulder Press", patterns: ["vertical_push"], positions: [],
    stresses: [{ site: "shoulder", mechanisms: ["overhead"] }],
    equipment: ["barbell"], skill: "beginner", substitutes: [],
  });
  const row = MovementSchema.parse({
    name: "Ring Row", patterns: ["horizontal_pull"], positions: [],
    stresses: [{ site: "shoulder", mechanisms: ["traction"] }],
    equipment: ["rings"], skill: "beginner", substitutes: [],
  });
  const bench = MovementSchema.parse({
    name: "Bench Press", patterns: ["horizontal_push"], positions: [], stresses: [],
    equipment: ["barbell", "bench"], skill: "beginner", substitutes: [],
  });
  const handstandPushUp = MovementSchema.parse({
    name: "Handstand Push-up", patterns: ["vertical_push"], positions: ["inverted"], stresses: [],
    equipment: [], skill: "advanced", substitutes: [],
  });

  it("blocks a movement whose stress overlaps an avoided site+mechanism", () => {
    expect(matchesContraindication(press, overheadInjury)).toBe(true);
  });

  it("allows a movement stressing the same site via a different mechanism", () => {
    expect(matchesContraindication(row, overheadInjury)).toBe(false);
  });

  it("blocks a movement listed explicitly in avoidMovements even without stress overlap", () => {
    expect(matchesContraindication(bench, overheadInjury)).toBe(true);
  });

  it("blocks a movement requiring an avoided position even without stress overlap", () => {
    expect(matchesContraindication(handstandPushUp, noInversion)).toBe(true);
  });

  it("allows a movement that does not require the avoided position", () => {
    expect(matchesContraindication(press, noInversion)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run tests/domain/types.test.ts`
Expected: FAIL — cannot find module `@/lib/domain/types`.

- [ ] **Step 3: Implement `src/lib/domain/types.ts` and `src/lib/domain/matching.ts`**

```ts
import { z } from "zod";

export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);

// An AND-set, matched by subset against the athlete's equipment. Empty = needs nothing.
export const Equipment = z.enum([
  "barbell",
  "dumbbell",
  "kettlebell",
  "pullup_bar",
  "rings",
  "box",
  "ramp",
  "bench",
  "ghd",
  "band",
  "jump_rope",
  "rower",
  "bike",
  "wall_ball",
]);

// Ordered primary-first (e.g. Thruster = ["squat", "vertical_push"]).
export const MovementPattern = z.enum([
  "squat",
  "hinge",
  "lunge",
  "vertical_push",
  "horizontal_push",
  "vertical_pull",
  "horizontal_pull",
  "core",
  "carry", // locomotion while holding a loaded position
  "hold",  // isometric maintenance of a loaded position
  "olympic",
  "jump",
  "monostructural",
]);

export const Position = z.enum([
  "hanging",           // suspended from a bar or rings
  "inverted",          // bodyweight fully on the hands
  "partial_inversion", // head below the hips, load shared with the feet on a surface
]);

export const Site = z.enum([
  // joints & spine
  "shoulder", "elbow", "wrist", "neck", "lumbar", "hip", "knee", "ankle",
  // muscle groups
  "quads", "hamstrings", "calves", "hip_flexors", "chest", "biceps",
]);

// Clinically significant (loaded or forceful) stress only, so load is implied and
// a site merely participating in a movement is not listed.
export const StressMechanism = z.enum([
  "compression",
  "flexion",      // through mid-range
  "deep_flexion", // end-range (a site gets flexion OR deep_flexion, never both)
  "extension",    // held extended under load (front rack, push-up wrist)
  "overhead",
  "ballistic",    // explosive, high-velocity
  "impact",
  "traction",     // hanging/distraction
  "kipping",      // dynamic swinging while hanging
  "eccentric",    // forceful lengthening, or loading at long muscle length
]);

export const SiteStressSchema = z.object({
  site: Site,
  mechanisms: z.array(StressMechanism).min(1),
});
export type SiteStress = z.infer<typeof SiteStressSchema>;

export const MovementSchema = z.object({
  name: z.string().min(1),
  patterns: z.array(MovementPattern).min(1),
  positions: z.array(Position),
  stresses: z.array(SiteStressSchema),
  equipment: z.array(Equipment),
  skill: SkillLevel,
  substitutes: z.array(z.string()),
});
export type Movement = z.infer<typeof MovementSchema>;

export const InjuryContraindicationSchema = z.object({
  injuryKey: z.string().min(1),
  label: z.string().min(1),
  avoidStresses: z.array(SiteStressSchema),
  avoidPositions: z.array(Position),
  // Escape hatch: each use signals a mechanism the vocabulary is missing.
  avoidMovements: z.array(z.string()),
  notes: z.string().nullable().optional(),
});
export type InjuryContraindication = z.infer<typeof InjuryContraindicationSchema>;

export const StimulusDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});
export type StimulusDef = z.infer<typeof StimulusDefSchema>;
```

`src/lib/domain/matching.ts`:

```ts
import type { InjuryContraindication, Movement } from "./types";

export function matchesContraindication(
  movement: Movement,
  contraindication: InjuryContraindication
): boolean {
  if (contraindication.avoidMovements.includes(movement.name)) return true;
  if (movement.positions.some((p) => contraindication.avoidPositions.includes(p))) return true;
  return movement.stresses.some((stress) =>
    contraindication.avoidStresses.some(
      (rule) =>
        rule.site === stress.site &&
        rule.mechanisms.some((m) => stress.mechanisms.includes(m))
    )
  );
}
```

Install Zod if not already present:

```bash
pnpm add zod
```

> This installs **Zod 4.x**. The project relies on Zod 4's native `z.toJSONSchema()` in the Gemini adapter (Task 3.3) — do **not** add `zod-to-json-schema` (it targets Zod 3 and is incompatible).

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run tests/domain/types.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: domain types and Zod schemas (movement, injury, stimulus)"
```

### Task 2.2: Author the versioned domain data JSON

> These files are the domain **source of truth** (nothing gets seeded into a DB — see Task 2.3). "Seed" in the test-file name just means "starting dataset".

**Files:**
- Create: `data/stimulus-taxonomy.json`, `data/movements.json`, `data/injury-contraindications.json`
- Test: `tests/domain/data.test.ts`

- [ ] **Step 1: Write the failing test (validates the JSON against schemas and the matching semantics)**

Beyond schema validity, uniqueness, and referential checks (substitutes and
`avoidMovements` must name real movements), the test runs `matchesContraindication`
over the real data with blocked/allowed guardrail cases for every injury and
positional-limitation entry, and asserts every entry leaves at least five
movements available.

`tests/domain/data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import movementsJson from "../../data/movements.json";
import injuriesJson from "../../data/injury-contraindications.json";
import stimuli from "../../data/stimulus-taxonomy.json";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import type { Movement } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/matching";

const movements = movementsJson.map((m) => MovementSchema.parse(m));
const injuries = injuriesJson.map((i) => InjuryContraindicationSchema.parse(i));

function byName(name: string): Movement {
  const m = movements.find((mv) => mv.name === name);
  if (!m) throw new Error(`movement not found: ${name}`);
  return m;
}

describe("domain data integrity", () => {
  it("every movement is valid and has a unique name", () => {
    const names = new Set<string>();
    for (const m of movements) {
      expect(names.has(m.name)).toBe(false);
      names.add(m.name);
    }
    expect(movements.length).toBeGreaterThanOrEqual(25);
  });

  it("every substitute references a real movement", () => {
    const names = new Set(movements.map((m) => m.name));
    for (const m of movements) for (const s of m.substitutes) expect(names.has(s)).toBe(true);
  });

  it("injuries are valid and reference real movements", () => {
    const names = new Set(movements.map((m) => m.name));
    for (const i of injuries) for (const mv of i.avoidMovements) expect(names.has(mv)).toBe(true);
    expect(injuries.length).toBeGreaterThanOrEqual(10);
  });

  it("strict handstand variants carry no ballistic shoulder stress", () => {
    const ballistic = (name: string) =>
      byName(name).stresses.some((s) => s.site === "shoulder" && s.mechanisms.includes("ballistic"));
    expect(ballistic("Handstand Push-up")).toBe(true);
    expect(ballistic("Strict Handstand Push-up")).toBe(false);
    expect(ballistic("Wall-facing Handstand Push-up")).toBe(false);
  });

  it("toes-to-bar scales through knees-to-elbows to the strict knee raise", () => {
    expect(byName("Toes-to-Bar").substitutes[0]).toBe("Knees-to-Elbows");
    expect(byName("Knees-to-Elbows").substitutes[0]).toBe("Hanging Knee Raise");
  });

  it("the GHD sit-up requires a GHD and scales to the V-up", () => {
    expect(byName("GHD Sit-up").equipment).toEqual(["ghd"]);
    expect(byName("GHD Sit-up").substitutes[0]).toBe("V-up");
    expect(byName("V-up").equipment).toEqual([]);
  });

  it("the ramp variant requires a ramp, the plain handstand walk requires nothing", () => {
    expect(byName("Handstand Walk Ramp").equipment).toEqual(["ramp"]);
    expect(byName("Handstand Walk").equipment).toEqual([]);
  });

  it("each muscle-up variant is apparatus-specific", () => {
    expect(byName("Bar Muscle-up").equipment).toEqual(["pullup_bar"]);
    expect(byName("Ring Muscle-up").equipment).toEqual(["rings"]);
  });

  it("each muscle-up variant substitutes for the other", () => {
    expect(byName("Bar Muscle-up").substitutes).toContain("Ring Muscle-up");
    expect(byName("Ring Muscle-up").substitutes).toContain("Bar Muscle-up");
  });

  it("no contraindication relies on an explicit movement override", () => {
    for (const i of injuries) expect(i.avoidMovements, i.injuryKey).toEqual([]);
  });

  it("stimulus taxonomy is valid with unique keys", () => {
    const keys = new Set<string>();
    for (const s of stimuli) {
      StimulusDefSchema.parse(s);
      expect(keys.has(s.key)).toBe(false);
      keys.add(s.key);
    }
    expect(keys.has("aerobic_capacity")).toBe(true);
  });
});

describe("contraindication matching over real data", () => {
  function injury(key: string) {
    const i = injuries.find((x) => x.injuryKey === key);
    if (!i) throw new Error(`injury not found: ${key}`);
    return i;
  }

  const cases: Array<{ key: string; blocked: string[]; allowed: string[] }> = [
    {
      key: "shoulder_impingement",
      blocked: [
        "Shoulder Press", "Push Press", "Handstand Push-up", "Power Snatch",
        "Bar Muscle-up", "Ring Muscle-up", "Overhead Squat", "Push Jerk", "Split Jerk",
        "Squat Snatch", "Clean & Jerk", "Dumbbell Push Press", "Dumbbell Push Jerk",
        "Chest-to-Bar", "Handstand Hold", "Handstand Walk", "Wall Climb",
        "Box Handstand Hold", "Knees-to-Elbows",
      ],
      allowed: ["Bench Press", "Ring Row", "Banded Pull-up", "Squat Clean", "Dead Hang", "Plank"],
    },
    {
      key: "lower_back_strain",
      blocked: ["Deadlift", "Kettlebell Swing", "Power Clean", "Power Snatch", "GHD Sit-up"],
      allowed: ["Romanian Deadlift", "Goblet Squat", "Bike (Erg)", "V-up", "Sit-up"],
    },
    {
      key: "knee_pain",
      blocked: [
        "Back Squat", "Front Squat", "Thruster", "Wall Ball", "Run", "Box Jump",
        "Overhead Squat", "Squat Clean", "Squat Snatch", "Clean & Jerk",
      ],
      allowed: ["Box Squat", "Air Squat", "Bike (Erg)", "Step-up", "Power Clean"],
    },
    {
      key: "wrist_pain",
      blocked: [
        "Front Squat", "Thruster", "Handstand Push-up", "Push-up", "Power Clean",
        "Overhead Squat", "Push Jerk", "Bar Muscle-up",
        "Strict Handstand Push-up", "Wall-facing Handstand Push-up",
        "Handstand Hold", "Handstand Walk", "Wall Climb", "Box Handstand Hold",
      ],
      allowed: [
        "Dumbbell Shoulder Press", "Dumbbell Bench Press", "Ring Row",
        "Ring Muscle-up", "Dumbbell Push Press", "Dumbbell Push Jerk",
        "Dumbbell Overhead Hold", "Plank",
      ],
    },
    {
      key: "elbow_tendinopathy",
      blocked: [
        "Bar Muscle-up", "Ring Muscle-up", "Pull-up", "Toes-to-Bar",
        "Chest-to-Bar", "Knees-to-Elbows",
      ],
      allowed: ["Banded Pull-up", "Ring Row", "Dead Hang", "Hanging Knee Raise"],
    },
    {
      key: "ankle_sprain",
      blocked: ["Run", "Double-under", "Burpee", "Box Jump"],
      allowed: ["Row (Erg)", "Bike (Erg)", "Up-Down"],
    },
    {
      key: "hip_flexor_strain",
      blocked: [
        "Toes-to-Bar", "Run", "Power Clean", "Power Snatch",
        "Squat Clean", "Squat Snatch", "Clean & Jerk", "GHD Sit-up", "V-up",
        "Knees-to-Elbows",
      ],
      allowed: ["Kettlebell Swing", "Bike (Erg)", "Air Squat", "Deadlift"],
    },
    {
      key: "quad_strain",
      blocked: ["Back Squat", "Thruster", "Wall Ball", "Box Jump"],
      allowed: ["Air Squat", "Box Squat", "Step-up", "Bike (Erg)"],
    },
    {
      key: "hamstring_strain",
      blocked: ["Deadlift", "Romanian Deadlift", "Kettlebell Swing", "Run"],
      allowed: ["Bike (Erg)", "Air Squat", "Shoulder Press"],
    },
    {
      key: "calf_strain",
      blocked: ["Run", "Double-under", "Single-under", "Box Jump"],
      allowed: ["Bike (Erg)", "Row (Erg)", "Air Squat"],
    },
    {
      key: "pec_strain",
      blocked: ["Bench Press", "Dumbbell Bench Press", "Push-up", "Bar Muscle-up", "Ring Muscle-up"],
      allowed: ["Knee Push-up", "Ring Row", "Shoulder Press"],
    },
    {
      key: "biceps_strain",
      blocked: ["Pull-up", "Bar Muscle-up", "Ring Muscle-up", "Chest-to-Bar"],
      allowed: ["Ring Row", "Banded Pull-up", "Push-up"],
    },
    {
      key: "no_hanging",
      blocked: [
        "Pull-up", "Banded Pull-up", "Bar Muscle-up", "Ring Muscle-up",
        "Toes-to-Bar", "Hanging Knee Raise", "Chest-to-Bar", "Dead Hang",
        "Knees-to-Elbows",
      ],
      allowed: ["Ring Row", "Sit-up", "Shoulder Press", "Handstand Hold"],
    },
    {
      key: "no_inversion",
      blocked: [
        "Handstand Push-up", "Strict Handstand Push-up", "Wall-facing Handstand Push-up",
        "Handstand Hold", "Handstand Walk", "Handstand Walk Pirouette",
        "Handstand Walk Ramp", "Wall Climb", "Box Handstand Hold",
      ],
      allowed: [
        "Shoulder Press", "Push Press", "Push-up", "Wall Ball", "Dead Hang",
        "Plank", "Dumbbell Overhead Hold",
      ],
    },
  ];

  for (const c of cases) {
    it(`${c.key}: blocks the contraindicated movements and spares safe substitutes`, () => {
      const i = injury(c.key);
      for (const name of c.blocked) {
        expect(matchesContraindication(byName(name), i), `${name} should be blocked`).toBe(true);
      }
      for (const name of c.allowed) {
        expect(matchesContraindication(byName(name), i), `${name} should be allowed`).toBe(false);
      }
    });
  }

  it("no_inversion blocks partially inverted movements, not only full inversion", () => {
    const wallClimb = byName("Wall Climb");
    expect(wallClimb.positions).toEqual(["partial_inversion"]);
    expect(matchesContraindication(wallClimb, injury("no_inversion"))).toBe(true);
  });

  it("the handstand hold scales to a supported inverted hold before leaving inversion", () => {
    const first = byName("Handstand Hold").substitutes[0];
    expect(first).toBe("Box Handstand Hold");
    expect(byName(first).positions).toEqual(["partial_inversion"]);
    expect(byName(first).patterns).toEqual(["hold"]);
  });

  it("the handstand hold falls back to a hold that survives no_inversion", () => {
    const usable = byName("Handstand Hold")
      .substitutes.map(byName)
      .filter((m) => !matchesContraindication(m, injury("no_inversion")));
    expect(usable.map((m) => m.name)).toContain("Dumbbell Overhead Hold");
  });

  it("the plank survives every contraindication", () => {
    const plank = byName("Plank");
    for (const i of injuries) expect(matchesContraindication(plank, i), i.injuryKey).toBe(false);
  });

  it("every injury leaves at least five movements available", () => {
    for (const i of injuries) {
      const remaining = movements.filter((m) => !matchesContraindication(m, i));
      expect(remaining.length, i.injuryKey).toBeGreaterThanOrEqual(5);
    }
  });
});
```

Enable JSON imports in `tsconfig.json` if needed (`"resolveJsonModule": true` — create-next-app sets this).

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run tests/domain/data.test.ts`
Expected: FAIL — cannot find the JSON files.

- [ ] **Step 3: Create `data/stimulus-taxonomy.json`**

```json
[
  { "key": "aerobic_capacity", "label": "Aerobic capacity", "description": "Sustained sub-threshold conditioning, typically >8 min, steady breathing." },
  { "key": "anaerobic_capacity", "label": "Anaerobic capacity", "description": "Short, high-intensity efforts with incomplete recovery; sprint conditioning." },
  { "key": "heavy_strength", "label": "Heavy strength", "description": "Low reps at high load to build maximal strength." },
  { "key": "muscular_endurance", "label": "Muscular endurance", "description": "High-rep, moderate-load work sustaining muscular output over time." },
  { "key": "gymnastics_skill", "label": "Gymnastics skill", "description": "Bodyweight skill and control (e.g., muscle-ups, handstands, pull-ups)." },
  { "key": "olympic_lifting", "label": "Olympic lifting", "description": "Snatch/clean & jerk technique and power expression." },
  { "key": "mixed_modal", "label": "Mixed-modal conditioning", "description": "Blended monostructural + weightlifting + gymnastics intensity." }
]
```

- [ ] **Step 4: Create `data/movements.json`** (>=25 common functional fitness movements; each substitute MUST also appear as a `name`)

Annotation conventions: `patterns` is ordered primary-first, and separates
locomotion under load (`carry`) from isometric maintenance of a position
(`hold`); `positions` lists the body positions the movement requires (`hanging` =
suspended from a bar or rings, `inverted` = upside down with bodyweight fully on
the hands, `partial_inversion` = load shared with the feet on a surface) and is
empty for most movements; `equipment`
lists only availability-relevant gear (don't model the floor or the wall — a
bodyweight movement with no gear gets `[]`); `stresses`
lists only *clinically significant* (loaded or forceful) stress — a site merely
participating is not listed, and muscle sites are listed only for primary movers
under substantial load. In particular, unloaded bodyweight range of motion is not
`deep_flexion` (Air Squat has no knee entry, so it stays available for knee pain),
strict variants drop `kipping`/`ballistic` (Banded Pull-up stays available for
elbow tendinopathy), and reduced-load variants drop muscle entries (Knee Push-up
has no chest entry, so it stays available for a pec strain).

```json
[
  { "name": "Back Squat", "patterns": ["squat"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "hip", "mechanisms": ["compression"] }, { "site": "lumbar", "mechanisms": ["compression"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "beginner", "substitutes": ["Goblet Squat", "Air Squat"] },
  { "name": "Front Squat", "patterns": ["squat"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "lumbar", "mechanisms": ["compression"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "intermediate", "substitutes": ["Goblet Squat", "Air Squat"] },
  { "name": "Air Squat", "patterns": ["squat"], "positions": [], "stresses": [], "equipment": [], "skill": "beginner", "substitutes": ["Box Squat"] },
  { "name": "Goblet Squat", "patterns": ["squat"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["deep_flexion"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["dumbbell"], "skill": "beginner", "substitutes": ["Air Squat"] },
  { "name": "Box Squat", "patterns": ["squat"], "positions": [], "stresses": [], "equipment": ["box"], "skill": "beginner", "substitutes": ["Air Squat"] },
  { "name": "Overhead Squat", "patterns": ["squat"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "lumbar", "mechanisms": ["compression"] }, { "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Front Squat", "Air Squat"] },
  { "name": "Deadlift", "patterns": ["hinge"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["compression"] }, { "site": "hamstrings", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "beginner", "substitutes": ["Romanian Deadlift", "Kettlebell Swing"] },
  { "name": "Romanian Deadlift", "patterns": ["hinge"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["flexion"] }, { "site": "hamstrings", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "intermediate", "substitutes": ["Kettlebell Swing"] },
  { "name": "Shoulder Press", "patterns": ["vertical_push"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": ["barbell"], "skill": "beginner", "substitutes": ["Dumbbell Shoulder Press", "Push Press"] },
  { "name": "Push Press", "patterns": ["vertical_push"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": ["barbell"], "skill": "intermediate", "substitutes": ["Shoulder Press", "Dumbbell Shoulder Press"] },
  { "name": "Push Jerk", "patterns": ["vertical_push"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": ["barbell"], "skill": "intermediate", "substitutes": ["Push Press", "Shoulder Press"] },
  { "name": "Split Jerk", "patterns": ["vertical_push", "lunge"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Push Jerk", "Push Press"] },
  { "name": "Dumbbell Shoulder Press", "patterns": ["vertical_push"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }], "equipment": ["dumbbell"], "skill": "beginner", "substitutes": ["Shoulder Press"] },
  { "name": "Dumbbell Push Press", "patterns": ["vertical_push"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }], "equipment": ["dumbbell"], "skill": "intermediate", "substitutes": ["Dumbbell Shoulder Press", "Push Press"] },
  { "name": "Dumbbell Push Jerk", "patterns": ["vertical_push"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }], "equipment": ["dumbbell"], "skill": "intermediate", "substitutes": ["Dumbbell Push Press", "Push Jerk"] },
  { "name": "Dumbbell Overhead Hold", "patterns": ["hold"], "positions": [], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }], "equipment": ["dumbbell"], "skill": "beginner", "substitutes": ["Plank"] },
  { "name": "Bench Press", "patterns": ["horizontal_push"], "positions": [], "stresses": [{ "site": "chest", "mechanisms": ["eccentric"] }], "equipment": ["barbell", "bench"], "skill": "beginner", "substitutes": ["Push-up", "Dumbbell Bench Press"] },
  { "name": "Dumbbell Bench Press", "patterns": ["horizontal_push"], "positions": [], "stresses": [{ "site": "chest", "mechanisms": ["eccentric"] }], "equipment": ["dumbbell", "bench"], "skill": "beginner", "substitutes": ["Push-up"] },
  { "name": "Push-up", "patterns": ["horizontal_push"], "positions": [], "stresses": [{ "site": "wrist", "mechanisms": ["extension"] }, { "site": "chest", "mechanisms": ["eccentric"] }], "equipment": [], "skill": "beginner", "substitutes": ["Knee Push-up"] },
  { "name": "Knee Push-up", "patterns": ["horizontal_push"], "positions": [], "stresses": [{ "site": "wrist", "mechanisms": ["extension"] }], "equipment": [], "skill": "beginner", "substitutes": [] },
  { "name": "Pull-up", "patterns": ["vertical_pull"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction", "kipping"] }, { "site": "elbow", "mechanisms": ["traction", "kipping"] }, { "site": "biceps", "mechanisms": ["eccentric"] }], "equipment": ["pullup_bar"], "skill": "intermediate", "substitutes": ["Ring Row", "Banded Pull-up"] },
  { "name": "Chest-to-Bar", "patterns": ["vertical_pull"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction", "kipping"] }, { "site": "elbow", "mechanisms": ["traction", "kipping"] }, { "site": "biceps", "mechanisms": ["eccentric"] }], "equipment": ["pullup_bar"], "skill": "advanced", "substitutes": ["Pull-up", "Banded Pull-up"] },
  { "name": "Banded Pull-up", "patterns": ["vertical_pull"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction"] }, { "site": "elbow", "mechanisms": ["traction"] }], "equipment": ["pullup_bar", "band"], "skill": "beginner", "substitutes": ["Ring Row"] },
  { "name": "Ring Row", "patterns": ["horizontal_pull"], "positions": [], "stresses": [], "equipment": ["rings"], "skill": "beginner", "substitutes": [] },
  { "name": "Dead Hang", "patterns": ["hold"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction"] }, { "site": "elbow", "mechanisms": ["traction"] }], "equipment": ["pullup_bar"], "skill": "beginner", "substitutes": [] },
  { "name": "Bar Muscle-up", "patterns": ["vertical_pull"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction", "kipping", "ballistic"] }, { "site": "elbow", "mechanisms": ["traction", "kipping", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "chest", "mechanisms": ["eccentric", "ballistic"] }, { "site": "biceps", "mechanisms": ["eccentric", "ballistic"] }], "equipment": ["pullup_bar"], "skill": "advanced", "substitutes": ["Ring Muscle-up", "Pull-up", "Ring Row"] },
  { "name": "Ring Muscle-up", "patterns": ["vertical_pull"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction", "kipping", "ballistic"] }, { "site": "elbow", "mechanisms": ["traction", "kipping", "ballistic"] }, { "site": "chest", "mechanisms": ["eccentric", "ballistic"] }, { "site": "biceps", "mechanisms": ["eccentric", "ballistic"] }], "equipment": ["rings"], "skill": "advanced", "substitutes": ["Bar Muscle-up", "Pull-up", "Ring Row"] },
  { "name": "Handstand Push-up", "patterns": ["vertical_push"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "neck", "mechanisms": ["compression"] }], "equipment": [], "skill": "advanced", "substitutes": ["Dumbbell Shoulder Press", "Push-up"] },
  { "name": "Strict Handstand Push-up", "patterns": ["vertical_push"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "neck", "mechanisms": ["compression"] }], "equipment": [], "skill": "advanced", "substitutes": ["Handstand Push-up", "Dumbbell Shoulder Press"] },
  { "name": "Wall-facing Handstand Push-up", "patterns": ["vertical_push"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "neck", "mechanisms": ["compression"] }], "equipment": [], "skill": "advanced", "substitutes": ["Strict Handstand Push-up", "Handstand Push-up"] },
  { "name": "Wall Climb", "patterns": ["carry"], "positions": ["partial_inversion"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": [], "skill": "intermediate", "substitutes": ["Push-up", "Dumbbell Shoulder Press"] },
  { "name": "Handstand Hold", "patterns": ["hold"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": [], "skill": "advanced", "substitutes": ["Box Handstand Hold", "Dumbbell Overhead Hold"] },
  { "name": "Box Handstand Hold", "patterns": ["hold"], "positions": ["partial_inversion"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": ["box"], "skill": "intermediate", "substitutes": ["Dumbbell Overhead Hold", "Plank"] },
  { "name": "Handstand Walk", "patterns": ["carry"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": [], "skill": "advanced", "substitutes": ["Wall Climb", "Handstand Hold"] },
  { "name": "Handstand Walk Pirouette", "patterns": ["carry"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": [], "skill": "advanced", "substitutes": ["Handstand Walk", "Wall Climb"] },
  { "name": "Handstand Walk Ramp", "patterns": ["carry"], "positions": ["inverted"], "stresses": [{ "site": "shoulder", "mechanisms": ["overhead"] }, { "site": "wrist", "mechanisms": ["extension"] }], "equipment": ["ramp"], "skill": "advanced", "substitutes": ["Handstand Walk", "Wall Climb"] },
  { "name": "Toes-to-Bar", "patterns": ["core"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction", "kipping"] }, { "site": "elbow", "mechanisms": ["kipping"] }, { "site": "hip_flexors", "mechanisms": ["flexion"] }, { "site": "lumbar", "mechanisms": ["flexion"] }], "equipment": ["pullup_bar"], "skill": "intermediate", "substitutes": ["Knees-to-Elbows", "Hanging Knee Raise", "Sit-up"] },
  { "name": "Knees-to-Elbows", "patterns": ["core"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction", "kipping"] }, { "site": "elbow", "mechanisms": ["kipping"] }, { "site": "hip_flexors", "mechanisms": ["flexion"] }, { "site": "lumbar", "mechanisms": ["flexion"] }], "equipment": ["pullup_bar"], "skill": "intermediate", "substitutes": ["Hanging Knee Raise", "Sit-up"] },
  { "name": "Hanging Knee Raise", "patterns": ["core"], "positions": ["hanging"], "stresses": [{ "site": "shoulder", "mechanisms": ["traction"] }, { "site": "hip_flexors", "mechanisms": ["flexion"] }], "equipment": ["pullup_bar"], "skill": "beginner", "substitutes": ["Sit-up"] },
  { "name": "Sit-up", "patterns": ["core"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["flexion"] }, { "site": "hip_flexors", "mechanisms": ["flexion"] }], "equipment": [], "skill": "beginner", "substitutes": [] },
  { "name": "V-up", "patterns": ["core"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["flexion"] }, { "site": "hip_flexors", "mechanisms": ["flexion"] }], "equipment": [], "skill": "intermediate", "substitutes": ["Sit-up"] },
  { "name": "GHD Sit-up", "patterns": ["core"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["flexion", "extension"] }, { "site": "hip_flexors", "mechanisms": ["flexion", "eccentric"] }], "equipment": ["ghd"], "skill": "advanced", "substitutes": ["V-up", "Sit-up"] },
  { "name": "Plank", "patterns": ["core", "hold"], "positions": [], "stresses": [], "equipment": [], "skill": "beginner", "substitutes": [] },
  { "name": "Kettlebell Swing", "patterns": ["hinge"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["ballistic"] }, { "site": "hip", "mechanisms": ["ballistic"] }, { "site": "hamstrings", "mechanisms": ["ballistic", "eccentric"] }], "equipment": ["kettlebell"], "skill": "beginner", "substitutes": ["Romanian Deadlift"] },
  { "name": "Power Clean", "patterns": ["olympic", "hinge"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["compression", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "hip_flexors", "mechanisms": ["flexion", "ballistic"] }, { "site": "hamstrings", "mechanisms": ["ballistic"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Kettlebell Swing", "Deadlift"] },
  { "name": "Power Snatch", "patterns": ["olympic", "hinge"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["compression", "ballistic"] }, { "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "hip_flexors", "mechanisms": ["flexion", "ballistic"] }, { "site": "hamstrings", "mechanisms": ["ballistic"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Kettlebell Swing"] },
  { "name": "Squat Clean", "patterns": ["olympic", "hinge", "squat"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["compression", "ballistic"] }, { "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "hip_flexors", "mechanisms": ["flexion", "ballistic"] }, { "site": "hamstrings", "mechanisms": ["ballistic"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Power Clean", "Front Squat"] },
  { "name": "Squat Snatch", "patterns": ["olympic", "hinge", "squat"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["compression", "ballistic"] }, { "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "hip_flexors", "mechanisms": ["flexion", "ballistic"] }, { "site": "hamstrings", "mechanisms": ["ballistic"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Power Snatch", "Overhead Squat"] },
  { "name": "Clean & Jerk", "patterns": ["olympic", "hinge", "squat", "vertical_push"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["compression", "ballistic"] }, { "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "hip_flexors", "mechanisms": ["flexion", "ballistic"] }, { "site": "hamstrings", "mechanisms": ["ballistic"] }, { "site": "quads", "mechanisms": ["eccentric"] }], "equipment": ["barbell"], "skill": "advanced", "substitutes": ["Squat Clean", "Power Clean"] },
  { "name": "Thruster", "patterns": ["squat", "vertical_push"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["deep_flexion", "compression"] }, { "site": "lumbar", "mechanisms": ["compression"] }, { "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "wrist", "mechanisms": ["extension"] }, { "site": "quads", "mechanisms": ["eccentric", "ballistic"] }], "equipment": ["barbell"], "skill": "intermediate", "substitutes": ["Goblet Squat", "Dumbbell Shoulder Press"] },
  { "name": "Wall Ball", "patterns": ["squat", "vertical_push"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["deep_flexion", "ballistic"] }, { "site": "shoulder", "mechanisms": ["overhead", "ballistic"] }, { "site": "quads", "mechanisms": ["ballistic"] }], "equipment": ["wall_ball"], "skill": "beginner", "substitutes": ["Thruster", "Goblet Squat"] },
  { "name": "Burpee", "patterns": ["jump", "horizontal_push"], "positions": [], "stresses": [{ "site": "wrist", "mechanisms": ["extension", "impact"] }, { "site": "knee", "mechanisms": ["impact"] }, { "site": "ankle", "mechanisms": ["impact"] }, { "site": "chest", "mechanisms": ["eccentric"] }, { "site": "calves", "mechanisms": ["ballistic"] }], "equipment": [], "skill": "beginner", "substitutes": ["Up-Down", "Push-up"] },
  { "name": "Up-Down", "patterns": ["jump"], "positions": [], "stresses": [], "equipment": [], "skill": "beginner", "substitutes": [] },
  { "name": "Box Jump", "patterns": ["jump"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["impact", "ballistic"] }, { "site": "ankle", "mechanisms": ["impact", "ballistic"] }, { "site": "quads", "mechanisms": ["ballistic", "eccentric"] }, { "site": "calves", "mechanisms": ["ballistic"] }], "equipment": ["box"], "skill": "beginner", "substitutes": ["Step-up"] },
  { "name": "Step-up", "patterns": ["lunge"], "positions": [], "stresses": [], "equipment": ["box"], "skill": "beginner", "substitutes": ["Air Squat"] },
  { "name": "Row (Erg)", "patterns": ["monostructural"], "positions": [], "stresses": [{ "site": "lumbar", "mechanisms": ["flexion"] }], "equipment": ["rower"], "skill": "beginner", "substitutes": ["Bike (Erg)", "Run"] },
  { "name": "Bike (Erg)", "patterns": ["monostructural"], "positions": [], "stresses": [], "equipment": ["bike"], "skill": "beginner", "substitutes": ["Row (Erg)"] },
  { "name": "Run", "patterns": ["monostructural"], "positions": [], "stresses": [{ "site": "knee", "mechanisms": ["impact"] }, { "site": "ankle", "mechanisms": ["impact"] }, { "site": "hip_flexors", "mechanisms": ["flexion"] }, { "site": "hamstrings", "mechanisms": ["ballistic"] }, { "site": "calves", "mechanisms": ["eccentric"] }], "equipment": [], "skill": "beginner", "substitutes": ["Row (Erg)", "Bike (Erg)"] },
  { "name": "Double-under", "patterns": ["jump", "monostructural"], "positions": [], "stresses": [{ "site": "ankle", "mechanisms": ["impact", "ballistic"] }, { "site": "calves", "mechanisms": ["ballistic"] }], "equipment": ["jump_rope"], "skill": "intermediate", "substitutes": ["Single-under"] },
  { "name": "Single-under", "patterns": ["jump", "monostructural"], "positions": [], "stresses": [{ "site": "ankle", "mechanisms": ["impact"] }, { "site": "calves", "mechanisms": ["ballistic"] }], "equipment": ["jump_rope"], "skill": "beginner", "substitutes": [] }
]
```

- [ ] **Step 5: Create `data/injury-contraindications.json`** (every `avoidMovements` entry MUST be a movement `name` above)

Each injury declares `avoidStresses` rules matched programmatically against
movement stresses; derivation replaces hand-listing, so `avoidMovements` stays
empty except for true exceptions the stress vocabulary cannot capture. The
catalog also contains **limitation entries** (`no_hanging`, `no_inversion`) that
carry only `avoidPositions` — they are not injuries; the LLM activates them from
the athlete's stated situation (cast, grip injury, vertigo, pregnancy) and the
matching code enforces them deterministically.

```json
[
  { "injuryKey": "shoulder_impingement", "label": "Shoulder impingement", "avoidStresses": [{ "site": "shoulder", "mechanisms": ["overhead", "ballistic", "kipping"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded overhead work and ballistic/kipping shoulder loading; prefer neutral-grip, below-shoulder work." },
  { "injuryKey": "lower_back_strain", "label": "Lower back strain", "avoidStresses": [{ "site": "lumbar", "mechanisms": ["compression", "ballistic", "extension"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid heavy axial loading, ballistic hinging, and loaded end-range extension (GHD Sit-up); light controlled hinging (e.g., Romanian Deadlift) and spinal flexion (e.g., Sit-up) are acceptable." },
  { "injuryKey": "knee_pain", "label": "Knee pain", "avoidStresses": [{ "site": "knee", "mechanisms": ["deep_flexion", "impact"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded end-range knee flexion and impact; prefer box squats to a comfortable height and low-impact cardio." },
  { "injuryKey": "wrist_pain", "label": "Wrist pain", "avoidStresses": [{ "site": "wrist", "mechanisms": ["extension", "impact"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded wrist extension; use dumbbells/neutral grip where possible." },
  { "injuryKey": "elbow_tendinopathy", "label": "Elbow tendinopathy", "avoidStresses": [{ "site": "elbow", "mechanisms": ["ballistic", "kipping"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid ballistic/kipping pulling; strict controlled pulling and supported rows are acceptable." },
  { "injuryKey": "ankle_sprain", "label": "Ankle sprain", "avoidStresses": [{ "site": "ankle", "mechanisms": ["impact", "ballistic"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid impact/plyometrics; use low-impact monostructural substitutes." },
  { "injuryKey": "hip_flexor_strain", "label": "Hip flexor strain", "avoidStresses": [{ "site": "hip_flexors", "mechanisms": ["flexion", "ballistic"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded and explosive hip flexion. The olympic lifts qualify through the pull-under, annotated as hip_flexors: flexion + ballistic — no explicit movement override is needed." },
  { "injuryKey": "quad_strain", "label": "Quadriceps strain", "avoidStresses": [{ "site": "quads", "mechanisms": ["eccentric", "ballistic"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded/explosive knee extension; unloaded squatting to a comfortable depth and low-impact cardio are acceptable." },
  { "injuryKey": "hamstring_strain", "label": "Hamstring strain", "avoidStresses": [{ "site": "hamstrings", "mechanisms": ["eccentric", "ballistic"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded hinging, long-length hamstring loading, and sprinting; bike is the preferred conditioning." },
  { "injuryKey": "calf_strain", "label": "Calf strain", "avoidStresses": [{ "site": "calves", "mechanisms": ["ballistic", "eccentric"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid jumping, rope work, and running; bike or row for conditioning." },
  { "injuryKey": "pec_strain", "label": "Pectoral strain", "avoidStresses": [{ "site": "chest", "mechanisms": ["eccentric", "ballistic"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid loaded pressing through a deep pec stretch; light reduced-range pressing (e.g., knee push-ups) as tolerated." },
  { "injuryKey": "biceps_strain", "label": "Biceps strain", "avoidStresses": [{ "site": "biceps", "mechanisms": ["eccentric", "ballistic"] }], "avoidPositions": [], "avoidMovements": [], "notes": "Avoid high-load and ballistic pulling; supported rows and banded pull-ups as tolerated." },
  { "injuryKey": "no_hanging", "label": "Unable to hang from a bar or rings", "avoidStresses": [], "avoidPositions": ["hanging"], "avoidMovements": [], "notes": "Limitation, not an injury: the athlete cannot suspend their bodyweight from a bar or rings (hand/grip injury, cast, post-op restriction). Activated by the LLM from the athlete's situation rather than an injury diagnosis." },
  { "injuryKey": "no_inversion", "label": "Unable to go upside down", "avoidStresses": [], "avoidPositions": ["inverted", "partial_inversion"], "avoidMovements": [], "notes": "Limitation, not an injury: the athlete cannot adopt inverted positions (vertigo, blood pressure, pregnancy, eye conditions). Blocks supported inversion too, since the head still goes below the hips. Overhead pressing remains available; only the handstand family is blocked. Activated by the LLM from the athlete's situation." }
]
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm exec vitest run tests/domain/data.test.ts`
Expected: PASS (30 tests). If referential or guardrail checks fail, fix the offending name/annotation in the JSON.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: seed domain data (movements, injuries, stimulus taxonomy) with integrity tests"
```

### Task 2.3: JSON-backed domain repository

The domain data (movements, contraindications, stimulus taxonomy) is read-only, tiny, and ships with the code — the versioned JSON in `data/` **is** the source of truth. No DB tables, no seed script, no DB-dependent tests. The repository keeps `Promise`-returning signatures so a later move to the DB (Phase C, when coaches edit domain data at runtime) changes only this file.

**Files:**
- Create: `src/lib/domain/repository.ts`
- Test: `tests/domain/repository.test.ts`

**Interfaces:**
- Consumes: `MovementSchema`, `InjuryContraindicationSchema`, `StimulusDefSchema` and their types from `@/lib/domain/types` (Task 2.1); the JSON files from Task 2.2.
- Produces: `getAllMovements(): Promise<Movement[]>`, `getContraindicationsForInjuries(injuryKeys: string[]): Promise<InjuryContraindication[]>`, `getStimulusDefs(): Promise<StimulusDef[]>` — used by `tailor-service.ts` (Task 6.3).

- [ ] **Step 1: Write the failing repository test** (pure — no DB)

`tests/domain/repository.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getAllMovements, getContraindicationsForInjuries, getStimulusDefs } from "@/lib/domain/repository";

describe("domain repository (JSON-backed)", () => {
  it("loads the movement library", async () => {
    const all = await getAllMovements();
    expect(all.find((m) => m.name === "Back Squat")).toBeTruthy();
  });

  it("returns contraindications for given injury keys", async () => {
    const c = await getContraindicationsForInjuries(["shoulder_impingement"]);
    expect(c).toHaveLength(1);
    expect(c[0].avoidStresses.some((r) => r.site === "shoulder")).toBe(true);
  });

  it("returns an empty list for no injury keys", async () => {
    expect(await getContraindicationsForInjuries([])).toEqual([]);
  });

  it("loads the stimulus taxonomy", async () => {
    const s = await getStimulusDefs();
    expect(s.some((d) => d.key === "aerobic_capacity")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/domain/repository.test.ts`
Expected: FAIL — module `@/lib/domain/repository` not found.

- [ ] **Step 3: Implement `src/lib/domain/repository.ts`**

The JSON is validated once at module load, so a malformed edit to `data/*.json` fails loudly at startup, not silently at tailor time.

```ts
import { z } from "zod";
import movementsJson from "../../../data/movements.json";
import injuriesJson from "../../../data/injury-contraindications.json";
import stimuliJson from "../../../data/stimulus-taxonomy.json";
import {
  MovementSchema, InjuryContraindicationSchema, StimulusDefSchema,
  type Movement, type InjuryContraindication, type StimulusDef,
} from "@/lib/domain/types";

const movements = z.array(MovementSchema).parse(movementsJson);
const injuries = z.array(InjuryContraindicationSchema).parse(injuriesJson);
const stimuli = z.array(StimulusDefSchema).parse(stimuliJson);

export async function getAllMovements(): Promise<Movement[]> {
  return movements;
}

export async function getContraindicationsForInjuries(injuryKeys: string[]): Promise<InjuryContraindication[]> {
  if (injuryKeys.length === 0) return [];
  const wanted = new Set(injuryKeys);
  return injuries.filter((i) => wanted.has(i.injuryKey));
}

export async function getStimulusDefs(): Promise<StimulusDef[]> {
  return stimuli;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/domain/repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite, verify green**

Run: `pnpm test`
Expected: all tests pass, with no DB required.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: JSON-backed domain repository"
```

---

## Phase 3 — Engine types & AI abstraction

### Task 3.1: Engine types & Zod schemas

**Files:**
- Create: `src/lib/engine/types.ts`
- Test: `tests/engine/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { StructuredWorkoutSchema, StimulusClassificationSchema, TailoringResultSchema, StimulusTag } from "@/lib/engine/types";
import stimuli from "../../data/stimulus-taxonomy.json";

describe("engine schemas", () => {
  it("StimulusTag stays in sync with data/stimulus-taxonomy.json", () => {
    // The z.enum gives compile-time literal types; this test pins it to the JSON,
    // which is the single authoritative taxonomy. Add a stimulus in BOTH places.
    expect([...StimulusTag.options].sort()).toEqual(stimuli.map((s) => s.key).sort());
  });

  it("parses a single-block session", () => {
    const workout = StructuredWorkoutSchema.parse({
      name: "Fran",
      rawText: "21-15-9 for time\nThrusters 95 lb\nPull-ups",
      source: "adhoc",
      blocks: [
        {
          title: "Fran", rawText: "21-15-9 for time\nThrusters 95 lb\nPull-ups",
          format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 5, coachingNotes: null,
          components: [
            { movement: "Thruster", reps: "21-15-9", load: "95 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null },
            { movement: "Pull-up", reps: "21-15-9", load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
          ],
        },
      ],
    });
    expect(workout.blocks[0].components).toHaveLength(2);
  });

  it("parses a multi-block session (strength + conditioning) and preserves coaching prose", () => {
    const workout = StructuredWorkoutSchema.parse({
      name: "Planificación RX",
      rawText: "Power Snatch\n8 sets every 2 min...\n\nConditioning barbell\nAMRAP 10 min\n3 burpee pull-up / 6 power clean @61/43kg / 9 box jump over",
      source: "adhoc",
      blocks: [
        {
          title: "Power Snatch", rawText: "Power Snatch\n8 sets every 2 min...",
          format: "strength", scheme: "8 sets every 2 min", timeDomainMinutes: 16,
          coachingNotes: "Técnica: mantener buena posición en las pausas; recibir la barra lo más alta posible.",
          components: [{ movement: "Power Snatch", reps: "2-5", load: "54–65 kg", distanceMeters: null, calories: null, durationSeconds: null, notes: "tempo with pauses" }],
        },
        {
          title: "Conditioning barbell", rawText: "AMRAP 10 min\n3 burpee pull-up / 6 power clean @61/43kg / 9 box jump over",
          format: "amrap", scheme: "AMRAP 10 min", timeDomainMinutes: 10,
          coachingNotes: "Ritmo sostenido. Marca objetivo: Rx+ +7 rondas / Rx +6 / Int +5. Int load 52/35 kg.",
          components: [
            { movement: "Burpee Pull-up", reps: 3, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
            { movement: "Power Clean", reps: 6, load: "61/43 kg", distanceMeters: null, calories: null, durationSeconds: null, notes: null },
            { movement: "Box Jump Over", reps: 9, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
          ],
        },
      ],
    });
    expect(workout.blocks).toHaveLength(2);
    expect(workout.blocks[1].format).toBe("amrap");
    expect(workout.blocks[0].coachingNotes).toContain("pausas");
  });

  it("parses a stimulus classification with valid tags", () => {
    const c = StimulusClassificationSchema.parse({
      primary: "anaerobic_capacity", secondary: ["muscular_endurance"], rationale: "Short, intense couplet.",
    });
    expect(StimulusTag.options).toContain(c.primary);
  });

  it("parses a tailored workout", () => {
    const t = TailoringResultSchema.parse({
      workout: {
        name: "Fran (mod)", rawText: "21-15-9 for time\nGoblet Squat 35 lb\nRing Rows", source: "adhoc",
        blocks: [{
          title: "Fran (mod)", rawText: "21-15-9 for time\nGoblet Squat 35 lb\nRing Rows",
          format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
          components: [{ movement: "Goblet Squat", reps: "21-15-9", load: "35 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null }],
        }],
      },
      changes: [{ original: "Thruster 95 lb", modified: "Goblet Squat 35 lb", reason: "Avoid overhead due to shoulder." }],
      rationale: "Preserves the short anaerobic couplet stimulus.",
      safetyNote: "Stop if pain increases.",
    });
    expect(t.changes[0].reason).toContain("shoulder");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/engine/types.ts`**

```ts
import { z } from "zod";

// Must mirror data/stimulus-taxonomy.json keys — enforced by the sync test above.
// (Kept as a literal z.enum rather than derived from the JSON so the tags stay
// compile-time literal types.)
export const StimulusTag = z.enum([
  "aerobic_capacity", "anaerobic_capacity", "heavy_strength",
  "muscular_endurance", "gymnastics_skill", "olympic_lifting", "mixed_modal",
]);
export type StimulusTag = z.infer<typeof StimulusTag>;

export const BlockFormat = z.enum([
  "amrap", "for_time", "emom", "intervals", "strength", "skill", "partner", "rest", "other",
]);
export type BlockFormat = z.infer<typeof BlockFormat>;

export const WorkoutComponentSchema = z.object({
  movement: z.string().min(1),                          // canonical name, resolvable to Movement library
  reps: z.union([z.number(), z.string()]).nullable(),   // 21, "21-15-9", "AMRAP", ...
  load: z.string().nullable(),                          // raw string incl. tiers e.g. "61/43 kg"
  distanceMeters: z.number().nullable(),
  calories: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  notes: z.string().nullable(),
});
export type WorkoutComponent = z.infer<typeof WorkoutComponentSchema>;

// One training block within a session (a day can hold several with different formats).
export const WorkoutBlockSchema = z.object({
  title: z.string().nullable(),
  rawText: z.string().min(1),                           // verbatim slice — source of truth for this block
  format: BlockFormat,
  scheme: z.string().nullable(),                        // e.g. "AMRAP 10 min", "21-15-9 for time", "8 sets every 2 min"
  timeDomainMinutes: z.number().nullable(),
  components: z.array(WorkoutComponentSchema),              // extracted movements (may be empty for rest/unparseable blocks)
  coachingNotes: z.string().nullable(),                 // intensity/tempo/scaling tiers kept as prose, not modeled into columns
});
export type WorkoutBlock = z.infer<typeof WorkoutBlockSchema>;

// A training SESSION (one day). Raw text is the durable source of truth; the rest is a derived extraction.
export const StructuredWorkoutSchema = z.object({
  name: z.string().nullable(),
  rawText: z.string().min(1),                           // verbatim paste of the whole session
  blocks: z.array(WorkoutBlockSchema).min(1),
  source: z.literal("adhoc"),
});
export type StructuredWorkout = z.infer<typeof StructuredWorkoutSchema>;

export const StimulusClassificationSchema = z.object({
  primary: StimulusTag,
  secondary: z.array(StimulusTag),
  rationale: z.string().min(1),
});
export type StimulusClassification = z.infer<typeof StimulusClassificationSchema>;

export const ChangeItemSchema = z.object({
  original: z.string().min(1),
  modified: z.string().min(1),
  reason: z.string().min(1),
});
export type ChangeItem = z.infer<typeof ChangeItemSchema>;

export const TailoringResultSchema = z.object({
  workout: StructuredWorkoutSchema,
  changes: z.array(ChangeItemSchema),
  rationale: z.string().min(1),
  safetyNote: z.string().nullable(),
});
export type TailoringResult = z.infer<typeof TailoringResultSchema>;

// Athlete profile (mirrors AthleteProfile JSON columns)
export const AvailabilitySchema = z.object({
  hoursPerDay: z.number().nullable().optional(),
  daysPerWeek: z.number().nullable().optional(),
  days: z.array(z.string()).optional(),
});
export const AthleteProfileSchema = z.object({
  injuries: z.array(z.string()),
  benchmarks: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  equipment: z.array(z.string()),
  goals: z.array(z.string()),
  availability: AvailabilitySchema,
});
export type AthleteProfileInput = z.infer<typeof AthleteProfileSchema>;

// Today's request
export const ConstraintType = z.enum(["injury", "time", "missed_days", "movement_goal", "none"]);
export const TailorRequestSchema = z.object({
  constraintType: ConstraintType,
  details: z.string(),                       // free text the athlete adds
  timeCapMinutes: z.number().nullable().optional(),
  targetMovement: z.string().nullable().optional(),
});
export type TailorRequest = z.infer<typeof TailorRequestSchema>;
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: engine types and Zod schemas (workout, stimulus, tailored, profile, request)"
```

### Task 3.2: The `LlmProvider` interface + fake provider

**Files:**
- Create: `src/lib/ai/provider.ts`, `src/lib/ai/fake-provider.ts`
- Test: `tests/ai/fake-provider.test.ts`

- [ ] **Step 1: Implement `src/lib/ai/provider.ts`** (interface first — no test needed for a type-only file)

```ts
import type { z } from "zod";

export interface GenerateStructuredArgs<T> {
  systemPrompt?: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string; // used by providers that need a named response schema
}

export interface LlmProvider {
  /** Send prompt to the model and return a value validated against `schema`. */
  generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T>;
}
```

- [ ] **Step 2: Write the failing test for the fake provider**

`tests/ai/fake-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FakeProvider } from "@/lib/ai/fake-provider";

describe("FakeProvider", () => {
  it("returns the scripted value for a matching schemaName", async () => {
    const schema = z.object({ ok: z.boolean() });
    const provider = new FakeProvider({ Demo: { ok: true } });
    const result = await provider.generateStructured({ prompt: "x", schema, schemaName: "Demo" });
    expect(result.ok).toBe(true);
  });

  it("validates the scripted value against the schema", async () => {
    const schema = z.object({ ok: z.boolean() });
    const provider = new FakeProvider({ Demo: { ok: "nope" } as unknown as { ok: boolean } });
    await expect(provider.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow();
  });

  it("throws when no script exists for the schemaName", async () => {
    const provider = new FakeProvider({});
    await expect(
      provider.generateStructured({ prompt: "x", schema: z.object({}), schemaName: "Missing" })
    ).rejects.toThrow(/no scripted response/i);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `pnpm exec vitest run tests/ai/fake-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/ai/fake-provider.ts`**

```ts
import type { LlmProvider, GenerateStructuredArgs } from "@/lib/ai/provider";

/** Test double. Maps `schemaName` -> a canned response object, validated against the schema. */
export class FakeProvider implements LlmProvider {
  constructor(private readonly scripts: Record<string, unknown>) {}

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    if (!(args.schemaName in this.scripts)) {
      throw new Error(`FakeProvider: no scripted response for "${args.schemaName}"`);
    }
    return args.schema.parse(this.scripts[args.schemaName]);
  }
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `pnpm exec vitest run tests/ai/fake-provider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: LlmProvider interface and FakeProvider test double"
```

### Task 3.3: Gemini adapter + provider factory

**Files:**
- Create: `src/lib/ai/gemini-provider.ts`, `src/lib/ai/index.ts`
- Test: `tests/ai/gemini-provider.test.ts` (integration, skipped without key)

- [ ] **Step 1: Install the Gemini SDK**

```bash
pnpm add @google/genai
```

No schema-converter dependency: Zod 4 converts natively via `z.toJSONSchema()`. (Do **not** add `zod-to-json-schema` — it targets Zod 3.)

- [ ] **Step 2: Implement `src/lib/ai/gemini-provider.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { LlmProvider, GenerateStructuredArgs } from "@/lib/ai/provider";

export class GeminiProvider implements LlmProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    const jsonSchema = z.toJSONSchema(args.schema);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        systemInstruction: args.systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    });
    const text = response.text;
    if (!text) throw new Error("GeminiProvider: empty response");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`GeminiProvider: response was not valid JSON: ${text.slice(0, 200)}`);
    }
    return args.schema.parse(parsed);
  }
}
```

> `responseJsonSchema` accepts standard JSON Schema (what `z.toJSONSchema` emits), unlike the older `responseSchema` field which wants the OpenAPI subset. If the Gemini validator still rejects a given shape (e.g., an exotic union), the fallback is to drop `responseJsonSchema` and instead append the JSON shape description to the prompt while keeping `responseMimeType: "application/json"`; the `args.schema.parse(parsed)` call still guarantees correctness either way.

- [ ] **Step 3: Implement `src/lib/ai/index.ts` (factory)**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { GeminiProvider } from "@/lib/ai/gemini-provider";

export function getProvider(): LlmProvider {
  const which = process.env.AI_PROVIDER ?? "gemini";
  switch (which) {
    case "gemini": {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");
      return new GeminiProvider(key, process.env.GEMINI_MODEL ?? "gemini-flash-latest");
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${which}`);
  }
}
```

- [ ] **Step 4: Write an integration test that skips without a key**

`tests/ai/gemini-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "@/lib/ai/gemini-provider";

const key = process.env.GEMINI_API_KEY;
const maybe = key ? describe : describe.skip;

maybe("GeminiProvider (integration)", () => {
  it("returns schema-valid structured output", async () => {
    const provider = new GeminiProvider(key!, process.env.GEMINI_MODEL ?? "gemini-flash-latest");
    const schema = z.object({ capital: z.string() });
    const result = await provider.generateStructured({
      prompt: "What is the capital of France? Respond as JSON {\"capital\": string}.",
      schema, schemaName: "CapitalAnswer",
    });
    expect(result.capital.toLowerCase()).toContain("paris");
  }, 30000);
});
```

- [ ] **Step 5: Run it**

Run: `pnpm exec vitest run tests/ai/gemini-provider.test.ts`
Expected: SKIPPED if `GEMINI_API_KEY` unset; PASS if set.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Gemini provider adapter and provider factory"
```

---

## Phase 4 — Engine pipeline

### Task 4.1: `parseWorkout`

**Files:**
- Create: `src/lib/engine/parse-workout.ts`
- Test: `tests/engine/parse-workout.test.ts`

- [ ] **Step 1: Write the failing test (uses FakeProvider)**

`tests/engine/parse-workout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseWorkout } from "@/lib/engine/parse-workout";
import { FakeProvider } from "@/lib/ai/fake-provider";
import type { LlmProvider } from "@/lib/ai/provider";

describe("parseWorkout", () => {
  it("parses raw text into a StructuredWorkout via the provider", async () => {
    const provider = new FakeProvider({
      StructuredWorkout: {
        name: "Fran", rawText: "21-15-9 Thrusters 95lb / Pull-ups", source: "adhoc",
        blocks: [{
          title: "Fran", rawText: "21-15-9 Thrusters 95lb / Pull-ups",
          format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 5, coachingNotes: null,
          components: [
            { movement: "Thruster", reps: "21-15-9", load: "95 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null },
            { movement: "Pull-up", reps: "21-15-9", load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
          ],
        }],
      },
    });
    const workout = await parseWorkout(provider, "21-15-9 Thrusters 95lb / Pull-ups");
    expect(workout.name).toBe("Fran");
    expect(workout.blocks[0].components[0].movement).toBe("Thruster");
  });

  it("degrades gracefully to a single raw block when the provider fails", async () => {
    const failing: LlmProvider = {
      async generateStructured() { throw new Error("model returned garbage"); },
    };
    const workout = await parseWorkout(failing, "some cryptic programming");
    expect(workout.rawText).toBe("some cryptic programming");
    expect(workout.blocks).toHaveLength(1);
    expect(workout.blocks[0].format).toBe("other");
    expect(workout.blocks[0].rawText).toBe("some cryptic programming");
    expect(workout.blocks[0].components).toEqual([]);
  });

  it("enforces verbatim rawText: session rawText is the input, paraphrased block slices fall back to it", async () => {
    const provider = new FakeProvider({
      StructuredWorkout: {
        name: null, rawText: "The model paraphrased this", source: "adhoc",
        blocks: [{
          title: null, rawText: "a paraphrase, not a slice",
          format: "amrap", scheme: "AMRAP 10", timeDomainMinutes: 10, coachingNotes: null, components: [],
        }],
      },
    });
    const workout = await parseWorkout(provider, "AMRAP 10 min\n10 Burpees");
    expect(workout.rawText).toBe("AMRAP 10 min\n10 Burpees");           // session rawText forced to input
    expect(workout.blocks[0].rawText).toBe("AMRAP 10 min\n10 Burpees"); // non-slice block falls back to session text
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/parse-workout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/engine/parse-workout.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { StructuredWorkoutSchema, type StructuredWorkout } from "@/lib/engine/types";

const SYSTEM = `You convert a raw functional-fitness training session into structured JSON.
A session often contains SEVERAL blocks with different formats (e.g., a strength piece, a conditioning
AMRAP, a partner WOD). Rules:
- Preserve the athlete's text VERBATIM: set the session "rawText" to the full input, and each block
  "rawText" to that block's exact slice. Never paraphrase rawText.
- Split the session into ordered "blocks". For each block set a "format"
  (amrap | for_time | emom | intervals | strength | skill | partner | rest | other), a "scheme" string
  if present, and an estimated "timeDomainMinutes".
- Extract "components" (movements with reps/load/distance/calories/duration) using canonical movement
  names (e.g., "Thruster", "Pull-up", "Row (Erg)"). Leave "components" empty for a block with no discrete
  movements (e.g., a rest block).
- Put intensity cues, tempo/pause prescriptions, and scaling tiers (Rx+/Rx/Int, M/F loads) into
  "coachingNotes" as prose — do NOT discard them. Use null for any field that does not apply.
Set "source" to "adhoc".`;

/** Spec: a parse failure degrades gracefully — the raw text is still a usable workout. */
function fallbackWorkout(rawText: string): StructuredWorkout {
  return {
    name: null,
    rawText,
    source: "adhoc",
    blocks: [{
      title: null, rawText, format: "other", scheme: null,
      timeDomainMinutes: null, components: [], coachingNotes: null,
    }],
  };
}

export async function parseWorkout(provider: LlmProvider, rawText: string): Promise<StructuredWorkout> {
  let parsed: StructuredWorkout;
  try {
    parsed = await provider.generateStructured({
      systemPrompt: SYSTEM,
      prompt: `Raw workout:\n"""\n${rawText}\n"""\nReturn the structured workout as JSON.`,
      schema: StructuredWorkoutSchema,
      schemaName: "StructuredWorkout",
    });
  } catch {
    return fallbackWorkout(rawText);
  }
  // Enforce the verbatim invariant: the model is *asked* to copy text exactly, but
  // models paraphrase. The session rawText is always the athlete's input; any block
  // "slice" that is not actually a substring falls back to the full session text.
  return {
    ...parsed,
    rawText,
    blocks: parsed.blocks.map((b) =>
      rawText.includes(b.rawText) ? b : { ...b, rawText }
    ),
  };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/parse-workout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: engine parseWorkout with graceful fallback and verbatim rawText guard"
```

### Task 4.2: `classifyStimulus`

**Files:**
- Create: `src/lib/engine/classify-stimulus.ts`
- Test: `tests/engine/classify-stimulus.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/classify-stimulus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyStimulus } from "@/lib/engine/classify-stimulus";
import { FakeProvider } from "@/lib/ai/fake-provider";
import type { StructuredWorkout } from "@/lib/engine/types";

const fran: StructuredWorkout = {
  name: "Fran", rawText: "21-15-9 for time\nThrusters 95 lb\nPull-ups", source: "adhoc",
  blocks: [{
    title: "Fran", rawText: "21-15-9 for time\nThrusters 95 lb\nPull-ups",
    format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 5, coachingNotes: null,
    components: [
      { movement: "Thruster", reps: "21-15-9", load: "95 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null },
      { movement: "Pull-up", reps: "21-15-9", load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
    ],
  }],
};

describe("classifyStimulus", () => {
  it("returns a classification with primary and secondary tags", async () => {
    const provider = new FakeProvider({
      StimulusClassification: { primary: "anaerobic_capacity", secondary: ["muscular_endurance"], rationale: "Short, intense couplet." },
    });
    const c = await classifyStimulus(provider, fran, [
      { key: "anaerobic_capacity", label: "Anaerobic capacity", description: "..." },
    ]);
    expect(c.primary).toBe("anaerobic_capacity");
    expect(c.secondary).toContain("muscular_endurance");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/classify-stimulus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/engine/classify-stimulus.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { StimulusClassificationSchema, type StimulusClassification, type StructuredWorkout } from "@/lib/engine/types";
import type { StimulusDef } from "@/lib/domain/types";

const SYSTEM = `You classify a functional fitness workout by its primary training stimulus, choosing from the provided taxonomy keys only.
Pick exactly one "primary" key and zero or more "secondary" keys. Explain briefly in "rationale".`;

export async function classifyStimulus(
  provider: LlmProvider,
  workout: StructuredWorkout,
  taxonomy: StimulusDef[],
): Promise<StimulusClassification> {
  const taxonomyText = taxonomy.map((t) => `- ${t.key}: ${t.label} — ${t.description}`).join("\n");
  return provider.generateStructured({
    systemPrompt: SYSTEM,
    prompt: `Taxonomy:\n${taxonomyText}\n\nWorkout JSON:\n${JSON.stringify(workout)}\n\nReturn the classification as JSON. Use only keys from the taxonomy.`,
    schema: StimulusClassificationSchema,
    schemaName: "StimulusClassification",
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/classify-stimulus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: engine classifyStimulus (workout -> stimulus classification)"
```

### Task 4.3: `tailor`

**Files:**
- Create: `src/lib/engine/tailor.ts`
- Test: `tests/engine/tailor.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/tailor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tailor } from "@/lib/engine/tailor";
import { FakeProvider } from "@/lib/ai/fake-provider";
import type { StructuredWorkout, StimulusClassification, AthleteProfileInput, TailorRequest } from "@/lib/engine/types";
import type { Movement, InjuryContraindication } from "@/lib/domain/types";

const fran: StructuredWorkout = {
  name: "Fran", rawText: "21-15-9 for time\nThrusters 95 lb\nPull-ups", source: "adhoc",
  blocks: [{
    title: "Fran", rawText: "21-15-9 for time\nThrusters 95 lb\nPull-ups",
    format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 5, coachingNotes: null,
    components: [
      { movement: "Thruster", reps: "21-15-9", load: "95 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null },
      { movement: "Pull-up", reps: "21-15-9", load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
    ],
  }],
};
const classification: StimulusClassification = { primary: "anaerobic_capacity", secondary: ["muscular_endurance"], rationale: "Short couplet." };
const profile: AthleteProfileInput = {
  injuries: ["shoulder_impingement"], benchmarks: {}, equipment: ["dumbbell"], goals: [], availability: {},
};
const request: TailorRequest = { constraintType: "injury", details: "Sore right shoulder, no overhead.", timeCapMinutes: null, targetMovement: null };

describe("tailor", () => {
  it("returns a tailored workout with changes and rationale", async () => {
    const provider = new FakeProvider({
      TailoringResult: {
        workout: { name: "Fran (mod)", rawText: "21-15-9 for time\nGoblet Squat 35 lb\nRing Rows", source: "adhoc",
          blocks: [{
            title: "Fran (mod)", rawText: "21-15-9 for time\nGoblet Squat 35 lb\nRing Rows",
            format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
            components: [
              { movement: "Goblet Squat", reps: "21-15-9", load: "35 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null },
              { movement: "Ring Row", reps: "21-15-9", load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
            ],
          }] },
        changes: [
          { original: "Thruster 95 lb", modified: "Goblet Squat 35 lb", reason: "Removes overhead pressing for shoulder impingement." },
          { original: "Pull-up", modified: "Ring Row", reason: "Lower shoulder demand while keeping pulling volume." },
        ],
        rationale: "Keeps the short, intense couplet stimulus while removing overhead load.",
        safetyNote: "Stop if shoulder pain increases.",
      },
    });
    const movements: Movement[] = [];
    const contraindications: InjuryContraindication[] = [
      { injuryKey: "shoulder_impingement", label: "Shoulder impingement", avoidStresses: [{ site: "shoulder", mechanisms: ["overhead"] }], avoidPositions: [], avoidMovements: ["Thruster"], notes: null },
    ];
    const result = await tailor(provider, { workout: fran, classification, profile, request, movements, contraindications });
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.workout.blocks[0].components[0].movement).toBe("Goblet Squat");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/tailor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/engine/tailor.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import {
  TailoringResultSchema, type TailoringResult, type StructuredWorkout,
  type StimulusClassification, type AthleteProfileInput, type TailorRequest,
} from "@/lib/engine/types";
import type { Movement, InjuryContraindication } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/matching";

export interface TailorInput {
  workout: StructuredWorkout;
  classification: StimulusClassification;
  profile: AthleteProfileInput;
  request: TailorRequest;
  movements: Movement[];
  contraindications: InjuryContraindication[];
}

const SYSTEM = `You are an expert functional fitness coach. Modify the given training session for one athlete so it fits their
constraint WHILE PRESERVING THE PRIMARY TRAINING STIMULUS identified in the classification. Rules:
- Keep the session's BLOCK structure: return the same ordered blocks, preserving each block's intended format unless a
  block must be dropped (explain any dropped block in "changes"). Modify within blocks.
- Respect every contraindication: never prescribe a movement from the AVOID list, one that requires an avoided body position, or one whose stresses match an avoided site+mechanism rule.
- Prefer substitutions from the provided movement library; keep the same stimulus (time domain, intensity, modality balance).
- Scale loads to the athlete's benchmarks and equipment; fit the athlete's time budget if provided.
- Carry over each block's coachingNotes (tempo, intensity, scaling tiers); update them only where the change requires it.
- If a movement-improvement goal is requested, bias the modification toward that movement without breaking the stimulus.
- Be conservative with injuries: when unsure, choose the lower-risk option and add a safetyNote.
- For the modified "workout", set the session and per-block "rawText" to a clean text rendering of the MODIFIED workout.
Return JSON with: the modified "workout", a "changes" list (original/modified/reason per change), a "rationale" explaining how the
stimulus is preserved, and a "safetyNote" (or null).`;

export async function tailor(provider: LlmProvider, input: TailorInput): Promise<TailoringResult> {
  // Deterministic pre-filter: derive the blocked list with matchesContraindication,
  // then also hand the LLM the raw site+mechanism rules so it generalizes to
  // movements outside the library.
  const avoid = [...new Set([
    ...input.movements
      .filter((m) => input.contraindications.some((c) => matchesContraindication(m, c)))
      .map((m) => m.name),
    ...input.contraindications.flatMap((c) => c.avoidMovements),
  ])];
  const avoidStresses = input.contraindications.flatMap((c) =>
    c.avoidStresses.map((r) => `${r.site}: ${r.mechanisms.join("/")}`)
  );
  const avoidPositions = [...new Set(input.contraindications.flatMap((c) => c.avoidPositions))];
  const library = input.movements.map((m) => `${m.name} [${m.patterns.join("+")}, ${m.skill}, equip: ${m.equipment.join("+") || "none"}, stress: ${m.stresses.map((s) => `${s.site}(${s.mechanisms.join(",")})`).join(" ") || "none"}, subs: ${m.substitutes.join(", ") || "none"}]`).join("\n");

  const prompt = [
    `Original workout JSON:\n${JSON.stringify(input.workout)}`,
    `Stimulus classification:\n${JSON.stringify(input.classification)}`,
    `Athlete profile:\n${JSON.stringify(input.profile)}`,
    `Today's request:\n${JSON.stringify(input.request)}`,
    `Movements to AVOID: ${avoid.join(", ") || "none"}`,
    `Site stresses to AVOID: ${avoidStresses.join("; ") || "none"}`,
    `Body positions to AVOID: ${avoidPositions.join(", ") || "none"}`,
    `Movement library:\n${library || "(none provided)"}`,
    `Return the tailored result as JSON.`,
  ].join("\n\n");

  return provider.generateStructured({
    systemPrompt: SYSTEM,
    prompt,
    schema: TailoringResultSchema,
    schemaName: "TailoringResult",
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/tailor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: engine tailor (stimulus-preserving, contraindication-aware modification)"
```

### Task 4.4: `pipeline` orchestration

**Files:**
- Create: `src/lib/engine/pipeline.ts`
- Test: `tests/engine/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { FakeProvider } from "@/lib/ai/fake-provider";
import type { AthleteProfileInput, TailorRequest } from "@/lib/engine/types";
import type { Movement, InjuryContraindication, StimulusDef } from "@/lib/domain/types";

const profile: AthleteProfileInput = { injuries: [], benchmarks: {}, equipment: [], goals: [], availability: {} };
const request: TailorRequest = { constraintType: "time", details: "Only 20 minutes.", timeCapMinutes: 20, targetMovement: null };

const taxonomy: StimulusDef[] = [{ key: "anaerobic_capacity", label: "Anaerobic capacity", description: "..." }];
const movements: Movement[] = [];
const contraindications: InjuryContraindication[] = [];

describe("runTailorPipeline (from raw text)", () => {
  it("parses, classifies, and tailors using the provider", async () => {
    const provider = new FakeProvider({
      StructuredWorkout: { name: "Fran", rawText: "21-15-9 Thrusters / Pull-ups", source: "adhoc",
        blocks: [{ title: "Fran", rawText: "21-15-9 Thrusters / Pull-ups", format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 5, coachingNotes: null,
          components: [{ movement: "Thruster", reps: "21-15-9", load: "95 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] },
      StimulusClassification: { primary: "anaerobic_capacity", secondary: [], rationale: "Short." },
      TailoringResult: { workout: { name: "Fran (mod)", rawText: "15-12-9 Thrusters 75 lb", source: "adhoc",
          blocks: [{ title: "Fran (mod)", rawText: "15-12-9 Thrusters 75 lb", format: "for_time", scheme: "15-12-9 for time", timeDomainMinutes: 4, coachingNotes: null,
            components: [{ movement: "Thruster", reps: "15-12-9", load: "75 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] },
        changes: [{ original: "21-15-9", modified: "15-12-9", reason: "Fit 20-minute cap." }],
        rationale: "Condensed but same anaerobic stimulus.", safetyNote: null },
    });

    const result = await runTailorPipeline(provider, {
      input: { kind: "raw", rawText: "21-15-9 Thrusters / Pull-ups" },
      profile, request, taxonomy, movements, contraindications,
    });

    expect(result.original.name).toBe("Fran");
    expect(result.classification.primary).toBe("anaerobic_capacity");
    expect(result.tailored.changes[0].reason).toContain("cap");
  });

  it("accepts an already-structured workout and skips parsing", async () => {
    const provider = new FakeProvider({
      StimulusClassification: { primary: "anaerobic_capacity", secondary: [], rationale: "Short." },
      TailoringResult: { workout: { name: "Manual", rawText: "AMRAP 10\n10 Burpees", source: "adhoc",
          blocks: [{ title: "Manual", rawText: "AMRAP 10\n10 Burpees", format: "amrap", scheme: "AMRAP 10", timeDomainMinutes: 10, coachingNotes: null,
            components: [{ movement: "Burpee", reps: 10, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] },
        changes: [], rationale: "No change needed.", safetyNote: null },
    });
    const result = await runTailorPipeline(provider, {
      input: { kind: "structured", workout: { name: "Manual", rawText: "AMRAP 10\n10 Burpees", source: "adhoc",
        blocks: [{ title: "Manual", rawText: "AMRAP 10\n10 Burpees", format: "amrap", scheme: "AMRAP 10", timeDomainMinutes: 10, coachingNotes: null,
          components: [{ movement: "Burpee", reps: 10, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] } },
      profile, request: { constraintType: "none", details: "", timeCapMinutes: null, targetMovement: null },
      taxonomy, movements, contraindications,
    });
    expect(result.original.name).toBe("Manual");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/pipeline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/engine/pipeline.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { parseWorkout } from "@/lib/engine/parse-workout";
import { classifyStimulus } from "@/lib/engine/classify-stimulus";
import { tailor } from "@/lib/engine/tailor";
import type {
  StructuredWorkout, StimulusClassification, TailoringResult, AthleteProfileInput, TailorRequest,
} from "@/lib/engine/types";
import type { Movement, InjuryContraindication, StimulusDef } from "@/lib/domain/types";

export type WorkoutInput =
  | { kind: "raw"; rawText: string }
  | { kind: "structured"; workout: StructuredWorkout };

export interface PipelineArgs {
  input: WorkoutInput;
  profile: AthleteProfileInput;
  request: TailorRequest;
  taxonomy: StimulusDef[];
  movements: Movement[];
  contraindications: InjuryContraindication[];
}

export interface PipelineResult {
  original: StructuredWorkout;
  classification: StimulusClassification;
  tailored: TailoringResult;
}

export async function runTailorPipeline(provider: LlmProvider, args: PipelineArgs): Promise<PipelineResult> {
  const original = args.input.kind === "raw"
    ? await parseWorkout(provider, args.input.rawText)
    : args.input.workout;

  const classification = await classifyStimulus(provider, original, args.taxonomy);

  const tailored = await tailor(provider, {
    workout: original,
    classification,
    profile: args.profile,
    request: args.request,
    movements: args.movements,
    contraindications: args.contraindications,
  });

  return { original, classification, tailored };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/pipeline.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: all suites pass — no DB or API key needed (the Gemini integration test skips without a key).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tailor pipeline orchestration (parse -> classify -> tailor)"
```

### Task 4.5: Refine support in `tailor` (previous attempt + athlete feedback)

The spec's refine loop ("still hurts", "too easy", "no rower today") is a re-run of the **tailor step only** — no re-parse, no re-classify. `tailor()` gains an optional `previousAttempt` describing the rejected modification and the athlete's feedback, which is appended to the prompt. The HTTP endpoint and UI come in Task 6.6.

**Files:**
- Modify: `src/lib/engine/tailor.ts`
- Test: `tests/engine/tailor.test.ts` (extend)

**Interfaces:**
- Consumes: `TailorInput`, `tailor()` from Task 4.3.
- Produces: `TailorInput.previousAttempt?: { workout: StructuredWorkout; feedback: string } | null` — used by `runRefineForAthlete` (Task 6.6).

- [ ] **Step 1: Write the failing test** (append to `tests/engine/tailor.test.ts`)

The `FakeProvider` can't inspect prompts, so this test uses a small capturing provider inline:

```ts
import type { LlmProvider, GenerateStructuredArgs } from "@/lib/ai/provider";

class CapturingProvider implements LlmProvider {
  lastArgs: GenerateStructuredArgs<unknown> | null = null;
  constructor(private readonly value: unknown) {}
  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    this.lastArgs = args as GenerateStructuredArgs<unknown>;
    return args.schema.parse(this.value);
  }
}

describe("tailor with previousAttempt (refine)", () => {
  it("includes the rejected workout and the athlete feedback in the prompt", async () => {
    const scripted = {
      workout: { name: "Fran (mod 2)", rawText: "21-15-9 for time\nGoblet Squat 25 lb\nRing Rows", source: "adhoc",
        blocks: [{ title: "Fran (mod 2)", rawText: "21-15-9 for time\nGoblet Squat 25 lb\nRing Rows",
          format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
          components: [{ movement: "Goblet Squat", reps: "21-15-9", load: "25 lb", distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] },
      changes: [{ original: "Goblet Squat 35 lb", modified: "Goblet Squat 25 lb", reason: "Lower load after feedback." }],
      rationale: "Same stimulus at a load that does not aggravate the shoulder.",
      safetyNote: "Stop if pain persists.",
    };
    const provider = new CapturingProvider(scripted);
    const previousWorkout = { ...fran, name: "Fran (mod)" };

    const result = await tailor(provider, {
      workout: fran, classification, profile, request, movements: [], contraindications: [],
      previousAttempt: { workout: previousWorkout, feedback: "Still hurts my shoulder at 35 lb." },
    });

    expect(result.changes[0].reason).toContain("feedback");
    expect(provider.lastArgs?.prompt).toContain("PREVIOUS attempt");
    expect(provider.lastArgs?.prompt).toContain("Still hurts my shoulder at 35 lb.");
    expect(provider.lastArgs?.prompt).toContain("Fran (mod)");
  });

  it("omits the refine section when previousAttempt is absent", async () => {
    const provider = new CapturingProvider({
      workout: fran, changes: [], rationale: "No change needed.", safetyNote: null,
    });
    await tailor(provider, { workout: fran, classification, profile, request, movements: [], contraindications: [] });
    expect(provider.lastArgs?.prompt).not.toContain("PREVIOUS attempt");
  });
});
```

(`fran`, `classification`, `profile`, `request` are the fixtures already defined at the top of this test file in Task 4.3.)

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/tailor.test.ts`
Expected: FAIL — `previousAttempt` is not a known property / prompt does not contain the refine section.

- [ ] **Step 3: Extend `src/lib/engine/tailor.ts`**

Add to `TailorInput`:

```ts
export interface TailorInput {
  workout: StructuredWorkout;
  classification: StimulusClassification;
  profile: AthleteProfileInput;
  request: TailorRequest;
  movements: Movement[];
  contraindications: InjuryContraindication[];
  /** Refine loop: the modification the athlete rejected, plus their feedback on it. */
  previousAttempt?: { workout: StructuredWorkout; feedback: string } | null;
}
```

In `tailor()`, build the prompt parts array as before, and append the refine section before the final line:

```ts
  const parts = [
    `Original workout JSON:\n${JSON.stringify(input.workout)}`,
    `Stimulus classification:\n${JSON.stringify(input.classification)}`,
    `Athlete profile:\n${JSON.stringify(input.profile)}`,
    `Today's request:\n${JSON.stringify(input.request)}`,
    `Movements to AVOID: ${avoid.join(", ") || "none"}`,
    `Site stresses to AVOID: ${avoidStresses.join("; ") || "none"}`,
    `Body positions to AVOID: ${avoidPositions.join(", ") || "none"}`,
    `Movement library:\n${library || "(none provided)"}`,
  ];
  if (input.previousAttempt) {
    parts.push(
      `PREVIOUS attempt (the athlete rejected this modification):\n${JSON.stringify(input.previousAttempt.workout)}\n\n` +
      `Athlete feedback on it: ${input.previousAttempt.feedback}\n` +
      `Produce a NEW modification of the ORIGINAL workout that addresses this feedback while still following every rule above.`
    );
  }
  parts.push(`Return the tailored result as JSON.`);
  const prompt = parts.join("\n\n");
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/tailor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: refine support in tailor (previous attempt + athlete feedback in prompt)"
```

---

## Phase 5 — Auth (Auth.js v5, magic link)

### Task 5.1: Configure Auth.js with Prisma adapter and dev email

> **No middleware.** Database sessions + the Prisma adapter (and nodemailer) are not Edge-runtime-compatible, so `export { auth as middleware }` would fail at runtime. Route protection lives where it already works: every protected page calls `auth()` and redirects, and every API route returns 401 (Tasks 6.1–6.5). Do not create `src/middleware.ts`.

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/types/next-auth.d.ts`
- Modify: `.env` (`AUTH_SECRET`)

**Interfaces:**
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers` from `@/auth`; `session.user.id: string` (typed via the augmentation) — used by every page and API route in Phase 6.

- [ ] **Step 1: Install Auth.js**

```bash
pnpm add next-auth@beta @auth/prisma-adapter nodemailer
```

- [ ] **Step 2: Generate an auth secret**

```bash
pnpm exec auth secret
```

This writes `AUTH_SECRET` to `.env`. (If the command is unavailable, set `AUTH_SECRET` to any 32+ char random string.)

- [ ] **Step 3: Implement `src/auth.ts`**

```ts
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Nodemailer from "next-auth/providers/nodemailer";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  callbacks: {
    // With database sessions the callback receives the DB user; expose its id so
    // routes can key profile/history queries on session.user.id.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER || { jsonTransport: true },
      from: process.env.EMAIL_FROM,
      // In dev (no SMTP), log the magic link instead of sending email.
      async sendVerificationRequest({ identifier, url }) {
        if (!process.env.EMAIL_SERVER) {
          console.log(`\n[dev magic link] ${identifier}: ${url}\n`);
          return;
        }
        const { createTransport } = await import("nodemailer");
        const transport = createTransport(process.env.EMAIL_SERVER);
        await transport.sendMail({ to: identifier, from: process.env.EMAIL_FROM, subject: "Sign in to Training Tailor", text: `Sign in: ${url}` });
      },
    }),
  ],
  pages: { signIn: "/signin" },
});
```

- [ ] **Step 4: Create the route handler `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 5: Type `session.user.id` — create `src/types/next-auth.d.ts`**

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```

(Ensure `tsconfig.json` `include` covers `src/types` — the create-next-app default `"src/**/*.ts"` pattern does.)

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, visit `http://localhost:3000/signin`, enter an email, submit. Confirm a `[dev magic link]` line appears in the terminal; open that URL and confirm you land authenticated. (Sign-in page UI is built in Task 6.1.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Auth.js v5 magic-link auth with Prisma adapter and dev email logging"
```

---

## Phase 6 — Athlete UI & API

### Task 6.1: App shell, sign-in page, and profile data helpers

**Files:**
- Create: `src/app/signin/page.tsx`, `src/lib/profile.ts`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `tests/profile/profile-helpers.test.ts`

- [ ] **Step 1: Write the failing test for profile normalization**

`tests/profile/profile-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeProfile } from "@/lib/profile";

describe("normalizeProfile", () => {
  it("fills defaults for a brand-new profile", () => {
    const p = normalizeProfile(null);
    expect(p).toEqual({ injuries: [], benchmarks: {}, equipment: [], goals: [], availability: {} });
  });

  it("passes through and validates stored JSON", () => {
    const p = normalizeProfile({
      injuries: ["knee_pain"], benchmarks: { backSquat1RM: 140 }, equipment: ["barbell"],
      goals: ["improve pull-ups"], availability: { hoursPerDay: 1, daysPerWeek: 4, days: ["Mon", "Wed", "Fri", "Sat"] },
    });
    expect(p.injuries).toContain("knee_pain");
    expect(p.availability.daysPerWeek).toBe(4);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/profile/profile-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/profile.ts`**

```ts
import { AthleteProfileSchema, type AthleteProfileInput } from "@/lib/engine/types";

const EMPTY: AthleteProfileInput = { injuries: [], benchmarks: {}, equipment: [], goals: [], availability: {} };

export function normalizeProfile(raw: unknown): AthleteProfileInput {
  if (raw == null) return { ...EMPTY };
  return AthleteProfileSchema.parse(raw);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/profile/profile-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the sign-in page `src/app/signin/page.tsx`**

```tsx
import { signIn } from "@/auth";

export default function SignIn() {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-semibold">Sign in to Training Tailor</h1>
      <form
        action={async (formData) => {
          "use server";
          await signIn("nodemailer", { email: formData.get("email"), redirectTo: "/" });
        }}
        className="flex flex-col gap-3"
      >
        <input name="email" type="email" required placeholder="you@example.com" className="rounded border p-2" />
        <button type="submit" className="rounded bg-black p-2 text-white">Send magic link</button>
      </form>
      <p className="mt-3 text-sm text-gray-500">In dev, the link is printed to the server console.</p>
    </main>
  );
}
```

- [ ] **Step 6: Update `src/app/layout.tsx`** (add a minimal nav + the safety disclaimer footer)

```tsx
import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Training Tailor", description: "Individualized functional fitness workout modifications" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900">
        <header className="flex items-center gap-4 border-b p-4 text-sm">
          <Link href="/" className="font-semibold">Training Tailor</Link>
          <Link href="/tailor">Tailor</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/history">History</Link>
        </header>
        {children}
        <footer className="mt-12 border-t p-4 text-xs text-gray-500">
          Not medical advice. Modifications are AI-generated suggestions — consult a qualified professional for injuries.
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Update `src/app/page.tsx`** (dashboard)

```tsx
import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Training Tailor</h1>
      <p className="mt-2 text-gray-600">Individualize any functional fitness workout to your body, your gear, and your day.</p>
      {session?.user ? (
        <div className="mt-6 flex gap-3">
          <Link href="/tailor" className="rounded bg-black px-4 py-2 text-white">Tailor a workout</Link>
          <Link href="/profile" className="rounded border px-4 py-2">Edit profile</Link>
        </div>
      ) : (
        <Link href="/signin" className="mt-6 inline-block rounded bg-black px-4 py-2 text-white">Sign in</Link>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Manual check + commit**

Run: `pnpm dev`, confirm `/`, `/signin` render and nav links work.

```bash
git add -A
git commit -m "feat: app shell, sign-in page, profile normalization helper, safety disclaimer"
```

### Task 6.2: Profile API + profile form

**Files:**
- Create: `src/app/api/profile/route.ts`, `src/app/profile/page.tsx`, `src/app/profile/ProfileForm.tsx`
- Test: `tests/profile/profile-route.test.ts`

- [ ] **Step 1: Write the failing test for the request-body parser**

We unit-test the body validation used by the route (keeping the route thin). `tests/profile/profile-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseProfileBody } from "@/lib/profile";

describe("parseProfileBody", () => {
  it("accepts a valid profile payload", () => {
    const p = parseProfileBody({ injuries: ["knee_pain"], benchmarks: {}, equipment: ["barbell"], goals: [], availability: { daysPerWeek: 3 } });
    expect(p.equipment).toContain("barbell");
  });
  it("rejects an invalid payload", () => {
    expect(() => parseProfileBody({ injuries: "not-an-array" })).toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/profile/profile-route.test.ts`
Expected: FAIL — `parseProfileBody` not exported.

- [ ] **Step 3: Add `parseProfileBody` to `src/lib/profile.ts`**

Append:

```ts
export function parseProfileBody(body: unknown): AthleteProfileInput {
  return AthleteProfileSchema.parse(body);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/profile/profile-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/app/api/profile/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeProfile, parseProfileBody } from "@/lib/profile";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await prisma.athleteProfile.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json(normalizeProfile(row ? {
    injuries: row.injuries, benchmarks: row.benchmarks, equipment: row.equipment, goals: row.goals, availability: row.availability,
  } : null));
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let data;
  try {
    data = parseProfileBody(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid profile" }, { status: 400 });
  }
  const saved = await prisma.athleteProfile.upsert({
    where: { userId: session.user.id },
    update: { ...data },
    create: { userId: session.user.id, ...data },
  });
  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
}
```

> `session.user.id` is populated by the `session` callback and typed by the augmentation, both set up in Task 5.1.

- [ ] **Step 6: Implement the profile form `src/app/profile/ProfileForm.tsx`** (client component)

```tsx
"use client";
import { useState } from "react";
import type { AthleteProfileInput } from "@/lib/engine/types";

const INJURIES = ["shoulder_impingement","lower_back_strain","knee_pain","wrist_pain","elbow_tendinopathy","ankle_sprain","hip_flexor_strain"];
const EQUIPMENT = ["barbell","dumbbell","kettlebell","pull-up bar","rower","bike","wall ball","jump rope"];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function ProfileForm({ initial }: { initial: AthleteProfileInput }) {
  const [p, setP] = useState<AthleteProfileInput>(initial);
  const [status, setStatus] = useState<string>("");

  function toggle(list: string[], v: string) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

  async function save() {
    setStatus("Saving…");
    const res = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    setStatus(res.ok ? "Saved" : "Error saving");
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-semibold">Injuries / limitations</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {INJURIES.map((i) => (
            <button key={i} type="button" onClick={() => setP({ ...p, injuries: toggle(p.injuries, i) })}
              className={`rounded border px-3 py-1 text-sm ${p.injuries.includes(i) ? "bg-black text-white" : ""}`}>{i.replaceAll("_", " ")}</button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Equipment</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <button key={e} type="button" onClick={() => setP({ ...p, equipment: toggle(p.equipment, e) })}
              className={`rounded border px-3 py-1 text-sm ${p.equipment.includes(e) ? "bg-black text-white" : ""}`}>{e}</button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Availability</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label>Hours/day <input type="number" min={0} step={0.25} value={p.availability.hoursPerDay ?? ""} onChange={(e) => setP({ ...p, availability: { ...p.availability, hoursPerDay: e.target.value ? Number(e.target.value) : null } })} className="w-20 rounded border p-1" /></label>
          <label>Days/week <input type="number" min={0} max={7} value={p.availability.daysPerWeek ?? ""} onChange={(e) => setP({ ...p, availability: { ...p.availability, daysPerWeek: e.target.value ? Number(e.target.value) : null } })} className="w-20 rounded border p-1" /></label>
          <div className="flex gap-1">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => setP({ ...p, availability: { ...p.availability, days: toggle(p.availability.days ?? [], d) } })}
                className={`rounded border px-2 py-1 ${(p.availability.days ?? []).includes(d) ? "bg-black text-white" : ""}`}>{d}</button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Goals (one per line)</h2>
        <textarea className="mt-2 w-full rounded border p-2" rows={3} value={p.goals.join("\n")}
          onChange={(e) => setP({ ...p, goals: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded bg-black px-4 py-2 text-white">Save profile</button>
        <span className="text-sm text-gray-500">{status}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Implement `src/app/profile/page.tsx`** (server component loads profile, renders form)

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeProfile } from "@/lib/profile";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const row = await prisma.athleteProfile.findUnique({ where: { userId: session.user.id } });
  const initial = normalizeProfile(row ? {
    injuries: row.injuries, benchmarks: row.benchmarks, equipment: row.equipment, goals: row.goals, availability: row.availability,
  } : null);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Your profile</h1>
      <ProfileForm initial={initial} />
    </main>
  );
}
```

- [ ] **Step 8: Manual check + commit**

Run: `pnpm dev`, sign in, open `/profile`, toggle items, save, reload — confirm values persist.

```bash
git add -A
git commit -m "feat: profile API and profile form with injuries/equipment/availability/goals"
```

### Task 6.3: Tailor API endpoints (run + save)

> **Save never re-runs the pipeline.** The LLM is nondeterministic — re-running on save would persist a *different* workout than the one the athlete reviewed (and pay for three more LLM calls). So `POST /api/tailor` only runs and returns the result; `POST /api/tailor/save` persists the exact reviewed result the client sends back, validated against the Zod schemas.

**Files:**
- Create: `src/app/api/tailor/route.ts`, `src/app/api/tailor/save/route.ts`, `src/lib/tailor-service.ts`
- Test: `tests/tailor/tailor-service.test.ts`

**Interfaces:**
- Consumes: `runTailorPipeline` (Task 4.4), domain repository (Task 2.3), `auth()` (Task 5.1).
- Produces: `runTailorForAthlete(args: RunTailorArgs): Promise<PipelineResult>`; `POST /api/tailor` → `PipelineResult` JSON; `POST /api/tailor/save` → `{ ok: true, id: string }` — used by `TailorClient` (Task 6.4).

- [ ] **Step 1: Write the failing test (service composes repo + pipeline with an injected provider)**

`tests/tailor/tailor-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runTailorForAthlete } from "@/lib/tailor-service";
import { FakeProvider } from "@/lib/ai/fake-provider";
import type { AthleteProfileInput, TailorRequest } from "@/lib/engine/types";

describe("runTailorForAthlete", () => {
  it("runs the pipeline with injected domain data and provider", async () => {
    const provider = new FakeProvider({
      StructuredWorkout: { name: "Cindy", rawText: "AMRAP 20: 5 pull-ups, 10 push-ups, 15 air squats", source: "adhoc",
        blocks: [{ title: "Cindy", rawText: "AMRAP 20: 5 pull-ups, 10 push-ups, 15 air squats", format: "amrap", scheme: "AMRAP 20", timeDomainMinutes: 20, coachingNotes: null,
          components: [{ movement: "Pull-up", reps: 5, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] },
      StimulusClassification: { primary: "muscular_endurance", secondary: [], rationale: "Bodyweight grind." },
      TailoringResult: { workout: { name: "Cindy (mod)", rawText: "AMRAP 20: 5 ring rows, 10 push-ups, 15 air squats", source: "adhoc",
          blocks: [{ title: "Cindy (mod)", rawText: "AMRAP 20: 5 ring rows, 10 push-ups, 15 air squats", format: "amrap", scheme: "AMRAP 20", timeDomainMinutes: 20, coachingNotes: null,
            components: [{ movement: "Ring Row", reps: 5, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] },
        changes: [{ original: "Pull-up", modified: "Ring Row", reason: "Shoulder-friendly pull." }],
        rationale: "Keeps muscular-endurance stimulus.", safetyNote: null },
    });

    const profile: AthleteProfileInput = { injuries: ["shoulder_impingement"], benchmarks: {}, equipment: [], goals: [], availability: {} };
    const request: TailorRequest = { constraintType: "injury", details: "shoulder", timeCapMinutes: null, targetMovement: null };

    const result = await runTailorForAthlete({
      provider,
      input: { kind: "raw", rawText: "AMRAP 20: 5 pull-ups, 10 push-ups, 15 air squats" },
      profile, request,
      // injected domain data (so the test does not hit the DB)
      domain: {
        taxonomy: [{ key: "muscular_endurance", label: "Muscular endurance", description: "..." }],
        movements: [],
        contraindicationsFor: async () => [
          { injuryKey: "shoulder_impingement", label: "Shoulder impingement", avoidStresses: [{ site: "shoulder", mechanisms: ["overhead", "kipping"] }], avoidPositions: [], avoidMovements: ["Pull-up"], notes: null },
        ],
      },
    });

    expect(result.tailored.changes[0].modified).toBe("Ring Row");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/tailor/tailor-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tailor-service.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { runTailorPipeline, type WorkoutInput, type PipelineResult } from "@/lib/engine/pipeline";
import type { AthleteProfileInput, TailorRequest } from "@/lib/engine/types";
import type { Movement, InjuryContraindication, StimulusDef } from "@/lib/domain/types";
import { getAllMovements, getContraindicationsForInjuries, getStimulusDefs } from "@/lib/domain/repository";

export interface DomainData {
  taxonomy: StimulusDef[];
  movements: Movement[];
  contraindicationsFor: (injuryKeys: string[]) => Promise<InjuryContraindication[]>;
}

export interface RunTailorArgs {
  provider: LlmProvider;
  input: WorkoutInput;
  profile: AthleteProfileInput;
  request: TailorRequest;
  domain?: DomainData; // injectable for tests; defaults to DB-backed
}

async function defaultDomain(): Promise<DomainData> {
  const [taxonomy, movements] = await Promise.all([getStimulusDefs(), getAllMovements()]);
  return { taxonomy, movements, contraindicationsFor: getContraindicationsForInjuries };
}

export async function runTailorForAthlete(args: RunTailorArgs): Promise<PipelineResult> {
  const domain = args.domain ?? (await defaultDomain());
  const contraindications = await domain.contraindicationsFor(args.profile.injuries);
  return runTailorPipeline(args.provider, {
    input: args.input,
    profile: args.profile,
    request: args.request,
    taxonomy: domain.taxonomy,
    movements: domain.movements,
    contraindications,
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/tailor/tailor-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/app/api/tailor/route.ts`** (run only — no persistence)

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/ai";
import { normalizeProfile } from "@/lib/profile";
import { runTailorForAthlete } from "@/lib/tailor-service";
import { StructuredWorkoutSchema, TailorRequestSchema } from "@/lib/engine/types";
import { z } from "zod";

const BodySchema = z.object({
  input: z.union([
    z.object({ kind: z.literal("raw"), rawText: z.string().min(1) }),
    z.object({ kind: z.literal("structured"), workout: StructuredWorkoutSchema }),
  ]),
  request: TailorRequestSchema,
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const row = await prisma.athleteProfile.findUnique({ where: { userId: session.user.id } });
  const profile = normalizeProfile(row ? {
    injuries: row.injuries, benchmarks: row.benchmarks, equipment: row.equipment, goals: row.goals, availability: row.availability,
  } : null);

  try {
    const result = await runTailorForAthlete({ provider: getProvider(), input: body.input, profile, request: body.request });
    return NextResponse.json(result);
  } catch (e) {
    console.error("tailor pipeline failed", e); // never leak exception text to the client
    return NextResponse.json({ error: "engine_failed" }, { status: 502 });
  }
}
```

- [ ] **Step 6: Implement `src/app/api/tailor/save/route.ts`** (persist a reviewed result — no LLM calls)

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  StructuredWorkoutSchema, StimulusClassificationSchema, TailoringResultSchema, TailorRequestSchema,
} from "@/lib/engine/types";
import { z } from "zod";

const SaveBodySchema = z.object({
  original: StructuredWorkoutSchema,
  classification: StimulusClassificationSchema,
  tailored: TailoringResultSchema,
  request: TailorRequestSchema,
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = SaveBodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const saved = await prisma.tailoredWorkout.create({
    data: {
      userId: session.user.id,
      originalWorkout: body.original,
      request: body.request,
      tailoredWorkout: body.tailored.workout,
      changes: body.tailored.changes,
      rationale: body.tailored.rationale,
      safetyNote: body.tailored.safetyNote,
      stimulus: body.classification,
    },
  });

  return NextResponse.json({ ok: true, id: saved.id });
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: tailor service, POST /api/tailor (run) and POST /api/tailor/save (persist)"
```

### Task 6.4: Tailor page (ingest → constraint → result)

**Files:**
- Create: `src/app/tailor/page.tsx`, `src/app/tailor/TailorClient.tsx`, `src/components/WorkoutView.tsx`

- [ ] **Step 1: Implement `src/components/WorkoutView.tsx`** (renders a StructuredWorkout)

```tsx
import type { StructuredWorkout } from "@/lib/engine/types";

export function WorkoutView({ workout, title }: { workout: StructuredWorkout; title: string }) {
  return (
    <div className="rounded border p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="font-semibold">{workout.name ?? "Workout"}</div>
      <div className="mt-2 flex flex-col gap-3">
        {workout.blocks.map((b, bi) => (
          <div key={bi} className="border-l-2 border-gray-200 pl-3">
            {b.title && <div className="text-sm font-medium">{b.title}</div>}
            <div className="text-xs uppercase tracking-wide text-gray-400">
              {b.format.replaceAll("_", " ")}
              {b.scheme ? ` · ${b.scheme}` : ""}
              {b.timeDomainMinutes != null ? ` · ~${b.timeDomainMinutes} min` : ""}
            </div>
            {b.components.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {b.components.map((c, i) => (
                  <li key={i}>
                    {c.reps != null ? `${c.reps} ` : ""}{c.movement}
                    {c.load ? ` @ ${c.load}` : ""}
                    {c.distanceMeters ? ` ${c.distanceMeters} m` : ""}
                    {c.calories ? ` ${c.calories} cal` : ""}
                    {c.durationSeconds ? ` ${c.durationSeconds}s` : ""}
                  </li>
                ))}
              </ul>
            )}
            {b.coachingNotes && <p className="mt-1 text-xs text-gray-600">{b.coachingNotes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/app/tailor/TailorClient.tsx`** (client component)

```tsx
"use client";
import { useState } from "react";
import type { PipelineResult } from "@/lib/engine/pipeline";
import type { TailorRequest } from "@/lib/engine/types";
import { WorkoutView } from "@/components/WorkoutView";

const CONSTRAINTS: { value: TailorRequest["constraintType"]; label: string }[] = [
  { value: "none", label: "No constraint" },
  { value: "injury", label: "Injury / pain" },
  { value: "time", label: "Limited time" },
  { value: "missed_days", label: "Missed days" },
  { value: "movement_goal", label: "Improve a movement" },
];

export default function TailorClient() {
  const [rawText, setRawText] = useState("");
  const [constraintType, setConstraintType] = useState<TailorRequest["constraintType"]>("none");
  const [details, setDetails] = useState("");
  const [timeCap, setTimeCap] = useState<string>("");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PipelineResult | null>(null);
  // The request that produced `result` — sent along on save so history records what was asked.
  const [lastRequest, setLastRequest] = useState<TailorRequest | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function buildRequest(): TailorRequest {
    return {
      constraintType, details,
      timeCapMinutes: constraintType === "time" && timeCap ? Number(timeCap) : null,
      targetMovement: constraintType === "movement_goal" && target ? target : null,
    };
  }

  async function run() {
    setLoading(true); setError(""); setResult(null); setSaveStatus("idle");
    const request = buildRequest();
    const res = await fetch("/api/tailor", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { kind: "raw", rawText }, request }),
    });
    setLoading(false);
    if (!res.ok) { setError("Could not tailor this workout. Try again."); return; }
    setLastRequest(request);
    setResult(await res.json());
  }

  // Persists the EXACT result on screen — no pipeline re-run (the LLM is nondeterministic).
  async function save() {
    if (!result || !lastRequest) return;
    setSaveStatus("saving");
    const res = await fetch("/api/tailor/save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        original: result.original,
        classification: result.classification,
        tailored: result.tailored,
        request: lastRequest,
      }),
    });
    setSaveStatus(res.ok ? "saved" : "error");
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Paste today's workout</span>
        <textarea rows={5} className="rounded border p-2" value={rawText} onChange={(e) => setRawText(e.target.value)}
          placeholder={"e.g.\n21-15-9 for time\nThrusters 95 lb\nPull-ups"} />
      </label>

      <div className="flex flex-col gap-2">
        <span className="font-semibold">What's today's situation?</span>
        <div className="flex flex-wrap gap-2">
          {CONSTRAINTS.map((c) => (
            <button key={c.value} type="button" onClick={() => setConstraintType(c.value)}
              className={`rounded border px-3 py-1 text-sm ${constraintType === c.value ? "bg-black text-white" : ""}`}>{c.label}</button>
          ))}
        </div>
        {constraintType !== "none" && (
          <textarea rows={2} className="rounded border p-2" value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="Add detail (e.g., sore right shoulder, no overhead pressing)" />
        )}
        {constraintType === "time" && (
          <input type="number" min={5} className="w-32 rounded border p-2" value={timeCap} onChange={(e) => setTimeCap(e.target.value)} placeholder="minutes" />
        )}
        {constraintType === "movement_goal" && (
          <input className="rounded border p-2" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="movement to improve (e.g., Toes-to-Bar)" />
        )}
      </div>

      <div className="flex gap-3">
        <button disabled={!rawText || loading} onClick={run} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">
          {loading ? "Tailoring…" : "Tailor it"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <WorkoutView workout={result.original} title="Original" />
            <WorkoutView workout={result.tailored.workout} title="Tailored for you" />
          </div>
          <div className="rounded border p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Stimulus</div>
            <div className="text-sm">{result.classification.primary.replaceAll("_", " ")} — {result.classification.rationale}</div>
          </div>
          <div className="rounded border p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">What changed</div>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {result.tailored.changes.map((c, i) => (<li key={i}><b>{c.original}</b> → <b>{c.modified}</b>: {c.reason}</li>))}
              {result.tailored.changes.length === 0 && <li>No changes — the original already fits.</li>}
            </ul>
            <p className="mt-2 text-sm">{result.tailored.rationale}</p>
            {result.tailored.safetyNote && <p className="mt-2 text-sm text-amber-700">⚠ {result.tailored.safetyNote}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saveStatus === "saving" || saveStatus === "saved"} className="rounded border px-4 py-2 disabled:opacity-40">
              {saveStatus === "saved" ? "Saved ✓" : saveStatus === "saving" ? "Saving…" : "Save to history"}
            </button>
            {saveStatus === "error" && <span className="text-sm text-red-600">Could not save. Try again.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/app/tailor/page.tsx`**

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import TailorClient from "./TailorClient";

export default async function TailorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Tailor a workout</h1>
      <TailorClient />
    </main>
  );
}
```

- [ ] **Step 4: Manual end-to-end check (requires `GEMINI_API_KEY` and a pushed schema — `pnpm db:push`)**

Run: `pnpm dev`, sign in, set a profile (e.g., shoulder_impingement), go to `/tailor`, paste a workout, pick "Injury", tailor it. Confirm original vs tailored render, changes avoid contraindicated movements, and a stimulus + rationale appear.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tailor page with ingest, constraint selection, and result view"
```

### Task 6.5: History page

**Files:**
- Create: `src/app/history/page.tsx`

- [ ] **Step 1: Implement `src/app/history/page.tsx`**

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { WorkoutView } from "@/components/WorkoutView";
import type { StructuredWorkout } from "@/lib/engine/types";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const items = await prisma.tailoredWorkout.findMany({
    where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50,
  });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">History</h1>
      {items.length === 0 && <p className="text-gray-600">No saved workouts yet.</p>}
      <div className="flex flex-col gap-6">
        {items.map((it) => (
          <div key={it.id} className="flex flex-col gap-2">
            <div className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</div>
            <div className="grid gap-4 md:grid-cols-2">
              <WorkoutView workout={it.originalWorkout as unknown as StructuredWorkout} title="Original" />
              <WorkoutView workout={it.tailoredWorkout as unknown as StructuredWorkout} title="Tailored" />
            </div>
            <p className="text-sm">{it.rationale}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Manual check + commit**

Run: `pnpm dev`, save a tailored workout, visit `/history`, confirm it appears.

```bash
git add -A
git commit -m "feat: history page listing saved tailored workouts"
```

### Task 6.6: Refine loop (service + endpoint + UI)

Spec pipeline step 6: the athlete reacts ("still hurts", "too easy", "no rower today") and the engine re-tailors with that feedback. Uses the `previousAttempt` support from Task 4.5 — the refine re-runs **only** the tailor step (one LLM call; no re-parse, no re-classify).

**Files:**
- Create: `src/app/api/tailor/refine/route.ts`
- Modify: `src/lib/tailor-service.ts`, `src/app/tailor/TailorClient.tsx`
- Test: `tests/tailor/tailor-service.test.ts` (extend)

**Interfaces:**
- Consumes: `tailor()` with `previousAttempt` (Task 4.5), `DomainData` (Task 6.3), `PipelineResult` (Task 4.4).
- Produces: `runRefineForAthlete(args: RunRefineArgs): Promise<PipelineResult>`; `POST /api/tailor/refine` → `PipelineResult` JSON.

- [ ] **Step 1: Write the failing test** (append to `tests/tailor/tailor-service.test.ts`)

```ts
import { runRefineForAthlete } from "@/lib/tailor-service";
import type { StructuredWorkout, StimulusClassification } from "@/lib/engine/types";

describe("runRefineForAthlete", () => {
  it("re-tailors with the previous attempt and feedback, keeping the original classification", async () => {
    const original: StructuredWorkout = { name: "Cindy", rawText: "AMRAP 20: 5 pull-ups, 10 push-ups, 15 air squats", source: "adhoc",
      blocks: [{ title: "Cindy", rawText: "AMRAP 20: 5 pull-ups, 10 push-ups, 15 air squats", format: "amrap", scheme: "AMRAP 20", timeDomainMinutes: 20, coachingNotes: null,
        components: [{ movement: "Pull-up", reps: 5, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null }] }] };
    const previousWorkout: StructuredWorkout = { ...original, name: "Cindy (mod)" };
    const classification: StimulusClassification = { primary: "muscular_endurance", secondary: [], rationale: "Bodyweight grind." };

    const provider = new FakeProvider({
      TailoringResult: { workout: { ...original, name: "Cindy (mod 2)" },
        changes: [{ original: "Ring Row", modified: "Bent-over Row", reason: "Rings still bother the shoulder per feedback." }],
        rationale: "Same pulling volume, more support.", safetyNote: null },
    });

    const result = await runRefineForAthlete({
      provider, original, classification, previousWorkout,
      feedback: "Ring rows still hurt.",
      profile: { injuries: ["shoulder_impingement"], benchmarks: {}, equipment: [], goals: [], availability: {} },
      request: { constraintType: "injury", details: "shoulder", timeCapMinutes: null, targetMovement: null },
      domain: {
        taxonomy: [{ key: "muscular_endurance", label: "Muscular endurance", description: "..." }],
        movements: [],
        contraindicationsFor: async () => [],
      },
    });

    expect(result.original.name).toBe("Cindy");
    expect(result.classification.primary).toBe("muscular_endurance"); // not re-classified
    expect(result.tailored.workout.name).toBe("Cindy (mod 2)");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/tailor/tailor-service.test.ts`
Expected: FAIL — `runRefineForAthlete` not exported.

- [ ] **Step 3: Add `runRefineForAthlete` to `src/lib/tailor-service.ts`**

Extend the imports and append:

```ts
import { tailor } from "@/lib/engine/tailor";
import type { StructuredWorkout, StimulusClassification } from "@/lib/engine/types";

export interface RunRefineArgs {
  provider: LlmProvider;
  original: StructuredWorkout;
  classification: StimulusClassification;
  previousWorkout: StructuredWorkout;
  feedback: string;
  profile: AthleteProfileInput;
  request: TailorRequest;
  domain?: DomainData; // injectable for tests; defaults to JSON-backed repository
}

/** Refine = re-run ONLY the tailor step with the rejected attempt + feedback. */
export async function runRefineForAthlete(args: RunRefineArgs): Promise<PipelineResult> {
  const domain = args.domain ?? (await defaultDomain());
  const contraindications = await domain.contraindicationsFor(args.profile.injuries);
  const tailored = await tailor(args.provider, {
    workout: args.original,
    classification: args.classification,
    profile: args.profile,
    request: args.request,
    movements: domain.movements,
    contraindications,
    previousAttempt: { workout: args.previousWorkout, feedback: args.feedback },
  });
  return { original: args.original, classification: args.classification, tailored };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/tailor/tailor-service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `src/app/api/tailor/refine/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/ai";
import { normalizeProfile } from "@/lib/profile";
import { runRefineForAthlete } from "@/lib/tailor-service";
import {
  StructuredWorkoutSchema, StimulusClassificationSchema, TailorRequestSchema,
} from "@/lib/engine/types";
import { z } from "zod";

const RefineBodySchema = z.object({
  original: StructuredWorkoutSchema,
  classification: StimulusClassificationSchema,
  previousWorkout: StructuredWorkoutSchema,
  request: TailorRequestSchema,
  feedback: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = RefineBodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const row = await prisma.athleteProfile.findUnique({ where: { userId: session.user.id } });
  const profile = normalizeProfile(row ? {
    injuries: row.injuries, benchmarks: row.benchmarks, equipment: row.equipment, goals: row.goals, availability: row.availability,
  } : null);

  try {
    const result = await runRefineForAthlete({
      provider: getProvider(),
      original: body.original,
      classification: body.classification,
      previousWorkout: body.previousWorkout,
      feedback: body.feedback,
      profile,
      request: body.request,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("refine failed", e); // never leak exception text to the client
    return NextResponse.json({ error: "engine_failed" }, { status: 502 });
  }
}
```

- [ ] **Step 6: Add the refine UI to `src/app/tailor/TailorClient.tsx`**

Add state next to the existing hooks:

```tsx
const [feedback, setFeedback] = useState("");
```

Add the handler next to `save()`:

```tsx
async function refine() {
  if (!result || !lastRequest || !feedback.trim()) return;
  setLoading(true); setError("");
  const res = await fetch("/api/tailor/refine", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      original: result.original,
      classification: result.classification,
      previousWorkout: result.tailored.workout,
      request: lastRequest,
      feedback,
    }),
  });
  setLoading(false);
  if (!res.ok) { setError("Could not refine this workout. Try again."); return; }
  setResult(await res.json());
  setFeedback("");
  setSaveStatus("idle"); // the refined result has not been saved yet
}
```

In the result JSX, insert a refine card between the "What changed" card and the save button:

```tsx
<div className="rounded border p-4">
  <div className="text-xs uppercase tracking-wide text-gray-500">Not quite right?</div>
  <textarea rows={2} className="mt-2 w-full rounded border p-2" value={feedback}
    onChange={(e) => setFeedback(e.target.value)}
    placeholder='e.g., "still hurts my shoulder", "too easy", "no rower available"' />
  <button disabled={!feedback.trim() || loading} onClick={refine}
    className="mt-2 rounded bg-black px-4 py-2 text-white disabled:opacity-40">
    {loading ? "Refining…" : "Refine"}
  </button>
</div>
```

- [ ] **Step 7: Manual check + commit**

Run: `pnpm dev`, tailor a workout, enter feedback like "too easy", refine. Confirm a new tailored version replaces the old one and the stimulus stays the same.

```bash
git add -A
git commit -m "feat: refine loop (service, POST /api/tailor/refine, feedback UI)"
```

### Task 6.7: Benchmarks section in the profile form

The spec's onboarding includes "strength & benchmarks", and the tailor prompt scales loads to them — so athletes must be able to enter them. Free-form key/value rows; values coerce to number/boolean where obvious.

**Files:**
- Modify: `src/lib/profile.ts`, `src/app/profile/ProfileForm.tsx`
- Test: `tests/profile/profile-helpers.test.ts` (extend)

**Interfaces:**
- Produces: `coerceBenchmarkValue(v: string): number | boolean | string` from `@/lib/profile`.

- [ ] **Step 1: Write the failing test** (append to `tests/profile/profile-helpers.test.ts`)

```ts
import { coerceBenchmarkValue } from "@/lib/profile";

describe("coerceBenchmarkValue", () => {
  it("coerces numeric strings to numbers", () => {
    expect(coerceBenchmarkValue("140")).toBe(140);
    expect(coerceBenchmarkValue("62.5")).toBe(62.5);
  });
  it("coerces true/false to booleans", () => {
    expect(coerceBenchmarkValue("true")).toBe(true);
    expect(coerceBenchmarkValue("false")).toBe(false);
  });
  it("keeps everything else as a trimmed string", () => {
    expect(coerceBenchmarkValue(" 3:45 Fran ")).toBe("3:45 Fran");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/profile/profile-helpers.test.ts`
Expected: FAIL — `coerceBenchmarkValue` not exported.

- [ ] **Step 3: Add `coerceBenchmarkValue` to `src/lib/profile.ts`**

```ts
export function coerceBenchmarkValue(v: string): number | boolean | string {
  const t = v.trim();
  if (t !== "" && !Number.isNaN(Number(t))) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  return t;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/profile/profile-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the benchmarks section to `src/app/profile/ProfileForm.tsx`**

Add the import and state:

```tsx
import { coerceBenchmarkValue } from "@/lib/profile";
// inside the component:
const [newBenchKey, setNewBenchKey] = useState("");
const [newBenchVal, setNewBenchVal] = useState("");
```

Insert this section between "Equipment" and "Availability":

```tsx
<section>
  <h2 className="font-semibold">Benchmarks</h2>
  <p className="text-sm text-gray-500">1RMs, benchmark times, skills — e.g. backSquat1RM → 140, canDoMuscleUp → true, fran → 3:45.</p>
  <div className="mt-2 flex flex-col gap-2">
    {Object.entries(p.benchmarks).map(([k, v]) => (
      <div key={k} className="flex items-center gap-2 text-sm">
        <span className="w-40 truncate font-mono">{k}</span>
        <input className="w-32 rounded border p-1" defaultValue={String(v)}
          onBlur={(e) => setP({ ...p, benchmarks: { ...p.benchmarks, [k]: coerceBenchmarkValue(e.target.value) } })} />
        <button type="button" className="text-red-600"
          onClick={() => { const rest = { ...p.benchmarks }; delete rest[k]; setP({ ...p, benchmarks: rest }); }}>
          remove
        </button>
      </div>
    ))}
    <div className="flex items-center gap-2 text-sm">
      <input className="w-40 rounded border p-1" placeholder="name (e.g. deadlift1RM)" value={newBenchKey} onChange={(e) => setNewBenchKey(e.target.value)} />
      <input className="w-32 rounded border p-1" placeholder="value" value={newBenchVal} onChange={(e) => setNewBenchVal(e.target.value)} />
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={!newBenchKey.trim()}
        onClick={() => {
          setP({ ...p, benchmarks: { ...p.benchmarks, [newBenchKey.trim()]: coerceBenchmarkValue(newBenchVal) } });
          setNewBenchKey(""); setNewBenchVal("");
        }}>
        Add
      </button>
    </div>
  </div>
</section>
```

- [ ] **Step 6: Manual check + commit**

Run: `pnpm dev`, open `/profile`, add `backSquat1RM` = `140` and `canDoMuscleUp` = `true`, save, reload — confirm values persist and render.

```bash
git add -A
git commit -m "feat: benchmarks section in profile form with value coercion"
```

### Task 6.8: Manual structured entry (spec v1 ingestion: paste OR manual)

The API already accepts `{ kind: "structured" }`; this task adds the UI. A manual workout still needs `rawText` (it is the engine's source of truth), so a pure helper renders the draft to text.

**Files:**
- Create: `src/lib/engine/render-text.ts`, `src/app/tailor/ManualEntryForm.tsx`
- Modify: `src/app/tailor/TailorClient.tsx`
- Test: `tests/engine/render-text.test.ts`

**Interfaces:**
- Consumes: `WorkoutBlock`, `StructuredWorkout`, `StructuredWorkoutSchema`, `BlockFormat` from `@/lib/engine/types` (Task 3.1).
- Produces: `type ManualBlockDraft = Omit<WorkoutBlock, "rawText">`, `interface ManualWorkoutDraft { name: string | null; blocks: ManualBlockDraft[] }`, `draftToStructuredWorkout(draft: ManualWorkoutDraft): StructuredWorkout` from `@/lib/engine/render-text`.

- [ ] **Step 1: Write the failing test**

`tests/engine/render-text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftToStructuredWorkout } from "@/lib/engine/render-text";

describe("draftToStructuredWorkout", () => {
  it("renders a manual draft into a StructuredWorkout with generated rawText", () => {
    const w = draftToStructuredWorkout({
      name: "Manual day",
      blocks: [{
        title: "Conditioning", format: "amrap", scheme: "AMRAP 12",
        timeDomainMinutes: 12, coachingNotes: "Steady pace.",
        components: [
          { movement: "Burpee", reps: 10, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null },
          { movement: "Row (Erg)", reps: null, load: null, distanceMeters: null, calories: 12, durationSeconds: null, notes: null },
        ],
      }],
    });
    expect(w.source).toBe("adhoc");
    expect(w.rawText).toContain("AMRAP 12");
    expect(w.rawText).toContain("10 Burpee");
    expect(w.blocks[0].rawText).toContain("12 cal");
    expect(w.blocks[0].rawText).toContain("Steady pace.");
  });

  it("never produces an empty block rawText (schema requires min length 1)", () => {
    const w = draftToStructuredWorkout({
      name: null,
      blocks: [{ title: null, format: "rest", scheme: null, timeDomainMinutes: null, coachingNotes: null, components: [] }],
    });
    expect(w.blocks[0].rawText.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/render-text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/engine/render-text.ts`**

```ts
import { StructuredWorkoutSchema, type StructuredWorkout, type WorkoutBlock } from "@/lib/engine/types";

export type ManualBlockDraft = Omit<WorkoutBlock, "rawText">;

export interface ManualWorkoutDraft {
  name: string | null;
  blocks: ManualBlockDraft[];
}

function renderBlockText(b: ManualBlockDraft): string {
  const lines: string[] = [];
  if (b.title) lines.push(b.title);
  if (b.scheme) lines.push(b.scheme);
  for (const c of b.components) {
    const parts = [
      c.reps != null ? String(c.reps) : null,
      c.movement,
      c.load ? `@ ${c.load}` : null,
      c.distanceMeters != null ? `${c.distanceMeters} m` : null,
      c.calories != null ? `${c.calories} cal` : null,
      c.durationSeconds != null ? `${c.durationSeconds}s` : null,
      c.notes ? `(${c.notes})` : null,
    ].filter(Boolean);
    lines.push(parts.join(" "));
  }
  if (b.coachingNotes) lines.push(b.coachingNotes);
  if (lines.length === 0) lines.push(b.format); // e.g. a bare "rest" block
  return lines.join("\n");
}

/** Manual entry: the rendered text becomes the workout's rawText source of truth. */
export function draftToStructuredWorkout(draft: ManualWorkoutDraft): StructuredWorkout {
  const blocks = draft.blocks.map((b) => ({ ...b, rawText: renderBlockText(b) }));
  return StructuredWorkoutSchema.parse({
    name: draft.name,
    rawText: blocks.map((b) => b.rawText).join("\n\n"),
    source: "adhoc",
    blocks,
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/render-text.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `src/app/tailor/ManualEntryForm.tsx`** (client component)

```tsx
"use client";
import { useState } from "react";
import { BlockFormat, type StructuredWorkout, type WorkoutComponent } from "@/lib/engine/types";
import { draftToStructuredWorkout, type ManualBlockDraft } from "@/lib/engine/render-text";

function emptyComponent(): WorkoutComponent {
  return { movement: "", reps: null, load: null, distanceMeters: null, calories: null, durationSeconds: null, notes: null };
}
function emptyBlock(): ManualBlockDraft {
  return { title: null, format: "for_time", scheme: null, timeDomainMinutes: null, coachingNotes: null, components: [emptyComponent()] };
}

export default function ManualEntryForm({ onSubmit }: { onSubmit: (workout: StructuredWorkout) => void }) {
  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<ManualBlockDraft[]>([emptyBlock()]);
  const [error, setError] = useState("");

  function updateBlock(bi: number, patch: Partial<ManualBlockDraft>) {
    setBlocks(blocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  }
  function updateComponent(bi: number, ci: number, patch: Partial<WorkoutComponent>) {
    setBlocks(blocks.map((b, i) => i === bi
      ? { ...b, components: b.components.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
      : b));
  }

  function submit() {
    try {
      const workout = draftToStructuredWorkout({
        name: name.trim() || null,
        blocks: blocks.map((b) => ({ ...b, components: b.components.filter((c) => c.movement.trim() !== "") })),
      });
      setError("");
      onSubmit(workout);
    } catch {
      setError("Please complete the workout — every listed movement needs a name.");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded border p-4">
      <input className="rounded border p-2" placeholder="Workout name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      {blocks.map((b, bi) => (
        <div key={bi} className="flex flex-col gap-2 border-l-2 border-gray-200 pl-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input className="rounded border p-1" placeholder="Block title" value={b.title ?? ""}
              onChange={(e) => updateBlock(bi, { title: e.target.value || null })} />
            <select className="rounded border p-1" value={b.format}
              onChange={(e) => updateBlock(bi, { format: e.target.value as ManualBlockDraft["format"] })}>
              {BlockFormat.options.map((f) => (<option key={f} value={f}>{f.replaceAll("_", " ")}</option>))}
            </select>
            <input className="rounded border p-1" placeholder='Scheme (e.g. "AMRAP 12", "5x5")' value={b.scheme ?? ""}
              onChange={(e) => updateBlock(bi, { scheme: e.target.value || null })} />
            <input type="number" min={1} className="w-20 rounded border p-1" placeholder="min" value={b.timeDomainMinutes ?? ""}
              onChange={(e) => updateBlock(bi, { timeDomainMinutes: e.target.value ? Number(e.target.value) : null })} />
          </div>
          {b.components.map((c, ci) => (
            <div key={ci} className="flex flex-wrap items-center gap-2 text-sm">
              <input className="w-24 rounded border p-1" placeholder="Reps" value={c.reps == null ? "" : String(c.reps)}
                onChange={(e) => updateComponent(bi, ci, { reps: e.target.value || null })} />
              <input className="w-44 rounded border p-1" placeholder="Movement (e.g. Thruster)" value={c.movement}
                onChange={(e) => updateComponent(bi, ci, { movement: e.target.value })} />
              <input className="w-28 rounded border p-1" placeholder="Load" value={c.load ?? ""}
                onChange={(e) => updateComponent(bi, ci, { load: e.target.value || null })} />
              <button type="button" className="text-red-600"
                onClick={() => updateBlock(bi, { components: b.components.filter((_, j) => j !== ci) })}>×</button>
            </div>
          ))}
          <div className="flex gap-2 text-sm">
            <button type="button" className="rounded border px-2 py-1"
              onClick={() => updateBlock(bi, { components: [...b.components, emptyComponent()] })}>+ movement</button>
            {blocks.length > 1 && (
              <button type="button" className="rounded border px-2 py-1 text-red-600"
                onClick={() => setBlocks(blocks.filter((_, i) => i !== bi))}>remove block</button>
            )}
          </div>
          <textarea rows={2} className="rounded border p-2 text-sm" placeholder="Coaching notes (tempo, intensity, Rx/scaled tiers…)"
            value={b.coachingNotes ?? ""} onChange={(e) => updateBlock(bi, { coachingNotes: e.target.value || null })} />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setBlocks([...blocks, emptyBlock()])}>+ block</button>
        <button type="button" className="rounded bg-black px-4 py-2 text-sm text-white" onClick={submit}>Use this workout</button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add the paste/manual toggle to `src/app/tailor/TailorClient.tsx`**

Add imports and state:

```tsx
import ManualEntryForm from "./ManualEntryForm";
import { WorkoutView } from "@/components/WorkoutView";           // already imported
import type { StructuredWorkout } from "@/lib/engine/types";

// inside the component:
const [mode, setMode] = useState<"paste" | "manual">("paste");
const [manualWorkout, setManualWorkout] = useState<StructuredWorkout | null>(null);
```

In `run()`, build the input from the mode (replace the fetch body's `input`):

```tsx
const input = mode === "paste"
  ? { kind: "raw" as const, rawText }
  : { kind: "structured" as const, workout: manualWorkout! };
// ...
body: JSON.stringify({ input, request }),
```

Replace the single paste `<label>` with a mode toggle + conditional source:

```tsx
<div className="flex flex-col gap-2">
  <div className="flex gap-2">
    <button type="button" onClick={() => setMode("paste")}
      className={`rounded border px-3 py-1 text-sm ${mode === "paste" ? "bg-black text-white" : ""}`}>Paste text</button>
    <button type="button" onClick={() => { setMode("manual"); setManualWorkout(null); }}
      className={`rounded border px-3 py-1 text-sm ${mode === "manual" ? "bg-black text-white" : ""}`}>Enter manually</button>
  </div>
  {mode === "paste" ? (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">Paste today's workout</span>
      <textarea rows={5} className="rounded border p-2" value={rawText} onChange={(e) => setRawText(e.target.value)}
        placeholder={"e.g.\n21-15-9 for time\nThrusters 95 lb\nPull-ups"} />
    </label>
  ) : manualWorkout ? (
    <div className="flex flex-col gap-2">
      <WorkoutView workout={manualWorkout} title="Your workout" />
      <button type="button" className="self-start rounded border px-3 py-1 text-sm" onClick={() => setManualWorkout(null)}>Edit</button>
    </div>
  ) : (
    <ManualEntryForm onSubmit={setManualWorkout} />
  )}
</div>
```

Update the Tailor button's disabled condition:

```tsx
<button disabled={loading || (mode === "paste" ? !rawText : !manualWorkout)} onClick={run} ...>
```

- [ ] **Step 7: Manual check + commit**

Run: `pnpm dev`, switch to "Enter manually", build a two-block workout, "Use this workout", tailor it. Confirm the pipeline runs without a parse step (the structured input goes straight to classification).

```bash
git add -A
git commit -m "feat: manual structured workout entry with text rendering"
```

### Task 6.9: Missed-days support (multi-day paste → one merged session)

Spec: "Missed days — help prioritize/merge when rejoining; the paste may span several missed days." The single-workout pipeline handles this via prompting: the parser accepts multi-day pastes (days become blocks) and the tailor merges/prioritizes for the `missed_days` constraint. UI hints tell the athlete to paste everything.

**Files:**
- Modify: `src/lib/engine/parse-workout.ts`, `src/lib/engine/tailor.ts`, `src/app/tailor/TailorClient.tsx`
- Test: `tests/engine/parse-workout.test.ts`, `tests/engine/tailor.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (guardrails that the prompts cover multi-day input)

Append to `tests/engine/parse-workout.test.ts` (uses the same inline capturing pattern as Task 4.5):

```ts
it("instructs the model to handle multi-day pastes", async () => {
  let capturedSystem = "";
  const capturing: LlmProvider = {
    async generateStructured(args) {
      capturedSystem = args.systemPrompt ?? "";
      throw new Error("only capturing"); // fallback path is fine for this test
    },
  };
  await parseWorkout(capturing, "Day 1 ...\nDay 2 ...");
  expect(capturedSystem).toContain("MULTIPLE days");
});
```

Append to `tests/engine/tailor.test.ts` (reuses `CapturingProvider` from Task 4.5):

```ts
it("instructs the model to merge multi-day input for missed_days requests", async () => {
  const provider = new CapturingProvider({ workout: fran, changes: [], rationale: "Merged.", safetyNote: null });
  await tailor(provider, {
    workout: fran, classification, profile,
    request: { constraintType: "missed_days", details: "Missed Mon+Tue", timeCapMinutes: null, targetMovement: null },
    movements: [], contraindications: [],
  });
  expect(provider.lastArgs?.systemPrompt).toContain("missed_days");
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/engine/parse-workout.test.ts tests/engine/tailor.test.ts`
Expected: FAIL — prompts do not contain the expected instructions.

- [ ] **Step 3: Extend the prompts**

In `src/lib/engine/parse-workout.ts`, append to the `SYSTEM` string:

```
- The paste may contain MULTIPLE days of programming (e.g., an athlete catching up on missed days).
  Keep everything: represent each day's pieces as ordered blocks and keep any day labels
  (e.g., "Day 1", "Monday") in the block titles.
```

In `src/lib/engine/tailor.ts`, append to the `SYSTEM` string:

```
- If the request's constraintType is "missed_days", the original may span SEVERAL days of programming.
  Merge and prioritize into ONE session that fits the athlete's availability and time budget: keep the
  most important stimuli (favor the primary classification), drop or shrink redundant volume, and list
  every dropped piece in "changes" with the reason.
```

- [ ] **Step 4: Run them, verify they pass**

Run: `pnpm exec vitest run tests/engine/parse-workout.test.ts tests/engine/tailor.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the UI hint in `src/app/tailor/TailorClient.tsx`**

Below the constraint detail textarea (inside the `constraintType !== "none"` block), add:

```tsx
{constraintType === "missed_days" && (
  <p className="text-sm text-gray-500">
    Tip: paste ALL the missed days above (in order) — they'll be merged into one session that fits today.
  </p>
)}
```

- [ ] **Step 6: Manual check + commit**

Run: `pnpm dev`, paste two days of programming, pick "Missed days", tailor. Confirm the result is a single merged session and dropped pieces appear in "What changed".

```bash
git add -A
git commit -m "feat: missed-days support (multi-day parse + merge prompts, UI hint)"
```

---

## Phase 7 — Final wiring & verification

### Task 7.1: README, env check, and full verification

**Files:**
- Modify: `README.md` (replace the create-next-app boilerplate)

- [ ] **Step 1: Rewrite `README.md`** with: prerequisites (Node 20+, Postgres, a `GEMINI_API_KEY`), setup steps (`pnpm install`, set `.env` from `.env.example`, `pnpm db:push`, `pnpm dev` — note there is **no seed step**; domain data ships as JSON in `data/`), how auth works in dev (magic link printed to console), and how to run tests (`pnpm test`).

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all suites pass with no DB and no API key (the Gemini integration test skips itself when `GEMINI_API_KEY` is unset).

- [ ] **Step 3: Production build check**

Run: `pnpm build`
Expected: build completes with no type errors.

- [ ] **Step 4: Manual smoke of the full flow**

Sign in → save profile (including a benchmark) → tailor a pasted workout with an injury constraint → confirm contraindicated movements are avoided → refine with feedback ("too easy") → save → see it in history. Then tailor a manually entered workout and a two-day "missed days" paste.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: rewrite README and finalize v1 verification"
```

---

## Self-review notes (coverage against spec)

- **Engine + domain-grounding** → Phases 2–4 (versioned JSON domain data behind a repository, types, parse/classify/tailor with contraindications + stimulus). ✔
- **AI service abstraction (Gemini behind interface)** → Task 3.2/3.3; only `gemini-provider.ts` imports the SDK; `getProvider()` factory keyed by `AI_PROVIDER`. ✔
- **Free-text + manual ingestion** → `WorkoutInput` union (`raw` | `structured`); pipeline branches in Task 4.4; paste UI in Task 6.4, manual structured-entry UI in Task 6.8. ✔
- **Graceful parse degradation** (spec: "a parse failure degrades gracefully") → Task 4.1 `fallbackWorkout` + verbatim rawText guard. ✔
- **Athlete profile incl. availability and benchmarks** → Prisma `AthleteProfile`, `AthleteProfileSchema`, profile form (Task 6.2) + benchmarks section (Task 6.7). ✔
- **Constraints: injury / time / missed days / movement goal / none** → `ConstraintType`, surfaced in `TailorClient`; missed-days multi-day merge in Task 6.9. ✔
- **Refine loop** (spec pipeline step 6) → engine support in Task 4.5, endpoint + UI in Task 6.6. ✔
- **Dynamic multi-block workout formats** → `StructuredWorkout` is a session of ordered `blocks[]`, each with its own `format`, `scheme`, `components[]`, and `coachingNotes`; verbatim `rawText` is preserved at session and block level as the source of truth, with structure as a derived extraction (Task 3.1, parse prompt in Task 4.1). Stored in `Json` columns — no per-format tables. ✔
- **Result: side-by-side + rationale + what-changed + safety disclaimer** → Task 6.4 (block-by-block `WorkoutView`) + layout footer. ✔
- **Save what you reviewed** → save persists the exact displayed result; it never re-runs the nondeterministic pipeline (Tasks 6.3/6.4). ✔
- **Auth + Postgres persistence (user data only)** → Phase 1 + Phase 5; no edge middleware (incompatible with database sessions/Prisma); pages and API routes self-guard. ✔
- **Out of scope (coach portal, OCR, integrations)** → not present. ✔

## Open follow-ups (not blocking v1)

- **Movement-name → library resolution:** `components[].movement` is a canonical name string with no enforced FK to the movement library, so an extracted movement may have no grounding row (no contraindications/substitutes). v1 relies on the parse prompt emitting canonical names; a fuzzy/normalization pass (and surfacing "unrecognized movement") is a follow-up.
- **Domain data to DB (Phase C):** when coaches need to edit domain data at runtime, move it behind the same `repository.ts` interface into Postgres — nothing else changes.
- **Refine history:** refines replace the on-screen result; persisting the refine conversation chain is a follow-up.
- Retry-with-error-feedback when the LLM returns schema-invalid JSON (currently: one shot, then the parse fallback / a 502).
