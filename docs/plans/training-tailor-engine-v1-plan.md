# Training Tailor v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the athlete self-serve v1 of Training Tailor — an athlete sets up a profile, supplies a functional fitness workout (paste or manual entry), states today's constraint, and gets an individualized, stimulus-preserving modification with rationale.

**Architecture:** Next.js (App Router, TypeScript) full-stack app. A server-side **engine pipeline** (parse → classify stimulus → tailor) depends only on a provider-agnostic **AI service abstraction** (`LlmProvider`); v1 ships a **Gemini** adapter. Domain knowledge (movement library, injury→contraindication map, stimulus taxonomy) is owned data seeded into **Postgres** via **Prisma**. Auth is Auth.js (NextAuth v5) email magic-link.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Prisma + PostgreSQL · Zod · Vitest · `@google/genai` (Gemini) · Auth.js v5 · Tailwind CSS.

---

## Reference spec

`docs/training-tailor-engine-v1-design.md`

## Conventions for the implementing engineer

- **Package manager:** `pnpm`. Platform is Windows; commands are cross-platform unless noted.
- **Testing:** Vitest. Engine/business logic is unit-tested against a **fake `LlmProvider`** so tests are deterministic and need no network/API key. The real Gemini adapter has one integration test that **skips** when `GEMINI_API_KEY` is unset.
- **TDD loop for every code task:** write failing test → run it, see it fail → minimal implementation → run, see it pass → commit.
- **Commit style:** Conventional Commits (`feat:`, `test:`, `chore:`, `refactor:`).
- **No secrets in git.** All keys come from `.env` (gitignored). `.env.example` documents required vars.

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
│  │  │  ├─ parse-workout.ts         # raw text -> StructuredWorkout
│  │  │  ├─ classify-stimulus.ts # StructuredWorkout -> StimulusClassification
│  │  │  ├─ tailor.ts            # (workout + profile + request + domain) -> TailoringResult
│  │  │  └─ pipeline.ts          # orchestrates parse/classify/tailor
│  │  ├─ domain/
│  │  │  ├─ types.ts             # Movement, InjuryContraindication, StimulusDef domain types
│  │  │  └─ repository.ts        # DB reads for domain assets (Prisma)
│  │  └─ db.ts                   # Prisma client singleton
│  ├─ app/
│  │  ├─ layout.tsx, globals.css
│  │  ├─ page.tsx                # landing / dashboard
│  │  ├─ profile/page.tsx        # athlete profile form
│  │  ├─ tailor/page.tsx         # ingest + constraint -> result
│  │  ├─ history/page.tsx        # saved tailored workouts
│  │  └─ api/
│  │     ├─ tailor/route.ts      # POST: run pipeline
│  │     └─ profile/route.ts     # GET/PUT athlete profile
│  └─ auth.ts                    # Auth.js config
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts                    # seeds movements, contraindications, stimulus defs
├─ data/                         # versioned domain seed JSON
│  ├─ movements.json
│  ├─ injury-contraindications.json
│  └─ stimulus-taxonomy.json
├─ tests/                        # mirrors src/ where useful
├─ .env.example
├─ vitest.config.ts
└─ package.json
```

**Boundary rule:** only `src/lib/ai/gemini-provider.ts` imports the Gemini SDK. The engine imports `LlmProvider` from `provider.ts` and never a concrete provider. This is what makes adding Claude/OpenAI later a one-file change.

---

## Phase 0 — Scaffolding & tooling

### Task 0.1: Initialize repo, Next.js, and Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize git and Next.js app**

Run from `C:\Dev\training-tailor` (directory already exists, is empty except `docs/`):

```bash
git init
pnpm create next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm
```

When prompted that the directory is not empty, choose to proceed (the `docs/` folder is unrelated). Accept defaults for any remaining prompts.

- [ ] **Step 2: Add Vitest and supporting dev deps**

```bash
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: Add test script to `package.json`**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create a smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 7: Create `.env.example`**

```
# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/training_tailor?schema=public"

# AI provider selection: "gemini" (v1) — future: "claude", "openai"
AI_PROVIDER="gemini"
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-2.5-flash"

# Auth.js
AUTH_SECRET=""
# Dev email: leave EMAIL_SERVER empty to log magic links to the console
EMAIL_SERVER=""
EMAIL_FROM="noreply@training-tailor.local"
```

Ensure `.gitignore` includes `.env` and `.env*.local` (create-next-app adds these; verify).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and env template"
```

---

## Phase 1 — Database & data model

### Task 1.1: Set up Prisma and the schema

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install Prisma**

```bash
pnpm add -D prisma
pnpm add @prisma/client
pnpm exec prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and appends `DATABASE_URL` to `.env`. Set `DATABASE_URL` in `.env` to a reachable Postgres (local Docker or a cloud dev instance).

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
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

// ---- Domain knowledge (seeded, product-owned) ----
model Movement {
  id          String   @id @default(cuid())
  name        String   @unique
  plane       String   // e.g. "sagittal", "frontal", "transverse", "multi"
  jointStress Json     // string[] e.g. ["shoulder","wrist"]
  loadType    String   // "barbell" | "bodyweight" | "dumbbell" | "machine" | "kettlebell" | "other"
  skill       String   // "beginner" | "intermediate" | "advanced"
  substitutes Json     // string[] of other movement names
}

model InjuryContraindication {
  id            String @id @default(cuid())
  injuryKey     String @unique // e.g. "shoulder_impingement"
  label         String         // human label e.g. "Shoulder impingement"
  avoidPatterns Json           // string[] e.g. ["overhead_press","ballistic_pressing"]
  avoidMovements Json          // string[] of movement names to avoid
  notes         String?
}

model StimulusDef {
  id          String @id @default(cuid())
  key         String @unique // e.g. "aerobic_capacity"
  label       String
  description String
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

- [ ] **Step 3: Add Prisma scripts to `package.json`**

```json
"db:push": "prisma db push",
"db:seed": "tsx prisma/seed.ts",
"db:studio": "prisma studio"
```

Install `tsx` for running TS scripts:

```bash
pnpm add -D tsx
```

- [ ] **Step 4: Push schema to the database**

Run: `pnpm db:push`
Expected: "Your database is now in sync with your Prisma schema." (Requires a reachable Postgres in `DATABASE_URL`.)

- [ ] **Step 5: Create the Prisma client singleton `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema and db client (auth, profile, domain, tailored)"
```

---

## Phase 2 — Domain types & seed data

### Task 2.1: Define domain TypeScript types

**Files:**
- Create: `src/lib/domain/types.ts`
- Test: `tests/domain/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/domain/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";

describe("domain schemas", () => {
  it("validates a movement", () => {
    const m = MovementSchema.parse({
      name: "Pull-up",
      plane: "frontal",
      jointStress: ["shoulder", "elbow"],
      loadType: "bodyweight",
      skill: "intermediate",
      substitutes: ["Ring Row", "Banded Pull-up"],
    });
    expect(m.name).toBe("Pull-up");
  });

  it("rejects an invalid loadType", () => {
    expect(() =>
      MovementSchema.parse({
        name: "X", plane: "sagittal", jointStress: [], loadType: "rocket",
        skill: "beginner", substitutes: [],
      })
    ).toThrow();
  });

  it("validates an injury contraindication and stimulus def", () => {
    expect(
      InjuryContraindicationSchema.parse({
        injuryKey: "shoulder_impingement", label: "Shoulder impingement",
        avoidPatterns: ["overhead_press"], avoidMovements: ["Push Press"], notes: null,
      }).injuryKey
    ).toBe("shoulder_impingement");
    expect(
      StimulusDefSchema.parse({ key: "aerobic_capacity", label: "Aerobic capacity", description: "Sustained..." }).key
    ).toBe("aerobic_capacity");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run tests/domain/types.test.ts`
Expected: FAIL — cannot find module `@/lib/domain/types`.

- [ ] **Step 3: Implement `src/lib/domain/types.ts`**

```ts
import { z } from "zod";

export const LoadType = z.enum(["barbell", "bodyweight", "dumbbell", "machine", "kettlebell", "other"]);
export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);

export const MovementSchema = z.object({
  name: z.string().min(1),
  plane: z.string().min(1),
  jointStress: z.array(z.string()),
  loadType: LoadType,
  skill: SkillLevel,
  substitutes: z.array(z.string()),
});
export type Movement = z.infer<typeof MovementSchema>;

export const InjuryContraindicationSchema = z.object({
  injuryKey: z.string().min(1),
  label: z.string().min(1),
  avoidPatterns: z.array(z.string()),
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

Install Zod if not already present:

```bash
pnpm add zod
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run tests/domain/types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: domain types and Zod schemas (movement, injury, stimulus)"
```

### Task 2.2: Author the seed data files

**Files:**
- Create: `data/stimulus-taxonomy.json`, `data/movements.json`, `data/injury-contraindications.json`
- Test: `tests/domain/seed-data.test.ts`

- [ ] **Step 1: Write the failing test (validates the JSON against schemas)**

`tests/domain/seed-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import movements from "../../data/movements.json";
import injuries from "../../data/injury-contraindications.json";
import stimuli from "../../data/stimulus-taxonomy.json";
import { MovementSchema, InjuryContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";

describe("seed data integrity", () => {
  it("every movement is valid and has a unique name", () => {
    const names = new Set<string>();
    for (const m of movements) {
      MovementSchema.parse(m);
      expect(names.has(m.name)).toBe(false);
      names.add(m.name);
    }
    expect(movements.length).toBeGreaterThanOrEqual(25);
  });

  it("every substitute references a real movement", () => {
    const names = new Set(movements.map((m: any) => m.name));
    for (const m of movements) for (const s of m.substitutes) expect(names.has(s)).toBe(true);
  });

  it("injuries are valid and reference real movements", () => {
    const names = new Set(movements.map((m: any) => m.name));
    for (const i of injuries) {
      InjuryContraindicationSchema.parse(i);
      for (const mv of i.avoidMovements) expect(names.has(mv)).toBe(true);
    }
    expect(injuries.length).toBeGreaterThanOrEqual(6);
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
```

Enable JSON imports in `tsconfig.json` if needed (`"resolveJsonModule": true` — create-next-app sets this).

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run tests/domain/seed-data.test.ts`
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

- [ ] **Step 4: Create `data/movements.json`** (≥25 common functional fitness movements; each substitute MUST also appear as a `name`)

```json
[
  { "name": "Back Squat", "plane": "sagittal", "jointStress": ["knee","hip","lumbar"], "loadType": "barbell", "skill": "beginner", "substitutes": ["Goblet Squat","Air Squat"] },
  { "name": "Front Squat", "plane": "sagittal", "jointStress": ["knee","hip","wrist"], "loadType": "barbell", "skill": "intermediate", "substitutes": ["Goblet Squat","Air Squat"] },
  { "name": "Air Squat", "plane": "sagittal", "jointStress": ["knee","hip"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Box Squat"] },
  { "name": "Goblet Squat", "plane": "sagittal", "jointStress": ["knee","hip"], "loadType": "dumbbell", "skill": "beginner", "substitutes": ["Air Squat"] },
  { "name": "Box Squat", "plane": "sagittal", "jointStress": ["knee","hip"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Air Squat"] },
  { "name": "Deadlift", "plane": "sagittal", "jointStress": ["lumbar","hip","knee"], "loadType": "barbell", "skill": "beginner", "substitutes": ["Romanian Deadlift","Kettlebell Swing"] },
  { "name": "Romanian Deadlift", "plane": "sagittal", "jointStress": ["lumbar","hip"], "loadType": "barbell", "skill": "intermediate", "substitutes": ["Kettlebell Swing"] },
  { "name": "Shoulder Press", "plane": "sagittal", "jointStress": ["shoulder","wrist"], "loadType": "barbell", "skill": "beginner", "substitutes": ["Dumbbell Shoulder Press","Push Press"] },
  { "name": "Push Press", "plane": "sagittal", "jointStress": ["shoulder","wrist","knee"], "loadType": "barbell", "skill": "intermediate", "substitutes": ["Shoulder Press","Dumbbell Shoulder Press"] },
  { "name": "Dumbbell Shoulder Press", "plane": "sagittal", "jointStress": ["shoulder","wrist"], "loadType": "dumbbell", "skill": "beginner", "substitutes": ["Shoulder Press"] },
  { "name": "Bench Press", "plane": "transverse", "jointStress": ["shoulder","elbow"], "loadType": "barbell", "skill": "beginner", "substitutes": ["Push-up","Dumbbell Bench Press"] },
  { "name": "Dumbbell Bench Press", "plane": "transverse", "jointStress": ["shoulder","elbow"], "loadType": "dumbbell", "skill": "beginner", "substitutes": ["Push-up"] },
  { "name": "Push-up", "plane": "transverse", "jointStress": ["shoulder","elbow","wrist"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Knee Push-up"] },
  { "name": "Knee Push-up", "plane": "transverse", "jointStress": ["shoulder","elbow","wrist"], "loadType": "bodyweight", "skill": "beginner", "substitutes": [] },
  { "name": "Pull-up", "plane": "frontal", "jointStress": ["shoulder","elbow"], "loadType": "bodyweight", "skill": "intermediate", "substitutes": ["Ring Row","Banded Pull-up"] },
  { "name": "Banded Pull-up", "plane": "frontal", "jointStress": ["shoulder","elbow"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Ring Row"] },
  { "name": "Ring Row", "plane": "transverse", "jointStress": ["shoulder","elbow"], "loadType": "bodyweight", "skill": "beginner", "substitutes": [] },
  { "name": "Muscle-up", "plane": "frontal", "jointStress": ["shoulder","elbow","wrist"], "loadType": "bodyweight", "skill": "advanced", "substitutes": ["Pull-up","Ring Row"] },
  { "name": "Handstand Push-up", "plane": "sagittal", "jointStress": ["shoulder","wrist","neck"], "loadType": "bodyweight", "skill": "advanced", "substitutes": ["Dumbbell Shoulder Press","Push-up"] },
  { "name": "Toes-to-Bar", "plane": "sagittal", "jointStress": ["shoulder","lumbar"], "loadType": "bodyweight", "skill": "intermediate", "substitutes": ["Hanging Knee Raise","Sit-up"] },
  { "name": "Hanging Knee Raise", "plane": "sagittal", "jointStress": ["shoulder"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Sit-up"] },
  { "name": "Sit-up", "plane": "sagittal", "jointStress": ["lumbar"], "loadType": "bodyweight", "skill": "beginner", "substitutes": [] },
  { "name": "Kettlebell Swing", "plane": "sagittal", "jointStress": ["hip","lumbar","shoulder"], "loadType": "kettlebell", "skill": "beginner", "substitutes": ["Romanian Deadlift"] },
  { "name": "Power Clean", "plane": "sagittal", "jointStress": ["lumbar","hip","knee","wrist"], "loadType": "barbell", "skill": "advanced", "substitutes": ["Kettlebell Swing","Deadlift"] },
  { "name": "Power Snatch", "plane": "sagittal", "jointStress": ["lumbar","shoulder","wrist","knee"], "loadType": "barbell", "skill": "advanced", "substitutes": ["Kettlebell Swing"] },
  { "name": "Thruster", "plane": "sagittal", "jointStress": ["knee","hip","shoulder","wrist"], "loadType": "barbell", "skill": "intermediate", "substitutes": ["Goblet Squat","Dumbbell Shoulder Press"] },
  { "name": "Wall Ball", "plane": "sagittal", "jointStress": ["knee","hip","shoulder"], "loadType": "other", "skill": "beginner", "substitutes": ["Thruster","Goblet Squat"] },
  { "name": "Burpee", "plane": "sagittal", "jointStress": ["shoulder","knee","wrist"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Up-Down","Push-up"] },
  { "name": "Up-Down", "plane": "sagittal", "jointStress": ["knee"], "loadType": "bodyweight", "skill": "beginner", "substitutes": [] },
  { "name": "Row (Erg)", "plane": "sagittal", "jointStress": ["lumbar","knee"], "loadType": "machine", "skill": "beginner", "substitutes": ["Bike (Erg)","Run"] },
  { "name": "Bike (Erg)", "plane": "sagittal", "jointStress": ["knee"], "loadType": "machine", "skill": "beginner", "substitutes": ["Row (Erg)"] },
  { "name": "Run", "plane": "sagittal", "jointStress": ["knee","ankle"], "loadType": "bodyweight", "skill": "beginner", "substitutes": ["Row (Erg)","Bike (Erg)"] },
  { "name": "Double-under", "plane": "sagittal", "jointStress": ["ankle","calf"], "loadType": "bodyweight", "skill": "intermediate", "substitutes": ["Single-under"] },
  { "name": "Single-under", "plane": "sagittal", "jointStress": ["ankle"], "loadType": "bodyweight", "skill": "beginner", "substitutes": [] }
]
```

- [ ] **Step 5: Create `data/injury-contraindications.json`** (every `avoidMovements` entry MUST be a movement `name` above)

```json
[
  { "injuryKey": "shoulder_impingement", "label": "Shoulder impingement", "avoidPatterns": ["overhead_press","ballistic_pressing"], "avoidMovements": ["Shoulder Press","Push Press","Handstand Push-up","Power Snatch","Muscle-up"], "notes": "Avoid loaded overhead and ballistic pressing; prefer neutral-grip, below-shoulder work." },
  { "injuryKey": "lower_back_strain", "label": "Lower back strain", "avoidPatterns": ["spinal_loading","ballistic_hip_hinge"], "avoidMovements": ["Deadlift","Power Clean","Power Snatch","Kettlebell Swing"], "notes": "Avoid heavy/ballistic spinal loading; keep hinging light and controlled." },
  { "injuryKey": "knee_pain", "label": "Knee pain", "avoidPatterns": ["deep_knee_flexion","impact"], "avoidMovements": ["Back Squat","Front Squat","Thruster","Wall Ball","Run"], "notes": "Reduce depth/impact; prefer box squats to a comfortable height and low-impact cardio." },
  { "injuryKey": "wrist_pain", "label": "Wrist pain", "avoidPatterns": ["loaded_wrist_extension"], "avoidMovements": ["Front Squat","Thruster","Handstand Push-up","Push-up","Power Clean"], "notes": "Avoid loaded wrist extension; use dumbbells/neutral grip where possible." },
  { "injuryKey": "elbow_tendinopathy", "label": "Elbow tendinopathy", "avoidPatterns": ["ballistic_pulling"], "avoidMovements": ["Muscle-up","Pull-up","Toes-to-Bar"], "notes": "Avoid ballistic/kipping pulling; substitute supported rows." },
  { "injuryKey": "ankle_sprain", "label": "Ankle sprain", "avoidPatterns": ["impact","plyometric"], "avoidMovements": ["Run","Double-under","Burpee","Box Squat"], "notes": "Avoid impact/plyometrics; use low-impact monostructural substitutes." },
  { "injuryKey": "hip_flexor_strain", "label": "Hip flexor strain", "avoidPatterns": ["loaded_hip_flexion","sprinting"], "avoidMovements": ["Toes-to-Bar","Run","Power Clean"], "notes": "Avoid loaded/explosive hip flexion." }
]
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm exec vitest run tests/domain/seed-data.test.ts`
Expected: PASS (4 tests). If referential checks fail, fix the offending name in the JSON.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: seed domain data (movements, injuries, stimulus taxonomy) with integrity tests"
```

### Task 2.3: Seed script + domain repository

**Files:**
- Create: `prisma/seed.ts`, `src/lib/domain/repository.ts`
- Test: `tests/domain/repository.test.ts`

- [ ] **Step 1: Write `prisma/seed.ts`**

```ts
import { PrismaClient } from "@prisma/client";
import movements from "../data/movements.json";
import injuries from "../data/injury-contraindications.json";
import stimuli from "../data/stimulus-taxonomy.json";

const prisma = new PrismaClient();

async function main() {
  for (const m of movements) {
    await prisma.movement.upsert({
      where: { name: m.name },
      update: { plane: m.plane, jointStress: m.jointStress, loadType: m.loadType, skill: m.skill, substitutes: m.substitutes },
      create: { name: m.name, plane: m.plane, jointStress: m.jointStress, loadType: m.loadType, skill: m.skill, substitutes: m.substitutes },
    });
  }
  for (const i of injuries) {
    await prisma.injuryContraindication.upsert({
      where: { injuryKey: i.injuryKey },
      update: { label: i.label, avoidPatterns: i.avoidPatterns, avoidMovements: i.avoidMovements, notes: i.notes ?? null },
      create: { injuryKey: i.injuryKey, label: i.label, avoidPatterns: i.avoidPatterns, avoidMovements: i.avoidMovements, notes: i.notes ?? null },
    });
  }
  for (const s of stimuli) {
    await prisma.stimulusDef.upsert({
      where: { key: s.key },
      update: { label: s.label, description: s.description },
      create: { key: s.key, label: s.label, description: s.description },
    });
  }
  console.log(`Seeded ${movements.length} movements, ${injuries.length} injuries, ${stimuli.length} stimulus defs.`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 2: Run the seed**

Run: `pnpm db:seed`
Expected: console line confirming counts. (Requires `db:push` already applied.)

- [ ] **Step 3: Write the failing repository test**

`tests/domain/repository.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getAllMovements, getContraindicationsForInjuries, getStimulusDefs } from "@/lib/domain/repository";

describe("domain repository", () => {
  it("loads movements from the database", async () => {
    const all = await getAllMovements();
    expect(all.find((m) => m.name === "Back Squat")).toBeTruthy();
  });

  it("returns contraindications for given injury keys", async () => {
    const c = await getContraindicationsForInjuries(["shoulder_impingement"]);
    expect(c[0].avoidMovements).toContain("Shoulder Press");
  });

  it("loads the stimulus taxonomy", async () => {
    const s = await getStimulusDefs();
    expect(s.some((d) => d.key === "aerobic_capacity")).toBe(true);
  });
});
```

> Note: this test hits the seeded DB. Run it only after `db:push` + `db:seed`. It is an integration test; keep it in `tests/domain/`.

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm exec vitest run tests/domain/repository.test.ts`
Expected: FAIL — module `@/lib/domain/repository` not found.

- [ ] **Step 5: Implement `src/lib/domain/repository.ts`**

```ts
import { prisma } from "@/lib/db";
import type { Movement, InjuryContraindication, StimulusDef } from "@/lib/domain/types";

export async function getAllMovements(): Promise<Movement[]> {
  const rows = await prisma.movement.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({
    name: r.name, plane: r.plane, jointStress: r.jointStress as string[],
    loadType: r.loadType as Movement["loadType"], skill: r.skill as Movement["skill"],
    substitutes: r.substitutes as string[],
  }));
}

export async function getContraindicationsForInjuries(injuryKeys: string[]): Promise<InjuryContraindication[]> {
  if (injuryKeys.length === 0) return [];
  const rows = await prisma.injuryContraindication.findMany({ where: { injuryKey: { in: injuryKeys } } });
  return rows.map((r) => ({
    injuryKey: r.injuryKey, label: r.label, avoidPatterns: r.avoidPatterns as string[],
    avoidMovements: r.avoidMovements as string[], notes: r.notes,
  }));
}

export async function getStimulusDefs(): Promise<StimulusDef[]> {
  const rows = await prisma.stimulusDef.findMany({ orderBy: { key: "asc" } });
  return rows.map((r) => ({ key: r.key, label: r.label, description: r.description }));
}
```

- [ ] **Step 6: Run it, verify it passes**

Run: `pnpm exec vitest run tests/domain/repository.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: domain seed script and repository reads"
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

describe("engine schemas", () => {
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
Expected: PASS (3 tests).

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

- [ ] **Step 1: Install the Gemini SDK and schema converter**

```bash
pnpm add @google/genai zod-to-json-schema
```

- [ ] **Step 2: Implement `src/lib/ai/gemini-provider.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { LlmProvider, GenerateStructuredArgs } from "@/lib/ai/provider";

export class GeminiProvider implements LlmProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    const jsonSchema = zodToJsonSchema(args.schema, { name: args.schemaName, target: "openApi3" });
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        systemInstruction: args.systemPrompt,
        responseMimeType: "application/json",
        responseSchema: jsonSchema as object,
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

> If `zod-to-json-schema` output is rejected by the Gemini schema validator for a given shape, the fallback is to drop `responseSchema` and instead append the JSON shape description to the prompt while keeping `responseMimeType: "application/json"`; the `args.schema.parse(parsed)` call still guarantees correctness.

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
      return new GeminiProvider(key, process.env.GEMINI_MODEL ?? "gemini-2.5-flash");
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
    const provider = new GeminiProvider(key!, process.env.GEMINI_MODEL ?? "gemini-2.5-flash");
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

export async function parseWorkout(provider: LlmProvider, rawText: string): Promise<StructuredWorkout> {
  return provider.generateStructured({
    systemPrompt: SYSTEM,
    prompt: `Raw workout:\n"""\n${rawText}\n"""\nReturn the structured workout as JSON.`,
    schema: StructuredWorkoutSchema,
    schemaName: "StructuredWorkout",
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/parse-workout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: engine parseWorkout (raw text -> StructuredWorkout)"
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
      { injuryKey: "shoulder_impingement", label: "Shoulder impingement", avoidPatterns: ["overhead_press"], avoidMovements: ["Thruster"], notes: null },
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
- Respect every contraindication: never prescribe a movement listed in avoidMovements or matching an avoided pattern.
- Prefer substitutions from the provided movement library; keep the same stimulus (time domain, intensity, modality balance).
- Scale loads to the athlete's benchmarks and equipment; fit the athlete's time budget if provided.
- Carry over each block's coachingNotes (tempo, intensity, scaling tiers); update them only where the change requires it.
- If a movement-improvement goal is requested, bias the modification toward that movement without breaking the stimulus.
- Be conservative with injuries: when unsure, choose the lower-risk option and add a safetyNote.
- For the modified "workout", set the session and per-block "rawText" to a clean text rendering of the MODIFIED workout.
Return JSON with: the modified "workout", a "changes" list (original/modified/reason per change), a "rationale" explaining how the
stimulus is preserved, and a "safetyNote" (or null).`;

export async function tailor(provider: LlmProvider, input: TailorInput): Promise<TailoringResult> {
  const avoid = input.contraindications.flatMap((c) => c.avoidMovements);
  const avoidPatterns = input.contraindications.flatMap((c) => c.avoidPatterns);
  const library = input.movements.map((m) => `${m.name} [${m.loadType}, ${m.skill}, stress: ${m.jointStress.join("/")}, subs: ${m.substitutes.join(", ") || "none"}]`).join("\n");

  const prompt = [
    `Original workout JSON:\n${JSON.stringify(input.workout)}`,
    `Stimulus classification:\n${JSON.stringify(input.classification)}`,
    `Athlete profile:\n${JSON.stringify(input.profile)}`,
    `Today's request:\n${JSON.stringify(input.request)}`,
    `Movements to AVOID: ${avoid.join(", ") || "none"}`,
    `Patterns to AVOID: ${avoidPatterns.join(", ") || "none"}`,
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
Expected: all suites pass (DB-integration suites require a seeded DB; skip/ignore if not provisioned in this run).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tailor pipeline orchestration (parse -> classify -> tailor)"
```

---

## Phase 5 — Auth (Auth.js v5, magic link)

### Task 5.1: Configure Auth.js with Prisma adapter and dev email

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
- Modify: `.env` (`AUTH_SECRET`)

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

- [ ] **Step 5: Protect app routes with `src/middleware.ts`**

```ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/profile/:path*", "/tailor/:path*", "/history/:path*", "/api/profile/:path*", "/api/tailor/:path*"],
};
```

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

> Note: ensure `session.user.id` is populated. In `src/auth.ts`, add a `session` callback if needed:
> ```ts
> callbacks: { session({ session, user }) { session.user.id = user.id; return session; } }
> ```
> Add this callback now and re-confirm the auth manual check still works.

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

### Task 6.3: Tailor API endpoint

**Files:**
- Create: `src/app/api/tailor/route.ts`, `src/lib/tailor-service.ts`
- Test: `tests/tailor/tailor-service.test.ts`

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
          { injuryKey: "shoulder_impingement", label: "Shoulder impingement", avoidPatterns: ["overhead_press"], avoidMovements: ["Pull-up"], notes: null },
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

- [ ] **Step 5: Implement `src/app/api/tailor/route.ts`**

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
  save: z.boolean().optional(),
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

  let result;
  try {
    result = await runTailorForAthlete({ provider: getProvider(), input: body.input, profile, request: body.request });
  } catch (e) {
    return NextResponse.json({ error: "engine_failed", detail: String(e) }, { status: 502 });
  }

  if (body.save) {
    await prisma.tailoredWorkout.create({
      data: {
        userId: session.user.id,
        originalWorkout: result.original, request: body.request,
        tailoredWorkout: result.tailored.workout, changes: result.tailored.changes,
        rationale: result.tailored.rationale, safetyNote: result.tailored.safetyNote,
        stimulus: result.classification,
      },
    });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tailor service and POST /api/tailor endpoint"
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

  async function run(save: boolean) {
    setLoading(true); setError(""); if (!save) setResult(null);
    const request: TailorRequest = {
      constraintType, details,
      timeCapMinutes: constraintType === "time" && timeCap ? Number(timeCap) : null,
      targetMovement: constraintType === "movement_goal" && target ? target : null,
    };
    const res = await fetch("/api/tailor", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { kind: "raw", rawText }, request, save }),
    });
    setLoading(false);
    if (!res.ok) { setError("Could not tailor this workout. Try again."); return; }
    setResult(await res.json());
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
        <button disabled={!rawText || loading} onClick={() => run(false)} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">
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
          <div>
            <button onClick={() => run(true)} className="rounded border px-4 py-2">Save to history</button>
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

- [ ] **Step 4: Manual end-to-end check (requires `GEMINI_API_KEY`, seeded DB)**

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

---

## Phase 7 — Final wiring & verification

### Task 7.1: README, env check, and full verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** with: prerequisites (Node 20+, Postgres, a `GEMINI_API_KEY`), setup steps (`pnpm install`, set `.env` from `.env.example`, `pnpm db:push`, `pnpm db:seed`, `pnpm dev`), how auth works in dev (magic link printed to console), and how to run tests (`ppnpm test`).

- [ ] **Step 2: Run the full unit suite**

Run: `pnpm test`
Expected: all non-DB suites pass. DB-integration suites (`tests/domain/repository.test.ts`) pass when `db:push` + `db:seed` have run against `DATABASE_URL`.

- [ ] **Step 3: Production build check**

Run: `pnpm build`
Expected: build completes with no type errors.

- [ ] **Step 4: Manual smoke of the full flow**

Sign in → save profile → tailor a pasted workout with an injury constraint → confirm contraindicated movements are avoided → save → see it in history.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add README and finalize v1 verification"
```

---

## Self-review notes (coverage against spec)

- **Engine + domain-grounding** → Phases 2–4 (domain seed, types, parse/classify/tailor with contraindications + stimulus). ✔
- **AI service abstraction (Gemini behind interface)** → Task 3.2/3.3; only `gemini-provider.ts` imports the SDK; `getProvider()` factory keyed by `AI_PROVIDER`. ✔
- **Free-text + manual ingestion** → `WorkoutInput` union (`raw` | `structured`); pipeline branches in Task 4.4; UI uses raw paste (manual entry of a structured workout is supported by the API/types and can be surfaced in a later UI iteration). ✔
- **Athlete profile incl. availability** → Prisma `AthleteProfile.availability`, `AthleteProfileSchema`, profile form. ✔
- **Constraints: injury / time / missed days / movement goal / none** → `ConstraintType`, surfaced in `TailorClient`. ✔
- **Dynamic multi-block workout formats** → `StructuredWorkout` is a session of ordered `blocks[]`, each with its own `format`, `scheme`, `components[]`, and `coachingNotes`; verbatim `rawText` is preserved at session and block level as the source of truth, with structure as a derived extraction (Task 3.1, parse prompt in Task 4.1). Stored in `Json` columns — no per-format tables. ✔
- **Result: side-by-side + rationale + what-changed + safety disclaimer** → Task 6.4 (block-by-block `WorkoutView`) + layout footer. ✔
- **Auth + Postgres persistence** → Phase 1 + Phase 5. ✔
- **Out of scope (coach portal, OCR, integrations)** → not present. ✔

## Open follow-ups (not blocking v1)

- Refine loop ("still hurts / too easy") — the API already accepts a free-text `details`; a conversational refine UI is a fast follow.
- **Movement-name → library resolution:** `components[].movement` is a canonical name string with no enforced FK to the `Movement` library, so an extracted movement may have no grounding row (no contraindications/substitutes). v1 relies on the parse prompt emitting canonical names; a fuzzy/normalization pass (and surfacing "unrecognized movement") is a follow-up.
- **`blocks[].rawText` reconstruction:** the parser splits the session into per-block slices; if a split is lossy, the session-level `rawText` remains the complete source of truth and the block can fall back to it.
- Manual structured-entry form (the data path exists; only the UI is deferred).
- Confirm the exact current Gemini model id at build time; `gemini-2.5-flash` is the default.
