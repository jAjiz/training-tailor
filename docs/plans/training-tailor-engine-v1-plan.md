# Training Tailor v1 — Implementation Plan (revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 athlete self-serve app: paste or enter a workout, describe today's situation, and get a stimulus-preserving modification that is deterministically verified against the athlete's injuries, limitations and equipment.

**Architecture:** Next.js 16 App Router app. A provider-agnostic engine (`src/lib/engine`) runs analyze (LLM) → resolve/plan (code) → tailor (LLM) → validate (code, fail-closed) over versioned domain JSON (`data/`) loaded through `src/lib/domain`. Postgres (Prisma 7) stores users (Better Auth, Google OAuth), profiles, saved results and the quota ledger. Engine routes stream NDJSON progress.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, Zod 4, Vitest 4, Prisma 7 + `@prisma/adapter-pg`, Better Auth, `@google/genai`, tsx (scripts), pnpm.

**Spec:** `docs/specs/training-tailor-engine-v1-design.md` (revision 2). Read it before any task: every rule here argues from it.

## Global Constraints

- Package manager **pnpm**; platform Windows (commands are cross-platform unless noted).
- **Prisma 7:** client generated to `src/generated/prisma`; import from `@/generated/prisma/client`, never `@prisma/client`. Schema changes go through `prisma migrate dev` (no `db push` after Task S1).
- **Database (Neon):** local `.env` points at the Neon branch `dev`, never `production`. `DATABASE_URL` is the pooled connection (host ends in `-pooler`), used by the app in `src/lib/db.ts`; `DIRECT_URL` is the direct connection, used by the Prisma CLI through `prisma.config.ts`. Both use `sslmode=verify-full`.
- **Boundary rule:** only `src/lib/ai/gemini-provider.ts` imports `@google/genai`. `src/lib/engine/**` and `src/lib/domain/**` never import Prisma, Next.js or a concrete provider.
- **Domain data** lives in `data/*.json`, is edited only through scripts that use `scripts/lib/domain-json.mjs` (keeps the one-row-per-line style), and is validated by `tests/domain/*`.
- **Model pinned:** `GEMINI_MODEL` default `gemini-3.8-flash`; never a `-latest` alias.
- **Fail closed:** the engine never returns a tailored workout containing a movement assessed `avoid`.
- **Errors:** never return exception text to the client; log server-side, return a code (`unauthorized`, `invalid_request`, `quota_exceeded`, `engine_unavailable`, `engine_failed`, `engine_unsafe`).
- **Public repo:** nothing under `data/corpus/` or `reports/` is committed; eval cases are synthetic or public benchmarks.
- **Tests:** `pnpm test` is deterministic — no network, no DB, no API key. TDD for every code task: failing test → see it fail → minimal code → see it pass → commit.
- **Commits:** Conventional Commits; end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Status

Revision 1 of this plan delivered Phase 0 (scaffold, Vitest), Phase 1 (Prisma 7 + driver adapter; its schema is **replaced** in Task S1) and the domain catalog (types, matching, 111 movements, 18 contraindications, 7 stimulus tags — 85 tests green at `41faad1`). Revision 2 restarts at **Task D1**. Completed tasks are not repeated here: the code is the source of truth.

## Execution order

`D1 → D2 → D3 → D4 → D5` (domain data v2) → `E1 … E9` (engine, eval) → `E10` (corpus coverage pass; needs the user's corpus) → `S1 → S2` (database, auth) → `U1 → U2 → U3 → U3b → U4 → U4b → U5 → U6` (API, unrecognized-movement queue, UI, athlete-confirmed conditions) → `F1` (README, verification).

The engine and its evaluation come before auth and UI on purpose: the LLM loop is validated end-to-end (`pnpm eval`) before any screen exists.

## File structure (target)

```
data/
  movements.json              # Movement[] (one row per line)
  contraindications.json      # Contraindication[] (renamed from injury-contraindications.json)
  stimulus-taxonomy.json      # { qualities, energySystems, loadIntensities }
  conversions.json            # { effort, implementLoad }
  corpus/                     # PRIVATE real programming (gitignored)
evals/cases/*.json            # synthetic/public eval cases
scripts/
  lib/domain-json.mjs         # readRows/writeRows/fmt — keeps the data file style
  eval.ts                     # pnpm eval
  coverage.ts                 # pnpm coverage
  review-movements.ts         # pnpm review:movements (unrecognized-movement queue)
src/
  proxy.ts                    # Next 16 route protection (pages)
  lib/
    domain/
      types.ts                # Zod schemas: Movement, Contraindication, taxonomy, conversions, Side, Severity
      assess.ts               # assessMovement, matchesContraindication, ActiveCondition
      resolve.ts              # normalizeMovementName, createMovementResolver
      conversions.ts          # convertEffort
      repository.ts           # getDomainData (JSON, validated once)
    ai/
      provider.ts             # LlmProvider, StructuredOutputError, parseStructured
      retry.ts                # withValidationRetry
      fake-provider.ts        # FakeProvider, sequence()
      gemini-provider.ts      # the only @google/genai importer
      index.ts                # getProvider()
    engine/
      types.ts                # workout/stimulus/analysis/tailoring/profile/request/finding/pipeline schemas
      render-text.ts          # manual workout → text
      resolve-blocks.ts       # attach canonical names to components
      analyze.ts              # analyzePaste, analyzeManual, analyzeSituation
      conditions.ts           # activateConditions, hydrateConditions
      plan.ts                 # availableEquipment, planComponents, goalFamily
      tailor.ts               # buildTailorPrompt, tailor
      validate.ts             # validateTailoring
      pipeline.ts             # runTailorPipeline, runRefinePipeline, EngineUnsafeError
    eval/grade.ts             # EvalCaseSchema, gradeCase
    db.ts                     # Prisma client + toJson
    auth.ts                   # Better Auth server instance
    auth-client.ts            # Better Auth React client
    session.ts                # getUserId()
    profile.ts                # normalizeProfile, sanitizeProfile
    quota.ts                  # consumeQuota, prismaQuotaStore
    engine-stream.ts          # engineStreamResponse, readEngineStream, EngineEvent
    api-schemas.ts            # request bodies for the engine/save routes
    tailor-service.ts         # loadProfile
    unrecognized.ts           # collectUnrecognized, recordUnrecognized, newlyResolved
    unrecognized-store.ts     # prismaUnrecognizedStore
  app/
    layout.tsx, page.tsx, signin/page.tsx
    profile/page.tsx + ProfileForm.tsx
    tailor/page.tsx + TailorClient.tsx + ManualEntryForm.tsx + ResultView.tsx
    history/page.tsx
    api/auth/[...all]/route.ts
    api/profile/route.ts
    api/tailor/route.ts, api/tailor/refine/route.ts, api/tailor/save/route.ts
  components/WorkoutView.tsx, SignOutButton.tsx
tests/                        # mirrors src/
```

---

## Phase D — Domain data v2

### Task D1: Domain schema v2 and tiered assessment (behavior-preserving)

Introduces the v2 vocabulary (new sites, positions, stress `load`, `unilateral`, tiered contraindications with `kind`) and replaces `matching.ts` with `assess.ts`. The data is migrated mechanically — every existing rule becomes `tier: "avoid"` — so every existing data test keeps its meaning.

**Files:**
- Create: `scripts/lib/domain-json.mjs`, `src/lib/domain/assess.ts`, `tests/domain/assess.test.ts`
- Modify: `src/lib/domain/types.ts`, `tests/domain/types.test.ts`, `tests/domain/data.test.ts`
- Rename: `data/injury-contraindications.json` → `data/contraindications.json` (content migrated)
- Delete: `src/lib/domain/matching.ts`

**Interfaces:**
- Produces (`@/lib/domain/types`): `Equipment`, `Position` (+`supine`, `prone`), `Site` (+`abdominals`, `grip`), `UPPER_LIMB_SITES`, `LOWER_LIMB_SITES`, `StressLoad`, `SiteStressSchema` (`load` default `"high"`), `Limb`, `MovementSchema` (`unilateral` default `null`), `Tier`, `ContraindicationKind`, `ContraindicationSchema` / `Contraindication`, `Side`, `Severity`, `StimulusDefSchema` (unchanged).
- Produces (`@/lib/domain/assess`): `type Verdict = "ok" | "caution" | "avoid"`, `interface ActiveCondition { contraindication: Contraindication; side: Side | null; severity: Severity }`, `interface AssessmentReason { conditionKey: string; verdict: "caution" | "avoid"; detail: string; healthySideOnly: boolean }`, `interface Assessment { verdict: Verdict; reasons: AssessmentReason[] }`, `worstVerdict(a, b)`, `effectiveVerdict(tier, load, severity, kind)`, `assessMovement(movement, active): Assessment`, `matchesContraindication(movement, contraindication): boolean`.
- Produces (`scripts/lib/domain-json.mjs`): `fmt(value)`, `readRows(path)`, `writeRows(path, rows)`.

- [ ] **Step 1: Create the data-file formatter `scripts/lib/domain-json.mjs`**

```js
// Reads and writes the domain JSON files in their committed style: a top-level
// array with one compact row per line ("{ "k": v, ... }"). Every data migration
// goes through writeRows so diffs stay one line per changed row.
import fs from "node:fs";

export const fmt = (v) =>
  Array.isArray(v)
    ? `[${v.map(fmt).join(", ")}]`
    : v && typeof v === "object"
      ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(", ")} }`
      : JSON.stringify(v);

export function readRows(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function writeRows(path, rows) {
  fs.writeFileSync(path, `[\n${rows.map((r) => `  ${fmt(r)}`).join(",\n")}\n]\n`);
}
```

- [ ] **Step 2: Verify the formatter round-trips the current files byte-for-byte**

Run:
```bash
node --input-type=module -e "import { readRows, writeRows } from './scripts/lib/domain-json.mjs'; for (const f of ['data/movements.json','data/injury-contraindications.json','data/stimulus-taxonomy.json']) writeRows(f, readRows(f));"
git status --short data/
```
Expected: no output from `git status` (files unchanged). If a file shows as modified, the formatter is wrong — fix it before continuing.

- [ ] **Step 3: Write the failing assessment test `tests/domain/assess.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { MovementSchema, ContraindicationSchema, type Contraindication } from "@/lib/domain/types";
import { assessMovement, effectiveVerdict, matchesContraindication, worstVerdict } from "@/lib/domain/assess";

const injury = (rules: Contraindication["rules"], extra: Partial<Contraindication> = {}) =>
  ContraindicationSchema.parse({
    key: "test_injury", label: "Test injury", kind: "injury", rules,
    positionRules: [], avoidMovements: [], notes: null, ...extra,
  });

const squat = MovementSchema.parse({
  name: "Back Squat", patterns: ["squat"], positions: [],
  stresses: [{ site: "knee", mechanisms: ["deep_flexion", "compression"] }],
  equipment: ["barbell"], skill: "beginner", substitutes: [],
});
const airSquat = MovementSchema.parse({
  name: "Air Squat", patterns: ["squat"], positions: [],
  stresses: [{ site: "knee", mechanisms: ["deep_flexion"], load: "low" }],
  equipment: [], skill: "beginner", substitutes: [],
});
const dbPress = MovementSchema.parse({
  name: "Dumbbell Shoulder Press", patterns: ["vertical_push"], positions: [],
  stresses: [{ site: "shoulder", mechanisms: ["overhead"] }],
  equipment: ["dumbbell"], skill: "beginner", substitutes: [], unilateral: "upper",
});
const dbSnatch = MovementSchema.parse({
  name: "Dumbbell Snatch", patterns: ["hinge"], positions: [],
  stresses: [{ site: "lumbar", mechanisms: ["ballistic"] }, { site: "shoulder", mechanisms: ["overhead", "ballistic"] }],
  equipment: ["dumbbell"], skill: "intermediate", substitutes: [], unilateral: "upper",
});
const hang = MovementSchema.parse({
  name: "Dead Hang", patterns: ["hold"], positions: ["hanging"], stresses: [],
  equipment: ["pullup_bar"], skill: "beginner", substitutes: [],
});

const kneeAvoid = injury([{ site: "knee", mechanisms: ["deep_flexion"], tier: "avoid" }]);
const shoulderAvoid = injury([{ site: "shoulder", mechanisms: ["overhead"], tier: "avoid" }]);
const lumbarAvoid = injury([{ site: "lumbar", mechanisms: ["ballistic"], tier: "avoid" }]);

describe("schema defaults", () => {
  it("defaults stress load to high and unilateral to null", () => {
    expect(squat.stresses[0].load).toBe("high");
    expect(squat.unilateral).toBeNull();
  });

  it("rejects a contraindication without a kind", () => {
    expect(() => ContraindicationSchema.parse({
      key: "x", label: "X", rules: [], positionRules: [], avoidMovements: [],
    })).toThrow();
  });
});

describe("effectiveVerdict", () => {
  it("follows the severity table for injuries", () => {
    expect(effectiveVerdict("avoid", "high", "mild", "injury")).toBe("caution");
    expect(effectiveVerdict("avoid", "high", "moderate", "injury")).toBe("avoid");
    expect(effectiveVerdict("avoid", "low", "mild", "injury")).toBe("ok");
    expect(effectiveVerdict("avoid", "low", "moderate", "injury")).toBe("caution");
    expect(effectiveVerdict("avoid", "low", "acute", "injury")).toBe("avoid");
    expect(effectiveVerdict("caution", "high", "moderate", "injury")).toBe("caution");
    expect(effectiveVerdict("caution", "high", "acute", "injury")).toBe("avoid");
    expect(effectiveVerdict("caution", "low", "moderate", "injury")).toBe("ok");
    expect(effectiveVerdict("caution", "low", "acute", "injury")).toBe("caution");
  });

  it("uses the moderate column for limitations and conditions", () => {
    expect(effectiveVerdict("avoid", "high", "mild", "limitation")).toBe("avoid");
    expect(effectiveVerdict("avoid", "low", "acute", "condition")).toBe("caution");
  });
});

describe("assessMovement", () => {
  it("is ok with no active conditions", () => {
    expect(assessMovement(squat, [])).toEqual({ verdict: "ok", reasons: [] });
  });

  it("scales a low-load stress with severity", () => {
    expect(assessMovement(airSquat, [{ contraindication: kneeAvoid, side: null, severity: "mild" }]).verdict).toBe("ok");
    expect(assessMovement(airSquat, [{ contraindication: kneeAvoid, side: null, severity: "moderate" }]).verdict).toBe("caution");
    expect(assessMovement(airSquat, [{ contraindication: kneeAvoid, side: null, severity: "acute" }]).verdict).toBe("avoid");
  });

  it("reports the matched site and shared mechanisms", () => {
    const a = assessMovement(squat, [{ contraindication: kneeAvoid, side: null, severity: "moderate" }]);
    expect(a.verdict).toBe("avoid");
    expect(a.reasons).toEqual([
      { conditionKey: "test_injury", verdict: "avoid", detail: "knee: deep_flexion", healthySideOnly: false },
    ]);
  });

  it("applies a position rule tier as written", () => {
    const noHang = ContraindicationSchema.parse({
      key: "no_hanging", label: "No hanging", kind: "limitation", rules: [],
      positionRules: [{ position: "hanging", tier: "avoid" }], avoidMovements: [], notes: null,
    });
    expect(assessMovement(hang, [{ contraindication: noHang, side: null, severity: "mild" }]).verdict).toBe("avoid");
  });

  it("blocks an explicitly listed movement", () => {
    const explicit = injury([], { avoidMovements: ["Dead Hang"] });
    expect(assessMovement(hang, [{ contraindication: explicit, side: null, severity: "moderate" }]).verdict).toBe("avoid");
  });

  it("lets a one-sided limb injury train the healthy side of a unilateral movement", () => {
    const a = assessMovement(dbPress, [{ contraindication: shoulderAvoid, side: "right", severity: "moderate" }]);
    expect(a.verdict).toBe("caution");
    expect(a.reasons[0].healthySideOnly).toBe(true);
  });

  it("gives no laterality exemption without a side or for both sides", () => {
    expect(assessMovement(dbPress, [{ contraindication: shoulderAvoid, side: null, severity: "moderate" }]).verdict).toBe("avoid");
    expect(assessMovement(dbPress, [{ contraindication: shoulderAvoid, side: "both", severity: "moderate" }]).verdict).toBe("avoid");
  });

  it("never exempts an axial site", () => {
    const a = assessMovement(dbSnatch, [{ contraindication: lumbarAvoid, side: "left", severity: "moderate" }]);
    expect(a.verdict).toBe("avoid");
  });

  it("takes the worst verdict across conditions", () => {
    const a = assessMovement(dbSnatch, [
      { contraindication: shoulderAvoid, side: "left", severity: "moderate" },
      { contraindication: lumbarAvoid, side: null, severity: "moderate" },
    ]);
    expect(a.verdict).toBe("avoid");
    expect(a.reasons.map((r) => r.verdict).sort()).toEqual(["avoid", "caution"]);
  });
});

describe("helpers", () => {
  it("worstVerdict ranks avoid over caution over ok", () => {
    expect(worstVerdict("ok", "caution")).toBe("caution");
    expect(worstVerdict("avoid", "caution")).toBe("avoid");
  });

  it("matchesContraindication means avoid at moderate severity with no side", () => {
    expect(matchesContraindication(squat, kneeAvoid)).toBe(true);
    expect(matchesContraindication(airSquat, kneeAvoid)).toBe(false);
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm exec vitest run tests/domain/assess.test.ts`
Expected: FAIL — `@/lib/domain/assess` not found / `ContraindicationSchema` not exported.

- [ ] **Step 5: Rewrite `src/lib/domain/types.ts`**

Replace the file with:

```ts
import { z } from "zod";

export const SkillLevel = z.enum(["beginner", "intermediate", "advanced"]);
export type SkillLevel = z.infer<typeof SkillLevel>;

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
  "rope",      // climbing rope
  "jump_rope",
  "rower",
  "ski_erg",   // upper-body pull ergometer (e.g. SkiErg)
  "bike",      // heavy flywheel cycle-ergometer, legs only (e.g. BikeErg)
  "air_bike",  // fan bike, arms and legs (e.g. Assault/Echo Bike)
  "wall_ball",
  "sandbag",
  "d_ball",    // dead ball: heavy non-bouncing ball, distinct from the light wall_ball
]);
export type Equipment = z.infer<typeof Equipment>;

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
export type MovementPattern = z.infer<typeof MovementPattern>;

export const Position = z.enum([
  "hanging",           // suspended from a bar or rings
  "inverted",          // bodyweight fully on the hands
  "partial_inversion", // head below the hips, load shared with the feet on a surface
  "supine",            // lying on the back under load or effort (bench, sit-up)
  "prone",             // chest/belly to the floor (burpee family, wall walk start)
]);
export type Position = z.infer<typeof Position>;

export const Site = z.enum([
  // joints & spine
  "shoulder", "elbow", "wrist", "neck", "lumbar", "hip", "knee", "ankle",
  // muscle groups
  "quads", "hamstrings", "calves", "hip_flexors", "chest", "biceps", "lats", "triceps", "abdominals",
  // hands & forearms: hanging traction, kipping friction, heavy carries
  "grip",
]);
export type Site = z.infer<typeof Site>;

// Limb groups for the laterality exemption; axial sites (neck, lumbar, abdominals) belong to neither.
export const UPPER_LIMB_SITES = ["shoulder", "elbow", "wrist", "grip", "chest", "biceps", "lats", "triceps"] as const satisfies readonly Site[];
export const LOWER_LIMB_SITES = ["hip", "knee", "ankle", "quads", "hamstrings", "calves", "hip_flexors"] as const satisfies readonly Site[];

// Clinically significant (loaded or forceful) stress only, so load is implied and
// a site merely participating in a movement is not listed.
export const StressMechanism = z.enum([
  "compression",
  "flexion",        // through mid-range
  "deep_flexion",   // end-range (a site gets flexion OR deep_flexion, never both)
  "extension",      // held extended under load (front rack, push-up wrist)
  "deep_extension", // end-range (a site gets extension OR deep_extension, never both)
  "overhead",
  "ballistic",      // explosive, high-velocity
  "impact",
  "traction",       // hanging/distraction
  "kipping",        // dynamic swinging while hanging
  "eccentric",      // forceful lengthening, or loading at long muscle length
]);
export type StressMechanism = z.infer<typeof StressMechanism>;

// "high" = clinically significant; "low" = the same mechanism at bodyweight/unloaded.
export const StressLoad = z.enum(["high", "low"]);
export type StressLoad = z.infer<typeof StressLoad>;

export const SiteStressSchema = z.object({
  site: Site,
  mechanisms: z.array(StressMechanism).min(1),
  load: StressLoad.default("high"),
});
export type SiteStress = z.infer<typeof SiteStressSchema>;

export const Limb = z.enum(["upper", "lower"]);
export type Limb = z.infer<typeof Limb>;

export const MovementSchema = z.object({
  name: z.string().min(1),
  patterns: z.array(MovementPattern).min(1),
  positions: z.array(Position),
  stresses: z.array(SiteStressSchema),
  equipment: z.array(Equipment),
  skill: SkillLevel,
  substitutes: z.array(z.string()),
  // Ingestion synonyms: shorthand a pasted workout may use for this movement.
  aliases: z.array(z.string()).default([]),
  // A standard single-limb variant keeps the stresses on the working side only.
  unilateral: Limb.nullable().default(null),
});
export type Movement = z.infer<typeof MovementSchema>;

export const Tier = z.enum(["avoid", "caution"]);
export type Tier = z.infer<typeof Tier>;

// injury: severity-scaled; limitation/condition: tiers apply as written.
export const ContraindicationKind = z.enum(["injury", "limitation", "condition"]);
export type ContraindicationKind = z.infer<typeof ContraindicationKind>;

export const StressRuleSchema = z.object({
  site: Site,
  mechanisms: z.array(StressMechanism).min(1),
  tier: Tier,
});
export type StressRule = z.infer<typeof StressRuleSchema>;

export const PositionRuleSchema = z.object({ position: Position, tier: Tier });
export type PositionRule = z.infer<typeof PositionRuleSchema>;

export const ContraindicationSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: ContraindicationKind,
  rules: z.array(StressRuleSchema),
  positionRules: z.array(PositionRuleSchema),
  // Escape hatch: each use signals a mechanism the vocabulary is missing.
  avoidMovements: z.array(z.string()),
  notes: z.string().nullable().optional(),
});
export type Contraindication = z.infer<typeof ContraindicationSchema>;

export const Side = z.enum(["left", "right", "both"]);
export type Side = z.infer<typeof Side>;

export const Severity = z.enum(["mild", "moderate", "acute"]);
export type Severity = z.infer<typeof Severity>;

export const StimulusDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});
export type StimulusDef = z.infer<typeof StimulusDefSchema>;
```

- [ ] **Step 6: Create `src/lib/domain/assess.ts` and delete `src/lib/domain/matching.ts`**

```ts
import {
  LOWER_LIMB_SITES, UPPER_LIMB_SITES,
  type Contraindication, type ContraindicationKind, type Movement, type Severity,
  type Side, type Site, type StressLoad, type Tier,
} from "./types";

export type Verdict = "ok" | "caution" | "avoid";

export interface ActiveCondition {
  contraindication: Contraindication;
  side: Side | null;
  severity: Severity;
}

export interface AssessmentReason {
  conditionKey: string;
  verdict: Exclude<Verdict, "ok">;
  detail: string; // "knee: deep_flexion" | "position: hanging" | "explicit"
  healthySideOnly: boolean;
}

export interface Assessment {
  verdict: Verdict;
  reasons: AssessmentReason[];
}

const RANK: Record<Verdict, number> = { ok: 0, caution: 1, avoid: 2 };

export function worstVerdict(a: Verdict, b: Verdict): Verdict {
  return RANK[a] >= RANK[b] ? a : b;
}

// Spec "Assessment": rule tier × stress load × severity.
const TABLE: Record<Tier, Record<StressLoad, Record<Severity, Verdict>>> = {
  avoid: {
    high: { mild: "caution", moderate: "avoid", acute: "avoid" },
    low: { mild: "ok", moderate: "caution", acute: "avoid" },
  },
  caution: {
    high: { mild: "caution", moderate: "caution", acute: "avoid" },
    low: { mild: "ok", moderate: "ok", acute: "caution" },
  },
};

export function effectiveVerdict(
  tier: Tier, load: StressLoad, severity: Severity, kind: ContraindicationKind,
): Verdict {
  return TABLE[tier][load][kind === "injury" ? severity : "moderate"];
}

function limbOf(site: Site): "upper" | "lower" | null {
  if ((UPPER_LIMB_SITES as readonly Site[]).includes(site)) return "upper";
  if ((LOWER_LIMB_SITES as readonly Site[]).includes(site)) return "lower";
  return null;
}

export function assessMovement(movement: Movement, active: ActiveCondition[]): Assessment {
  const reasons: AssessmentReason[] = [];
  for (const { contraindication: c, side, severity } of active) {
    if (c.avoidMovements.includes(movement.name)) {
      reasons.push({ conditionKey: c.key, verdict: "avoid", detail: "explicit", healthySideOnly: false });
    }
    for (const rule of c.positionRules) {
      if (movement.positions.includes(rule.position)) {
        reasons.push({ conditionKey: c.key, verdict: rule.tier, detail: `position: ${rule.position}`, healthySideOnly: false });
      }
    }
    for (const stress of movement.stresses) {
      for (const rule of c.rules) {
        if (rule.site !== stress.site) continue;
        const shared = rule.mechanisms.filter((m) => stress.mechanisms.includes(m));
        if (shared.length === 0) continue;
        let verdict = effectiveVerdict(rule.tier, stress.load, severity, c.kind);
        if (verdict === "ok") continue;
        let healthySideOnly = false;
        if (
          verdict === "avoid" && (side === "left" || side === "right") &&
          movement.unilateral !== null && movement.unilateral === limbOf(stress.site)
        ) {
          verdict = "caution";
          healthySideOnly = true;
        }
        reasons.push({ conditionKey: c.key, verdict, detail: `${stress.site}: ${shared.join("/")}`, healthySideOnly });
      }
    }
  }
  return { verdict: reasons.reduce<Verdict>((v, r) => worstVerdict(v, r.verdict), "ok"), reasons };
}

/** Shorthand used by integrity tests: assessed "avoid" at moderate severity, no side. */
export function matchesContraindication(movement: Movement, contraindication: Contraindication): boolean {
  return assessMovement(movement, [{ contraindication, side: null, severity: "moderate" }]).verdict === "avoid";
}
```

```bash
git rm src/lib/domain/matching.ts
```

- [ ] **Step 7: Run the assessment test, verify it passes**

Run: `pnpm exec vitest run tests/domain/assess.test.ts`
Expected: PASS.

- [ ] **Step 8: Migrate the contraindication data**

```bash
git mv data/injury-contraindications.json data/contraindications.json
```

Create `scripts/migrations/d1-contraindications.mjs`:

```js
import { readRows, writeRows } from "../lib/domain-json.mjs";

const LIMITATIONS = new Set(["no_hanging", "no_inversion"]);
const rows = readRows("data/contraindications.json").map((c) => ({
  key: c.injuryKey,
  label: c.label,
  kind: LIMITATIONS.has(c.injuryKey) ? "limitation" : "injury",
  rules: c.avoidStresses.map((r) => ({ site: r.site, mechanisms: r.mechanisms, tier: "avoid" })),
  positionRules: c.avoidPositions.map((p) => ({ position: p, tier: "avoid" })),
  avoidMovements: c.avoidMovements,
  notes: c.notes,
}));
writeRows("data/contraindications.json", rows);
```

Run, then delete the one-off script (the data diff is the record):
```bash
node scripts/migrations/d1-contraindications.mjs
rm scripts/migrations/d1-contraindications.mjs
```

- [ ] **Step 9: Update `tests/domain/types.test.ts`**

Change the imports at the top to:
```ts
import { describe, it, expect } from "vitest";
import { MovementSchema, ContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/assess";
```

Replace the test `it("validates an injury contraindication and stimulus def", ...)` with:
```ts
  it("validates a contraindication and stimulus def", () => {
    expect(
      ContraindicationSchema.parse({
        key: "shoulder_impingement", label: "Shoulder impingement", kind: "injury",
        rules: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"], tier: "avoid" }],
        positionRules: [], avoidMovements: [], notes: null,
      }).key
    ).toBe("shoulder_impingement");
    expect(
      StimulusDefSchema.parse({ key: "aerobic_capacity", label: "Aerobic capacity", description: "Sustained..." }).key
    ).toBe("aerobic_capacity");
  });
```

In `describe("matchesContraindication", ...)`, replace the two fixtures `overheadInjury` and `noInversion` with:
```ts
  const overheadInjury = ContraindicationSchema.parse({
    key: "shoulder_impingement", label: "Shoulder impingement", kind: "injury",
    rules: [{ site: "shoulder", mechanisms: ["overhead", "ballistic"], tier: "avoid" }],
    positionRules: [], avoidMovements: ["Bench Press"], notes: null,
  });
  const noInversion = ContraindicationSchema.parse({
    key: "no_inversion", label: "Unable to go inverted", kind: "limitation",
    rules: [], positionRules: [{ position: "inverted", tier: "avoid" }], avoidMovements: [], notes: null,
  });
```
(The five `it(...)` cases in that block stay unchanged.)

- [ ] **Step 10: Update `tests/domain/data.test.ts`**

1. Imports and parsing (top of file):
```ts
import { describe, it, expect } from "vitest";
import movementsJson from "../../data/movements.json";
import contraindicationsJson from "../../data/contraindications.json";
import stimuli from "../../data/stimulus-taxonomy.json";
import { MovementSchema, ContraindicationSchema, StimulusDefSchema } from "@/lib/domain/types";
import type { Movement } from "@/lib/domain/types";
import { matchesContraindication } from "@/lib/domain/assess";

const movements = movementsJson.map((m) => MovementSchema.parse(m));
const injuries = contraindicationsJson.map((i) => ContraindicationSchema.parse(i));
```
2. Replace every `.injuryKey` with `.key` (5 places: the explicit-override test, the `injury()` helper, the lunge, plank and five-movements tests).
3. In `it("every site annotated on a movement is blocked by some contraindication", ...)` replace the `blockedSites` line with:
```ts
    const blockedSites = new Set(
      injuries.flatMap((i) => i.rules.filter((r) => r.tier === "avoid").map((r) => r.site))
    );
```
4. In `it("the farmer carry is a loaded carry with a per-implement row", ...)` the parsed stresses now carry the `load` default:
```ts
      expect(m.stresses).toEqual([{ site: "lumbar", mechanisms: ["compression"], load: "high" }]);
```

- [ ] **Step 11: Run the full suite, verify green**

Run: `pnpm test`
Expected: PASS — every previous test plus `assess.test.ts`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: domain schema v2 with tiered, severity-aware contraindication assessment"
```

---

### Task D2: Annotate grip, abdominals, lying positions, low-load stresses and laterality; add caution rules and new entries

**Files:**
- Modify: `data/movements.json`, `data/contraindications.json` (via a one-off script)
- Test: `tests/domain/data.test.ts` (extend + one assertion updated)

**Interfaces:**
- Consumes: `assessMovement`, `matchesContraindication`, `ActiveCondition` (Task D1).
- Produces: contraindication keys `hand_tear`, `abdominal_strain` (kind `injury`), `pregnancy` (kind `condition`) — 21 entries total.

- [ ] **Step 1: Write the failing tests**

In `tests/domain/data.test.ts`:

1. Add to the imports:
```ts
import { assessMovement } from "@/lib/domain/assess";
import type { Severity, Side } from "@/lib/domain/types";
```
2. In `it("the farmer carry is a loaded carry with a per-implement row", ...)` replace the stresses assertion with:
```ts
      expect(m.stresses).toEqual([
        { site: "lumbar", mechanisms: ["compression"], load: "high" },
        { site: "grip", mechanisms: ["traction"], load: "high" },
      ]);
```
3. In `it("no_inversion blocks partially inverted movements, not only full inversion", ...)` replace `expect(wallClimb.positions).toEqual(["partial_inversion"]);` with:
```ts
    expect(wallClimb.positions).toContain("partial_inversion");
```
4. Append at the end of the file:
```ts
describe("v2 annotations", () => {
  function condition(key: string) {
    const c = injuries.find((x) => x.key === key);
    if (!c) throw new Error(`contraindication not found: ${key}`);
    return c;
  }
  const verdict = (name: string, key: string, severity: Severity = "moderate", side: Side | null = null) =>
    assessMovement(byName(name), [{ contraindication: condition(key), side, severity }]);

  it("every hanging movement loads the grip", () => {
    for (const m of movements.filter((mv) => mv.positions.includes("hanging"))) {
      expect(m.stresses.some((s) => s.site === "grip"), m.name).toBe(true);
    }
  });

  it("trunk-flexion core work loads the abdominals", () => {
    for (const name of ["Sit-up", "V-up", "GHD Sit-up", "Toes-to-Bar", "Toes-to-Ring", "Knees-to-Elbows", "Hanging Knee Raise"]) {
      expect(byName(name).stresses.some((s) => s.site === "abdominals" && s.mechanisms.includes("flexion")), name).toBe(true);
    }
  });

  it("lying positions are annotated", () => {
    for (const name of ["Bench Press", "Dumbbell Bench Press", "Sit-up", "V-up", "GHD Sit-up"]) {
      expect(byName(name).positions, name).toContain("supine");
    }
    for (const name of ["Burpee", "Devil Press", "Up-Down", "Wall Climb"]) {
      expect(byName(name).positions, name).toContain("prone");
    }
  });

  it("the catalog has 21 entries with the expected kinds", () => {
    expect(injuries).toHaveLength(21);
    expect(injuries.filter((c) => c.kind === "limitation").map((c) => c.key).sort()).toEqual(["no_hanging", "no_inversion"]);
    expect(injuries.filter((c) => c.kind === "condition").map((c) => c.key)).toEqual(["pregnancy"]);
  });

  it("hand_tear blocks kipping on the bar and only cautions strict hanging", () => {
    expect(matchesContraindication(byName("Pull-up"), condition("hand_tear"))).toBe(true);
    expect(verdict("Dead Hang", "hand_tear").verdict).toBe("caution");
    expect(verdict("Ring Row", "hand_tear").verdict).toBe("ok");
  });

  it("abdominal_strain blocks trunk flexion and spares the plank", () => {
    for (const name of ["Sit-up", "GHD Sit-up", "Toes-to-Bar"]) {
      expect(matchesContraindication(byName(name), condition("abdominal_strain")), name).toBe(true);
    }
    expect(verdict("Plank", "abdominal_strain").verdict).toBe("ok");
  });

  it("pregnancy avoids inversion and trunk flexion, and cautions lying positions and impact", () => {
    expect(verdict("Handstand Push-up", "pregnancy").verdict).toBe("avoid");
    expect(verdict("Sit-up", "pregnancy").verdict).toBe("avoid");
    expect(verdict("Bench Press", "pregnancy").verdict).toBe("caution");
    expect(verdict("Burpee", "pregnancy").verdict).toBe("caution");
    expect(verdict("Plank", "pregnancy").verdict).toBe("ok");
    expect(condition("pregnancy").notes).toMatch(/healthcare provider/);
  });

  it("knee pain severity scales the bodyweight and the loaded squat", () => {
    expect(verdict("Air Squat", "knee_pain", "mild").verdict).toBe("ok");
    expect(verdict("Air Squat", "knee_pain", "moderate").verdict).toBe("caution");
    expect(verdict("Air Squat", "knee_pain", "acute").verdict).toBe("avoid");
    expect(verdict("Back Squat", "knee_pain", "mild").verdict).toBe("caution");
    expect(verdict("Back Squat", "knee_pain", "moderate").verdict).toBe("avoid");
  });

  it("a one-sided shoulder injury leaves single-arm dumbbell work for the healthy side", () => {
    const a = verdict("Dumbbell Shoulder Press", "shoulder_impingement", "moderate", "right");
    expect(a.verdict).toBe("caution");
    expect(a.reasons.every((r) => r.healthySideOnly)).toBe(true);
    expect(verdict("Shoulder Press", "shoulder_impingement", "moderate", "right").verdict).toBe("avoid");
    expect(verdict("Dumbbell Shoulder Press", "shoulder_impingement").verdict).toBe("avoid");
  });

  it("laterality never exempts the spine", () => {
    expect(verdict("Dumbbell Snatch", "lower_back_strain", "moderate", "left").verdict).toBe("avoid");
  });

  it("limitations ignore severity", () => {
    expect(verdict("Pull-up", "no_hanging", "mild").verdict).toBe("avoid");
  });

  it("unilateral twins match", () => {
    for (const m of movements.filter((mv) => mv.name.startsWith("Kettlebell "))) {
      const twin = movements.find((mv) => mv.name === "Dumbbell " + m.name.slice("Kettlebell ".length));
      if (twin) expect(m.unilateral, m.name).toBe(twin.unilateral);
    }
    expect(byName("Dumbbell Snatch").unilateral).toBe("upper");
    expect(byName("Step-up").unilateral).toBe("lower");
    expect(byName("Thruster").unilateral).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/domain/data.test.ts`
Expected: FAIL — the farmer carry, grip, abdominals, positions, catalog size and contraindication tests fail.

- [ ] **Step 3: Write and run the migration**

Create `scripts/migrations/d2-annotations.mjs`:

```js
import { readRows, writeRows } from "../lib/domain-json.mjs";

// ---- movements ----
const movements = readRows("data/movements.json");
const byName = new Map(movements.map((m) => [m.name, m]));
const get = (name) => {
  const m = byName.get(name);
  if (!m) throw new Error(`missing movement: ${name}`);
  return m;
};
const addStress = (name, site, mechanisms, load) =>
  get(name).stresses.push(load ? { site, mechanisms, load } : { site, mechanisms });
const addPosition = (name, position) => {
  const m = get(name);
  if (!m.positions.includes(position)) m.positions.push(position);
};
const addAlias = (name, alias) => {
  const m = get(name);
  m.aliases = [...(m.aliases ?? []), alias];
};
const setUnilateral = (name, limb) => {
  get(name).unilateral = limb;
};

// grip: kipping on a bar/rings tears hands; hanging and heavy carries load it statically
for (const n of ["Pull-up", "Chest-to-Bar", "Bar Muscle-up", "Ring Muscle-up", "Toes-to-Bar", "Toes-to-Ring", "Knees-to-Elbows"]) {
  addStress(n, "grip", ["traction", "kipping"]);
}
for (const n of ["Rope Climb", "Legless Rope Climb", "Banded Pull-up", "Dead Hang", "Hanging Knee Raise", "Dumbbell Farmer Carry", "Kettlebell Farmer Carry"]) {
  addStress(n, "grip", ["traction"]);
}

// abdominals: forceful trunk flexion; the GHD also loads them at length
for (const n of ["Sit-up", "V-up", "Toes-to-Bar", "Toes-to-Ring", "Knees-to-Elbows", "Hanging Knee Raise"]) {
  addStress(n, "abdominals", ["flexion"]);
}
addStress("GHD Sit-up", "abdominals", ["flexion", "eccentric"]);

// lying positions
for (const n of ["Bench Press", "Dumbbell Bench Press", "Sit-up", "V-up", "GHD Sit-up"]) addPosition(n, "supine");
for (const n of ["Burpee", "Devil Press", "Up-Down", "Wall Climb"]) addPosition(n, "prone");

// low-load stresses on bodyweight movements (matter at higher severities)
addStress("Air Squat", "knee", ["deep_flexion"], "low");
addStress("Air Squat", "hip", ["deep_flexion"], "low");
addStress("Box Squat", "knee", ["flexion"], "low");
addStress("Box Squat", "hip", ["flexion"], "low");
addStress("Lunge", "knee", ["flexion"], "low");
addStress("Lunge", "quads", ["eccentric"], "low");
addStress("Step-up", "knee", ["flexion"], "low");
addStress("Up-Down", "knee", ["impact"], "low");
addStress("Up-Down", "ankle", ["impact"], "low");

// laterality: a standard single-limb variant exists
for (const n of [
  "Dumbbell Snatch", "Kettlebell Snatch", "Dumbbell Shoulder Press", "Kettlebell Shoulder Press",
  "Dumbbell Push Press", "Kettlebell Push Press", "Dumbbell Push Jerk", "Kettlebell Push Jerk",
  "Dumbbell Overhead Hold", "Kettlebell Overhead Hold", "Dumbbell Clean", "Kettlebell Clean",
  "Dumbbell Bench Press", "Dumbbell Farmer Carry", "Kettlebell Farmer Carry",
]) setUnilateral(n, "upper");
setUnilateral("Step-up", "lower");

// aliases
addAlias("Wall Climb", "Wall Walk");
addAlias("Pull-up", "Kipping Pull-up");
addAlias("Pull-up", "Butterfly Pull-up");

writeRows("data/movements.json", movements);

// ---- contraindications ----
const conditions = readRows("data/contraindications.json");
const getC = (key) => {
  const c = conditions.find((x) => x.key === key);
  if (!c) throw new Error(`missing contraindication: ${key}`);
  return c;
};
const caution = (key, site, mechanisms) => getC(key).rules.push({ site, mechanisms, tier: "caution" });

caution("shoulder_impingement", "shoulder", ["traction"]);
caution("lower_back_strain", "lumbar", ["flexion"]);
caution("knee_pain", "knee", ["flexion", "compression"]);
caution("elbow_tendinopathy", "elbow", ["traction"]);
caution("hip_impingement", "hip", ["flexion"]);

const handTear = {
  key: "hand_tear", label: "Torn or blistered palms", kind: "injury",
  rules: [
    { site: "grip", mechanisms: ["kipping"], tier: "avoid" },
    { site: "grip", mechanisms: ["traction"], tier: "caution" },
  ],
  positionRules: [], avoidMovements: [],
  notes: "Avoid kipping on a bar or rings, where friction reopens the tear; strict hanging and heavy carries as tolerated, taped or with grips.",
};
const abdominalStrain = {
  key: "abdominal_strain", label: "Abdominal strain", kind: "injury",
  rules: [{ site: "abdominals", mechanisms: ["flexion", "eccentric"], tier: "avoid" }],
  positionRules: [], avoidMovements: [],
  notes: "Avoid forceful trunk flexion and loading the abdominals at length (sit-ups, toes-to-bar, GHD); bracing holds such as the plank are acceptable as tolerated.",
};
const pregnancy = {
  key: "pregnancy", label: "Pregnancy", kind: "condition",
  rules: [
    { site: "abdominals", mechanisms: ["flexion", "eccentric"], tier: "avoid" },
    { site: "knee", mechanisms: ["impact"], tier: "caution" },
    { site: "ankle", mechanisms: ["impact"], tier: "caution" },
    { site: "lumbar", mechanisms: ["compression"], tier: "caution" },
  ],
  positionRules: [
    { position: "inverted", tier: "avoid" },
    { position: "partial_inversion", tier: "caution" },
    { position: "supine", tier: "caution" },
    { position: "prone", tier: "caution" },
  ],
  avoidMovements: [],
  notes: "Conservative defaults only: no loaded trunk flexion or full inversion; lying positions, impact and heavy axial loading with caution. Always follow the athlete's healthcare provider.",
};
const firstLimitation = conditions.findIndex((c) => c.kind === "limitation");
conditions.splice(firstLimitation, 0, handTear, abdominalStrain);
conditions.push(pregnancy);
writeRows("data/contraindications.json", conditions);
```

Run it and delete it:
```bash
node scripts/migrations/d2-annotations.mjs
rm scripts/migrations/d2-annotations.mjs
```

- [ ] **Step 4: Run the data tests, verify they pass**

Run: `pnpm exec vitest run tests/domain/data.test.ts`
Expected: PASS. If an earlier test now fails, the annotation changed a verdict it pins — read the failing assertion against the spec before touching data.

- [ ] **Step 5: Run the full suite and commit**

Run: `pnpm test` → all PASS.

```bash
git add -A
git commit -m "feat: annotate grip, abdominals, lying positions, low-load stresses and laterality; add hand tear, abdominal strain and pregnancy"
```

---

### Task D3: Strict variants and known-gap movements

Adds 15 rows: strict variants (strict and kipping are separate rows whenever both are programmed) and the most common movements missing from the catalog (the corpus pass in Task E10 finds the rest).

**Files:**
- Modify: `data/movements.json` (via a one-off script)
- Test: `tests/domain/data.test.ts` (extend)

**Interfaces:**
- Produces movement names used later by eval cases: `Strict Pull-up`, `Strict Chest-to-Bar`, `Strict Toes-to-Bar`, `Burpee Pull-up`, `Box Jump Over`, `Burpee Box Jump Over`, `Bar-facing Burpee`, `Hang Power Clean`, `Hang Squat Clean`, `Hang Power Snatch`, `Sumo Deadlift High Pull`, `Pistol`, `GHD Hip Extension`, `Dumbbell Row`, `Bent-over Row`.

- [ ] **Step 1: Write the failing tests** (append to `tests/domain/data.test.ts`)

```ts
describe("strict variants and known gaps", () => {
  const kips = (name: string) => byName(name).stresses.some((s) => s.mechanisms.includes("kipping"));
  const elbow = () => {
    const c = injuries.find((x) => x.key === "elbow_tendinopathy");
    if (!c) throw new Error("elbow_tendinopathy missing");
    return c;
  };

  it("kipping and strict variants are separate rows", () => {
    for (const [kipping, strict] of [
      ["Pull-up", "Strict Pull-up"], ["Chest-to-Bar", "Strict Chest-to-Bar"], ["Toes-to-Bar", "Strict Toes-to-Bar"],
    ]) {
      expect(kips(kipping), kipping).toBe(true);
      expect(kips(strict), strict).toBe(false);
      expect(byName(kipping).substitutes, kipping).toContain(strict);
    }
    expect(byName("Pull-up").substitutes[0]).toBe("Strict Pull-up");
  });

  it("an elbow tendinopathy keeps the strict pull-up and blocks the kipping one", () => {
    expect(matchesContraindication(byName("Pull-up"), elbow())).toBe(true);
    expect(matchesContraindication(byName("Strict Pull-up"), elbow())).toBe(false);
  });

  it("the burpee family starts prone", () => {
    for (const name of ["Burpee", "Burpee Pull-up", "Burpee Box Jump Over", "Bar-facing Burpee", "Devil Press", "Up-Down"]) {
      expect(byName(name).positions, name).toContain("prone");
    }
  });

  it("hang variants mirror their floor lifts", () => {
    expect(byName("Hang Power Clean").stresses).toEqual(byName("Power Clean").stresses);
    expect(byName("Hang Squat Clean").stresses).toEqual(byName("Squat Clean").stresses);
    expect(byName("Hang Power Snatch").stresses).toEqual(byName("Power Snatch").stresses);
  });

  it("the pistol is a single-leg deep squat", () => {
    const p = byName("Pistol");
    expect(p.unilateral).toBe("lower");
    expect(p.stresses.some((s) => s.site === "knee" && s.mechanisms.includes("deep_flexion") && s.load === "high")).toBe(true);
  });

  it("horizontal pulling has a bodyweight, dumbbell and barbell option", () => {
    expect(byName("Ring Row").substitutes).toEqual(["Dumbbell Row"]);
    expect(byName("Dumbbell Row").unilateral).toBe("upper");
    expect(byName("Bent-over Row").equipment).toEqual(["barbell"]);
    expect(movements.filter((m) => m.patterns[0] === "horizontal_pull")).toHaveLength(3);
  });

  it("the catalog has 126 movements", () => {
    expect(movements).toHaveLength(126);
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/domain/data.test.ts`
Expected: FAIL — `movement not found: Strict Pull-up` (and the others).

- [ ] **Step 3: Write and run the migration**

Create `scripts/migrations/d3-movements.mjs`:

```js
import { readRows, writeRows } from "../lib/domain-json.mjs";

const movements = readRows("data/movements.json");
const indexOf = (name) => {
  const i = movements.findIndex((m) => m.name === name);
  if (i < 0) throw new Error(`missing movement: ${name}`);
  return i;
};
const get = (name) => movements[indexOf(name)];
const insertAfter = (name, row) => movements.splice(indexOf(name) + 1, 0, row);
const stressesOf = (name) => structuredClone(get(name).stresses);
const s = (site, ...mechanisms) => ({ site, mechanisms });

insertAfter("Pull-up", {
  name: "Strict Pull-up", patterns: ["vertical_pull"], positions: ["hanging"],
  stresses: [s("shoulder", "traction"), s("elbow", "traction"), s("biceps", "eccentric"), s("grip", "traction")],
  equipment: ["pullup_bar"], skill: "intermediate", substitutes: ["Banded Pull-up", "Ring Row"],
});
insertAfter("Chest-to-Bar", {
  name: "Strict Chest-to-Bar", patterns: ["vertical_pull"], positions: ["hanging"],
  stresses: [s("shoulder", "traction"), s("elbow", "traction"), s("biceps", "eccentric"), s("grip", "traction")],
  equipment: ["pullup_bar"], skill: "advanced", substitutes: ["Strict Pull-up", "Banded Pull-up"], aliases: ["Strict C2B"],
});
insertAfter("Toes-to-Bar", {
  name: "Strict Toes-to-Bar", patterns: ["core"], positions: ["hanging"],
  stresses: [s("shoulder", "traction"), s("hip_flexors", "flexion"), s("lumbar", "flexion"), s("abdominals", "flexion"), s("grip", "traction")],
  equipment: ["pullup_bar"], skill: "advanced", substitutes: ["Hanging Knee Raise", "Sit-up"], aliases: ["Strict T2B"],
});
insertAfter("Ring Row", {
  name: "Dumbbell Row", patterns: ["horizontal_pull"], positions: [], stresses: [],
  equipment: ["dumbbell"], skill: "beginner", substitutes: ["Ring Row", "Bent-over Row"],
  aliases: ["DB Row", "Single-arm Dumbbell Row"], unilateral: "upper",
});
insertAfter("Dumbbell Row", {
  name: "Bent-over Row", patterns: ["horizontal_pull"], positions: [], stresses: [s("lumbar", "flexion")],
  equipment: ["barbell"], skill: "intermediate", substitutes: ["Dumbbell Row", "Ring Row"],
  aliases: ["Barbell Row", "Pendlay Row"],
});
insertAfter("Air Squat", {
  name: "Pistol", patterns: ["squat"], positions: [],
  stresses: [s("knee", "deep_flexion"), s("hip", "deep_flexion"), s("quads", "eccentric")],
  equipment: [], skill: "advanced", substitutes: ["Air Squat", "Lunge"],
  aliases: ["Pistol Squat", "Single-leg Squat"], unilateral: "lower",
});
insertAfter("Romanian Deadlift", {
  name: "GHD Hip Extension", patterns: ["hinge"], positions: ["prone"], stresses: [s("hamstrings", "eccentric")],
  equipment: ["ghd"], skill: "intermediate", substitutes: ["Romanian Deadlift", "Kettlebell Swing"], aliases: ["Hip Extension"],
});
insertAfter("Power Clean", {
  name: "Hang Power Clean", patterns: ["olympic", "hinge"], positions: [], stresses: stressesOf("Power Clean"),
  equipment: ["barbell"], skill: "intermediate", substitutes: ["Power Clean", "Dumbbell Clean", "Kettlebell Swing"], aliases: ["HPC"],
});
insertAfter("Power Snatch", {
  name: "Hang Power Snatch", patterns: ["olympic", "hinge"], positions: [], stresses: stressesOf("Power Snatch"),
  equipment: ["barbell"], skill: "advanced", substitutes: ["Power Snatch", "Dumbbell Snatch"], aliases: ["HPS"],
});
insertAfter("Squat Clean", {
  name: "Hang Squat Clean", patterns: ["olympic", "hinge", "squat"], positions: [], stresses: stressesOf("Squat Clean"),
  equipment: ["barbell"], skill: "advanced", substitutes: ["Hang Power Clean", "Squat Clean", "Front Squat"], aliases: ["Hang Clean", "HSC"],
});
insertAfter("Kettlebell Swing", {
  name: "Sumo Deadlift High Pull", patterns: ["hinge"], positions: [],
  stresses: [s("lumbar", "compression", "ballistic"), s("hamstrings", "ballistic"), s("shoulder", "ballistic")],
  equipment: ["barbell"], skill: "intermediate", substitutes: ["Kettlebell Swing", "Deadlift"], aliases: ["SDHP"],
});
const burpee = stressesOf("Burpee");
insertAfter("Burpee", {
  name: "Burpee Pull-up", patterns: ["vertical_pull", "jump", "horizontal_push"], positions: ["hanging", "prone"],
  stresses: [
    ...burpee,
    s("shoulder", "traction", "kipping"), s("elbow", "traction", "kipping"), s("biceps", "eccentric"),
    s("lats", "kipping", "eccentric"), s("grip", "traction", "kipping"),
  ],
  equipment: ["pullup_bar"], skill: "intermediate", substitutes: ["Burpee", "Pull-up"],
});
insertAfter("Burpee Pull-up", {
  name: "Bar-facing Burpee", patterns: ["jump", "horizontal_push"], positions: ["prone"], stresses: stressesOf("Burpee"),
  equipment: ["barbell"], skill: "beginner", substitutes: ["Burpee"], aliases: ["BFB"],
});
insertAfter("Box Jump", {
  name: "Box Jump Over", patterns: ["jump"], positions: [], stresses: stressesOf("Box Jump"),
  equipment: ["box"], skill: "intermediate", substitutes: ["Box Jump", "Step-up"], aliases: ["BJO"],
});
insertAfter("Box Jump Over", {
  name: "Burpee Box Jump Over", patterns: ["jump", "horizontal_push"], positions: ["prone"],
  stresses: [
    s("wrist", "extension", "impact"), s("knee", "impact", "ballistic"), s("ankle", "impact", "ballistic"),
    s("chest", "eccentric"), s("calves", "ballistic"), s("quads", "ballistic", "eccentric"),
  ],
  equipment: ["box"], skill: "intermediate", substitutes: ["Burpee", "Box Jump Over", "Step-up"], aliases: ["BBJO"],
});

get("Pull-up").substitutes = ["Strict Pull-up", ...get("Pull-up").substitutes];
get("Chest-to-Bar").substitutes = ["Strict Chest-to-Bar", ...get("Chest-to-Bar").substitutes];
get("Toes-to-Bar").substitutes = [...get("Toes-to-Bar").substitutes, "Strict Toes-to-Bar"];
get("Ring Row").substitutes = ["Dumbbell Row"];

writeRows("data/movements.json", movements);
```

```bash
node scripts/migrations/d3-movements.mjs
rm scripts/migrations/d3-movements.mjs
```

- [ ] **Step 4: Run the suite, verify green**

Run: `pnpm test`
Expected: PASS (all data invariants — grip on hanging rows, lats only with kipping, olympic only on barbell, KB/DB twins — hold for the new rows).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add strict variants and the most common missing movements"
```

---

### Task D4: Structured stimulus taxonomy and conversions

**Files:**
- Modify: `data/stimulus-taxonomy.json` (rewrite), `src/lib/domain/types.ts` (append), `tests/domain/data.test.ts` (replace the taxonomy test)
- Create: `data/conversions.json`, `src/lib/domain/conversions.ts`, `tests/domain/conversions.test.ts`

**Interfaces:**
- Produces (`@/lib/domain/types`): `StimulusTaxonomySchema` / `StimulusTaxonomy` (`{ qualities, energySystems, loadIntensities }: StimulusDef[]` each), `EffortUnit`, `EffortEquivalenceSchema`, `ImplementLoadSchema`, `ConversionsSchema` / `Conversions`.
- Produces (`@/lib/domain/conversions`): `convertEffort(conversions: Conversions, from: { movement: string; unit: EffortUnit; amount: number }, to: { movement: string; unit: EffortUnit }, sex: "male" | "female" | null): number | null`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/conversions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import conversionsJson from "../../data/conversions.json";
import movementsJson from "../../data/movements.json";
import { ConversionsSchema } from "@/lib/domain/types";
import { convertEffort } from "@/lib/domain/conversions";

const conversions = ConversionsSchema.parse(conversionsJson);
const names = new Set(movementsJson.map((m) => m.name));

describe("conversions data", () => {
  it("every equivalent names a real movement, once per unit", () => {
    for (const group of conversions.effort) {
      const seen = new Set<string>();
      for (const e of group.equivalents) {
        expect(names.has(e.movement), e.movement).toBe(true);
        const id = `${e.movement}/${e.unit}`;
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
  });

  it("implement load fractions are ordered ranges below 1", () => {
    for (const r of conversions.implementLoad) {
      expect(r.perHandFraction.low).toBeLessThanOrEqual(r.perHandFraction.high);
      expect(r.perHandFraction.high).toBeLessThan(1);
    }
  });
});

describe("convertEffort", () => {
  it("converts a run distance to rowing meters", () => {
    expect(convertEffort(conversions, { movement: "Run", unit: "meters", amount: 400 }, { movement: "Row (Erg)", unit: "meters" }, "male")).toBe(500);
  });

  it("uses the sex-specific amount and rounds calories to integers", () => {
    const from = { movement: "Run", unit: "meters" as const, amount: 800 };
    const to = { movement: "Air Bike", unit: "calories" as const };
    expect(convertEffort(conversions, from, to, "male")).toBe(40);
    expect(convertEffort(conversions, from, to, "female")).toBe(30);
    expect(convertEffort(conversions, from, to, null)).toBe(35);
  });

  it("rounds meters to the nearest 10", () => {
    expect(convertEffort(conversions, { movement: "Run", unit: "meters", amount: 300 }, { movement: "Row (Erg)", unit: "meters" }, "male")).toBe(380);
  });

  it("converts double-unders to single-unders", () => {
    expect(convertEffort(conversions, { movement: "Double-under", unit: "reps", amount: 50 }, { movement: "Single-under", unit: "reps" }, null)).toBe(150);
  });

  it("returns null when no group holds both efforts", () => {
    expect(convertEffort(conversions, { movement: "Run", unit: "meters", amount: 400 }, { movement: "Single-under", unit: "reps" }, null)).toBeNull();
  });
});
```

In `tests/domain/data.test.ts`, replace the import `import stimuli from "../../data/stimulus-taxonomy.json";` with `import taxonomyJson from "../../data/stimulus-taxonomy.json";`, add `StimulusTaxonomySchema` to the `@/lib/domain/types` import, and replace the test `it("stimulus taxonomy is valid with unique keys", ...)` with:

```ts
  it("stimulus taxonomy has three vocabularies with unique keys", () => {
    const taxonomy = StimulusTaxonomySchema.parse(taxonomyJson);
    for (const list of [taxonomy.qualities, taxonomy.energySystems, taxonomy.loadIntensities]) {
      const keys = list.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(taxonomy.qualities.map((q) => q.key)).toContain("conditioning");
  });
```
Remove `StimulusDefSchema` from that import if it is no longer used in the file.

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/domain`
Expected: FAIL — `data/conversions.json` missing; `StimulusTaxonomySchema` not exported.

- [ ] **Step 3: Append the schemas to `src/lib/domain/types.ts`**

```ts
export const StimulusTaxonomySchema = z.object({
  qualities: z.array(StimulusDefSchema).min(1),
  energySystems: z.array(StimulusDefSchema).min(1),
  loadIntensities: z.array(StimulusDefSchema).min(1),
});
export type StimulusTaxonomy = z.infer<typeof StimulusTaxonomySchema>;

export const EffortUnit = z.enum(["meters", "calories", "reps"]);
export type EffortUnit = z.infer<typeof EffortUnit>;

export const EffortEquivalentSchema = z.object({
  movement: z.string().min(1),
  unit: EffortUnit,
  male: z.number().positive(),
  female: z.number().positive(),
});

export const EffortEquivalenceSchema = z.object({
  key: z.string().min(1),
  note: z.string().min(1),
  equivalents: z.array(EffortEquivalentSchema).min(2),
});

export const ImplementLoadSchema = z.object({
  from: Equipment,
  to: Equipment,
  perHandFraction: z.object({ low: z.number().positive(), high: z.number().positive() }),
  note: z.string().min(1),
});

export const ConversionsSchema = z.object({
  effort: z.array(EffortEquivalenceSchema),
  implementLoad: z.array(ImplementLoadSchema),
});
export type Conversions = z.infer<typeof ConversionsSchema>;
```

- [ ] **Step 4: Write the data files**

`data/stimulus-taxonomy.json` (replace):

```json
{
  "qualities": [
    { "key": "strength", "label": "Strength", "description": "Heavy loads, low reps, full recovery between efforts; the goal is force production." },
    { "key": "power", "label": "Power", "description": "Fast, explosive efforts (olympic lifts, jumps, speed work) at moderate-to-heavy load with full recovery." },
    { "key": "skill", "label": "Skill", "description": "Technique practice in gymnastics or lifting at low fatigue; movement quality over output." },
    { "key": "conditioning", "label": "Conditioning", "description": "Metabolic work against the clock (AMRAP, for time, intervals, EMOM sprints); the goal is sustained output." },
    { "key": "muscular_endurance", "label": "Muscular endurance", "description": "High-rep sets at light-to-moderate load, not primarily against the clock (accessory work, volume sets)." },
    { "key": "preparation", "label": "Preparation", "description": "Warm-up, mobility, activation or cool-down; low intensity by design." }
  ],
  "energySystems": [
    { "key": "phosphagen", "label": "Phosphagen", "description": "Maximal efforts under ~15 s with long rests: heavy singles, sprints, max jumps." },
    { "key": "glycolytic", "label": "Glycolytic", "description": "Hard efforts from ~30 s to a few minutes, or short workouts near redline (roughly 2-8 min)." },
    { "key": "oxidative", "label": "Oxidative", "description": "Sustainable, paced efforts: long workouts and steady intervals (roughly over 8 min)." }
  ],
  "loadIntensities": [
    { "key": "light", "label": "Light", "description": "Below ~60% of 1RM, or bodyweight movements the athlete can cycle unbroken." },
    { "key": "moderate", "label": "Moderate", "description": "Roughly 60-80% of 1RM; sets need some breaking for most athletes." },
    { "key": "heavy", "label": "Heavy", "description": "Above ~80% of 1RM; low reps, form is the limiter." }
  ]
}
```

`data/conversions.json` (new):

```json
{
  "effort": [
    {
      "key": "monostructural_400m_run",
      "note": "Approximate coaching equivalents of a 400 m run.",
      "equivalents": [
        { "movement": "Run", "unit": "meters", "male": 400, "female": 400 },
        { "movement": "Row (Erg)", "unit": "meters", "male": 500, "female": 500 },
        { "movement": "Row (Erg)", "unit": "calories", "male": 25, "female": 20 },
        { "movement": "Ski (Erg)", "unit": "meters", "male": 500, "female": 500 },
        { "movement": "Ski (Erg)", "unit": "calories", "male": 25, "female": 20 },
        { "movement": "Bike (Erg)", "unit": "meters", "male": 1000, "female": 1000 },
        { "movement": "Air Bike", "unit": "calories", "male": 20, "female": 15 }
      ]
    },
    {
      "key": "jump_rope",
      "note": "Common scaling of double-unders; three singles keep the work time close.",
      "equivalents": [
        { "movement": "Double-under", "unit": "reps", "male": 1, "female": 1 },
        { "movement": "Single-under", "unit": "reps", "male": 3, "female": 3 }
      ]
    }
  ],
  "implementLoad": [
    { "from": "barbell", "to": "dumbbell", "perHandFraction": { "low": 0.3, "high": 0.4 }, "note": "Two dumbbells replacing a two-handed barbell lift; adjust to the athlete's benchmarks." },
    { "from": "barbell", "to": "kettlebell", "perHandFraction": { "low": 0.3, "high": 0.4 }, "note": "Two kettlebells replacing a two-handed barbell lift; adjust to the athlete's benchmarks." }
  ]
}
```

- [ ] **Step 5: Implement `src/lib/domain/conversions.ts`**

```ts
import type { Conversions, EffortUnit } from "./types";

export interface EffortAmount { movement: string; unit: EffortUnit; amount: number }
export interface EffortTarget { movement: string; unit: EffortUnit }

/** Deterministic effort conversion within an equivalence group; null when no group holds both. */
export function convertEffort(
  conversions: Conversions, from: EffortAmount, to: EffortTarget, sex: "male" | "female" | null,
): number | null {
  for (const group of conversions.effort) {
    const a = group.equivalents.find((e) => e.movement === from.movement && e.unit === from.unit);
    const b = group.equivalents.find((e) => e.movement === to.movement && e.unit === to.unit);
    if (!a || !b) continue;
    const amountOf = (e: typeof a) => (sex === null ? (e.male + e.female) / 2 : e[sex]);
    const raw = (from.amount * amountOf(b)) / amountOf(a);
    return to.unit === "meters" ? Math.round(raw / 10) * 10 : Math.max(1, Math.round(raw));
  }
  return null;
}
```

- [ ] **Step 6: Run the suite, verify green**

Run: `pnpm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: structured stimulus taxonomy and effort/load conversions"
```

---

### Task D5: Movement resolver and the JSON-backed repository

**Files:**
- Create: `src/lib/domain/resolve.ts`, `src/lib/domain/repository.ts`, `tests/domain/resolve.test.ts`, `tests/domain/repository.test.ts`

**Interfaces:**
- Produces (`@/lib/domain/resolve`): `normalizeMovementName(name: string): string`, `type MovementResolver = (name: string) => Movement | null`, `createMovementResolver(movements: Movement[]): MovementResolver`.
- Produces (`@/lib/domain/repository`): `interface DomainData { movements: Movement[]; contraindications: Contraindication[]; taxonomy: StimulusTaxonomy; conversions: Conversions }`, `getDomainData(): Promise<DomainData>`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/resolve.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import movementsJson from "../../data/movements.json";
import { MovementSchema } from "@/lib/domain/types";
import { createMovementResolver, normalizeMovementName } from "@/lib/domain/resolve";

const movements = movementsJson.map((m) => MovementSchema.parse(m));
const resolve = createMovementResolver(movements);

describe("normalizeMovementName", () => {
  it("ignores case, spacing and punctuation, and spells out ampersands", () => {
    expect(normalizeMovementName("Pull-up")).toBe(normalizeMovementName("pull up"));
    expect(normalizeMovementName("Pull-up")).toBe(normalizeMovementName("PULLUP"));
    expect(normalizeMovementName("Clean & Jerk")).toBe(normalizeMovementName("clean and jerk"));
  });
});

describe("createMovementResolver", () => {
  it("resolves every canonical name and alias to its own movement", () => {
    for (const m of movements) {
      for (const n of [m.name, ...m.aliases]) expect(resolve(n)?.name, n).toBe(m.name);
    }
  });

  it("no normalized name or alias points to two different movements", () => {
    const owner = new Map<string, string>();
    for (const m of movements) {
      for (const n of [m.name, ...m.aliases]) {
        const key = normalizeMovementName(n);
        const previous = owner.get(key);
        expect(previous === undefined || previous === m.name, `${n} collides with ${previous}`).toBe(true);
        owner.set(key, m.name);
      }
    }
  });

  it("resolves workout shorthand, spelling variants and plurals", () => {
    expect(resolve("T2B")?.name).toBe("Toes-to-Bar");
    expect(resolve("toes to bar")?.name).toBe("Toes-to-Bar");
    expect(resolve("Pull ups")?.name).toBe("Pull-up");
    expect(resolve("Thrusters")?.name).toBe("Thruster");
    expect(resolve("box jumps")?.name).toBe("Box Jump");
    expect(resolve("wall walks")?.name).toBe("Wall Climb");
    expect(resolve("  Burpees ")?.name).toBe("Burpee");
  });

  it("returns null for an unknown movement", () => {
    expect(resolve("Zercher Carry")).toBeNull();
  });
});
```

`tests/domain/repository.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDomainData } from "@/lib/domain/repository";

describe("getDomainData", () => {
  it("loads and validates every domain file", async () => {
    const d = await getDomainData();
    expect(d.movements.find((m) => m.name === "Back Squat")?.stresses[0].load).toBe("high");
    expect(d.contraindications.some((c) => c.key === "pregnancy")).toBe(true);
    expect(d.taxonomy.energySystems.map((e) => e.key)).toEqual(["phosphagen", "glycolytic", "oxidative"]);
    expect(d.conversions.effort.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/domain/resolve.test.ts tests/domain/repository.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/domain/resolve.ts`**

```ts
import type { Movement } from "./types";

/** Case-, spacing- and punctuation-insensitive key; "&" is spelled out as "and". */
export function normalizeMovementName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export type MovementResolver = (name: string) => Movement | null;

/** exact name/alias → normalized name/alias → normalized singular (trailing "s" dropped). */
export function createMovementResolver(movements: Movement[]): MovementResolver {
  const exact = new Map<string, Movement>();
  const normalized = new Map<string, Movement>();
  for (const m of movements) {
    for (const n of [m.name, ...m.aliases]) {
      exact.set(n, m);
      normalized.set(normalizeMovementName(n), m);
    }
  }
  return (name) => {
    const trimmed = name.trim();
    const direct = exact.get(trimmed);
    if (direct) return direct;
    const key = normalizeMovementName(trimmed);
    const hit = normalized.get(key);
    if (hit) return hit;
    return key.endsWith("s") ? normalized.get(key.slice(0, -1)) ?? null : null;
  };
}
```

- [ ] **Step 4: Implement `src/lib/domain/repository.ts`**

The JSON is validated once at module load, so a malformed edit fails loudly at startup. The `Promise`-returning signature keeps a later move to the DB (Phase C) contained in this file.

```ts
import { z } from "zod";
import movementsJson from "../../../data/movements.json";
import contraindicationsJson from "../../../data/contraindications.json";
import taxonomyJson from "../../../data/stimulus-taxonomy.json";
import conversionsJson from "../../../data/conversions.json";
import {
  ContraindicationSchema, ConversionsSchema, MovementSchema, StimulusTaxonomySchema,
  type Contraindication, type Conversions, type Movement, type StimulusTaxonomy,
} from "./types";

export interface DomainData {
  movements: Movement[];
  contraindications: Contraindication[];
  taxonomy: StimulusTaxonomy;
  conversions: Conversions;
}

const data: DomainData = {
  movements: z.array(MovementSchema).parse(movementsJson),
  contraindications: z.array(ContraindicationSchema).parse(contraindicationsJson),
  taxonomy: StimulusTaxonomySchema.parse(taxonomyJson),
  conversions: ConversionsSchema.parse(conversionsJson),
};

export async function getDomainData(): Promise<DomainData> {
  return data;
}
```

- [ ] **Step 5: Run the suite, verify green**

Run: `pnpm test` → PASS. If the collision test fails, two movements share a normalized alias: rename or drop the alias on the movement it does not belong to.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: movement name resolver and JSON-backed domain repository"
```

---
## Phase E — Engine and evaluation

### Task E1: Engine types and shared test fixtures

**Files:**
- Create: `src/lib/engine/types.ts`, `tests/fixtures/workouts.ts`, `tests/engine/types.test.ts`

**Interfaces:**
- Consumes: `Equipment`, `Side`, `Severity` from `@/lib/domain/types`.
- Produces (`@/lib/engine/types`): enums `Quality`, `EnergySystem`, `LoadIntensity`, `BlockFormat`, `WorkoutSource`, `BenchmarkKind`, `BenchmarkUnit`, `Weekday`, `Sex`, `ScalingLevel`, `FindingKind`; schemas + types `StimulusProfile`, `ComponentDraft`, `WorkoutComponent` (`+canonical`), `BlockDraft`, `WorkoutBlock`, `WorkoutDraft`, `StructuredWorkout`, `ManualBlock`, `ManualWorkout`, `DetectedCondition`, `SituationAnalysis`, `PasteAnalysis`, `ManualAnalysis`, `TailoredBlockDraft`, `TailoredBlock` (`+sourceBlocks`), `DroppedBlock`, `ChangeItem`, `TailoringDraft`, `TailoringResult`, `ProfileInjury`, `Benchmark`, `Goal`, `Availability`, `AthleteProfile`, `TailorRequest`, `Finding`, `ConditionRef`, `PipelineResult`; helpers `emptyProfile()`, `emptyRequest()`.
- Produces (`tests/fixtures/workouts.ts`): `component(movement, extra?)`, `sprint`, `heavy`, `FRAN_TEXT`, `franDraft()`, `fran()`, `SPLIT_TEXT`, `split()`, `toTailoringDraft(workout, overrides?)` (model-shaped, no `canonical`), `identityResult(workout)` (resolved, `TailoringResult`).

- [ ] **Step 1: Write the failing test `tests/engine/types.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import taxonomy from "../../data/stimulus-taxonomy.json";
import {
  AthleteProfileSchema, EnergySystem, LoadIntensity, PasteAnalysisSchema, PipelineResultSchema, Quality,
  StructuredWorkoutSchema, TailorRequestSchema, TailoringDraftSchema, TailoringResultSchema, emptyProfile, emptyRequest,
} from "@/lib/engine/types";
import { fran, franDraft, identityResult, split, toTailoringDraft } from "../fixtures/workouts";

describe("engine schemas", () => {
  it("stimulus enums stay in sync with data/stimulus-taxonomy.json", () => {
    // The z.enums give literal types; the JSON is the authoritative vocabulary. Add a key in BOTH.
    expect([...Quality.options].sort()).toEqual(taxonomy.qualities.map((d) => d.key).sort());
    expect([...EnergySystem.options].sort()).toEqual(taxonomy.energySystems.map((d) => d.key).sort());
    expect([...LoadIntensity.options].sort()).toEqual(taxonomy.loadIntensities.map((d) => d.key).sort());
  });

  it("parses single- and multi-block sessions", () => {
    expect(StructuredWorkoutSchema.parse(fran()).blocks[0].components[0].canonical).toBe("Thruster");
    expect(StructuredWorkoutSchema.parse(split()).blocks).toHaveLength(2);
  });

  it("parses a paste analysis with detected conditions", () => {
    const a = PasteAnalysisSchema.parse({
      workout: franDraft(),
      conditions: [{ key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro" }],
      unavailableEquipment: ["rower"],
    });
    expect(a.conditions[0].side).toBe("right");
  });

  it("parses a tailoring draft (model output) and a resolved tailoring result", () => {
    const draft = TailoringDraftSchema.parse(toTailoringDraft(fran(), { droppedBlocks: [{ index: 1, reason: "No time." }] }));
    expect(draft.blocks[0].sourceBlocks).toEqual([0]);
    expect("canonical" in draft.blocks[0].components[0]).toBe(false);
    expect(TailoringResultSchema.parse(identityResult(fran())).blocks[0].components[0].canonical).toBe("Thruster");
  });

  it("empty profile and request are valid", () => {
    expect(AthleteProfileSchema.parse(emptyProfile()).equipment).toBeNull();
    expect(TailorRequestSchema.parse(emptyRequest()).situation).toBe("");
  });

  it("rejects an over-long situation", () => {
    expect(() => TailorRequestSchema.parse({ ...emptyRequest(), situation: "x".repeat(2001) })).toThrow();
  });

  it("parses a pipeline result", () => {
    const r = PipelineResultSchema.parse({
      original: fran(), conditions: [], unavailableEquipment: [],
      tailored: identityResult(fran()), findings: [], feedbackHistory: [], model: "fake",
    });
    expect(r.model).toBe("fake");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/types.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/engine/types.ts`**

```ts
import { z } from "zod";
import { Equipment, Severity, Side } from "@/lib/domain/types";

// ---- stimulus (mirrors data/stimulus-taxonomy.json; pinned by a sync test) ----
export const Quality = z.enum(["strength", "power", "skill", "conditioning", "muscular_endurance", "preparation"]);
export type Quality = z.infer<typeof Quality>;
export const EnergySystem = z.enum(["phosphagen", "glycolytic", "oxidative"]);
export type EnergySystem = z.infer<typeof EnergySystem>;
export const LoadIntensity = z.enum(["light", "moderate", "heavy"]);
export type LoadIntensity = z.infer<typeof LoadIntensity>;

export const StimulusProfileSchema = z.object({
  quality: Quality,
  energySystem: EnergySystem.nullable(),
  loadIntensity: LoadIntensity.nullable(),
  rationale: z.string().min(1),
});
export type StimulusProfile = z.infer<typeof StimulusProfileSchema>;

// ---- workout ----
export const BlockFormat = z.enum(["amrap", "for_time", "emom", "intervals", "strength", "skill", "partner", "rest", "other"]);
export type BlockFormat = z.infer<typeof BlockFormat>;

export const SexLoadsSchema = z.object({
  male: z.number().positive().nullable(),
  female: z.number().positive().nullable(),
});

// What the model emits. `canonical` is never asked of the model: code resolves it.
export const ComponentDraftSchema = z.object({
  movement: z.string().min(1),
  reps: z.union([z.number(), z.string()]).nullable(), // 21, "21-15-9", "max"
  load: z.string().nullable(),                         // as written, incl. tiers: "61/43 kg"
  loadKg: SexLoadsSchema.nullable(),
  percent1RM: z.number().positive().max(120).nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  calories: z.number().nonnegative().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  notes: z.string().nullable(),
});
export type ComponentDraft = z.infer<typeof ComponentDraftSchema>;

export const WorkoutComponentSchema = ComponentDraftSchema.extend({ canonical: z.string().nullable() });
export type WorkoutComponent = z.infer<typeof WorkoutComponentSchema>;

const blockFields = {
  title: z.string().nullable(),
  rawText: z.string().min(1),                       // verbatim slice of the input
  day: z.number().int().positive().nullable(),      // multi-day pastes (missed days)
  format: BlockFormat,
  scheme: z.string().nullable(),
  timeDomainMinutes: z.number().nonnegative().nullable(),
  coachingNotes: z.string().nullable(),             // intensity/tempo/scaling tiers as prose
  stimulus: StimulusProfileSchema.nullable(),       // null only for rest blocks or a failed analysis
};

export const BlockDraftSchema = z.object({ ...blockFields, components: z.array(ComponentDraftSchema) });
export type BlockDraft = z.infer<typeof BlockDraftSchema>;
export const WorkoutBlockSchema = z.object({ ...blockFields, components: z.array(WorkoutComponentSchema) });
export type WorkoutBlock = z.infer<typeof WorkoutBlockSchema>;

export const WorkoutDraftSchema = z.object({ name: z.string().nullable(), blocks: z.array(BlockDraftSchema).min(1) });
export type WorkoutDraft = z.infer<typeof WorkoutDraftSchema>;

export const WorkoutSource = z.enum(["paste", "manual"]);
export type WorkoutSource = z.infer<typeof WorkoutSource>;

// A training SESSION. rawText is the durable source of truth; blocks are a derived extraction.
export const StructuredWorkoutSchema = z.object({
  name: z.string().nullable(),
  rawText: z.string().min(1),
  source: WorkoutSource,
  blocks: z.array(WorkoutBlockSchema).min(1),
});
export type StructuredWorkout = z.infer<typeof StructuredWorkoutSchema>;

// ---- manual entry ----
export const ManualBlockSchema = z.object({
  title: z.string().nullable(),
  format: BlockFormat,
  scheme: z.string().nullable(),
  timeDomainMinutes: z.number().nonnegative().nullable(),
  coachingNotes: z.string().nullable(),
  components: z.array(ComponentDraftSchema),
});
export type ManualBlock = z.infer<typeof ManualBlockSchema>;
export const ManualWorkoutSchema = z.object({ name: z.string().nullable(), blocks: z.array(ManualBlockSchema).min(1) });
export type ManualWorkout = z.infer<typeof ManualWorkoutSchema>;

// ---- analysis ----
export const DetectedConditionSchema = z.object({
  key: z.string().min(1),
  side: Side.nullable(),
  severity: Severity,
  evidence: z.string().min(1), // the athlete's words
});
export type DetectedCondition = z.infer<typeof DetectedConditionSchema>;

export const SituationAnalysisSchema = z.object({
  conditions: z.array(DetectedConditionSchema),
  unavailableEquipment: z.array(Equipment),
});
export type SituationAnalysis = z.infer<typeof SituationAnalysisSchema>;
export const PasteAnalysisSchema = SituationAnalysisSchema.extend({ workout: WorkoutDraftSchema });
export type PasteAnalysis = z.infer<typeof PasteAnalysisSchema>;
export const ManualAnalysisSchema = SituationAnalysisSchema.extend({ stimuli: z.array(StimulusProfileSchema.nullable()) });
export type ManualAnalysis = z.infer<typeof ManualAnalysisSchema>;

// ---- tailoring ----
const sourceBlocks = z.array(z.number().int().nonnegative()); // original block indices
export const TailoredBlockDraftSchema = BlockDraftSchema.extend({ sourceBlocks });
export type TailoredBlockDraft = z.infer<typeof TailoredBlockDraftSchema>;
export const TailoredBlockSchema = WorkoutBlockSchema.extend({ sourceBlocks });
export type TailoredBlock = z.infer<typeof TailoredBlockSchema>;

export const DroppedBlockSchema = z.object({ index: z.number().int().nonnegative(), reason: z.string().min(1) });
export type DroppedBlock = z.infer<typeof DroppedBlockSchema>;

export const ChangeItemSchema = z.object({
  blockIndex: z.number().int().nonnegative().nullable(), // tailored block index
  original: z.string().min(1),
  modified: z.string().min(1),
  reason: z.string().min(1),
});
export type ChangeItem = z.infer<typeof ChangeItemSchema>;

const tailoringFields = {
  name: z.string().nullable(),
  rawText: z.string().min(1),
  droppedBlocks: z.array(DroppedBlockSchema),
  changes: z.array(ChangeItemSchema),
  rationale: z.string().min(1),
  safetyNote: z.string().nullable(),
};
export const TailoringDraftSchema = z.object({ ...tailoringFields, blocks: z.array(TailoredBlockDraftSchema).min(1) });
export type TailoringDraft = z.infer<typeof TailoringDraftSchema>;
export const TailoringResultSchema = z.object({ ...tailoringFields, blocks: z.array(TailoredBlockSchema).min(1) });
export type TailoringResult = z.infer<typeof TailoringResultSchema>;

// ---- athlete profile ----
export const BenchmarkKind = z.enum(["1rm", "max_reps", "time"]);
export const BenchmarkUnit = z.enum(["kg", "lb", "reps", "seconds"]);
export const Weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export const Sex = z.enum(["male", "female"]);
export const ScalingLevel = z.enum(["scaled", "intermediate", "rx", "rx_plus"]);

export const ProfileInjurySchema = z.object({
  key: z.string().min(1),
  side: Side.nullable(),
  severity: Severity,
  notes: z.string().nullable(),
  since: z.string().nullable(), // ISO date
});
export type ProfileInjury = z.infer<typeof ProfileInjurySchema>;

export const BenchmarkSchema = z.object({
  movement: z.string().min(1), // canonical
  kind: BenchmarkKind,
  value: z.number().positive(),
  unit: BenchmarkUnit,
  recordedAt: z.string().nullable(),
});
export type Benchmark = z.infer<typeof BenchmarkSchema>;

export const GoalSchema = z.object({ movement: z.string().nullable(), description: z.string().min(1) });
export type Goal = z.infer<typeof GoalSchema>;

export const AvailabilitySchema = z.object({
  minutesPerDay: z.number().int().positive().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).nullable(),
  days: z.array(Weekday),
});
export type Availability = z.infer<typeof AvailabilitySchema>;

export const AthleteProfileSchema = z.object({
  sex: Sex.nullable(),
  scalingLevel: ScalingLevel.nullable(),
  injuries: z.array(ProfileInjurySchema),
  benchmarks: z.array(BenchmarkSchema),
  equipment: z.array(Equipment).nullable(), // null = not specified → a full box
  goals: z.array(GoalSchema),
  availability: AvailabilitySchema,
});
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>;

export function emptyProfile(): AthleteProfile {
  return {
    sex: null, scalingLevel: null, injuries: [], benchmarks: [], equipment: null, goals: [],
    availability: { minutesPerDay: null, daysPerWeek: null, days: [] },
  };
}

// ---- today's request (constraints combine) ----
export const TailorRequestSchema = z.object({
  situation: z.string().max(2000),             // the athlete's words: pain, fatigue, missing kit
  timeCapMinutes: z.number().int().positive().nullable(),
  targetMovement: z.string().nullable(),       // canonical, movement-improvement bias
  equipmentToday: z.array(Equipment).nullable(), // overrides the profile for today
});
export type TailorRequest = z.infer<typeof TailorRequestSchema>;

export function emptyRequest(): TailorRequest {
  return { situation: "", timeCapMinutes: null, targetMovement: null, equipmentToday: null };
}

// ---- findings and results ----
export const FindingKind = z.enum([
  "contraindicated_movement", "equipment_unavailable", "unrecognized_movement", "caution_movement",
  "time_cap_exceeded", "stimulus_drift", "unaccounted_block",
]);
export type FindingKind = z.infer<typeof FindingKind>;

export const FindingSchema = z.object({
  kind: FindingKind,
  severity: z.enum(["violation", "warning"]),
  blockIndex: z.number().int().nonnegative().nullable(),
  movement: z.string().nullable(),
  message: z.string().min(1),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ConditionRefSchema = z.object({
  key: z.string().min(1),
  side: Side.nullable(),
  severity: Severity,
  source: z.enum(["profile", "today"]),
  evidence: z.string().nullable(),
});
export type ConditionRef = z.infer<typeof ConditionRefSchema>;

export const PipelineResultSchema = z.object({
  original: StructuredWorkoutSchema,
  conditions: z.array(ConditionRefSchema),
  unavailableEquipment: z.array(Equipment),
  tailored: TailoringResultSchema,
  findings: z.array(FindingSchema),
  feedbackHistory: z.array(z.string()),
  model: z.string().min(1),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
```

- [ ] **Step 4: Create the shared fixtures `tests/fixtures/workouts.ts`**

```ts
import type {
  ComponentDraft, StimulusProfile, StructuredWorkout, TailoringDraft, TailoringResult, WorkoutDraft,
} from "@/lib/engine/types";

export const component = (movement: string, extra: Partial<ComponentDraft> = {}): ComponentDraft => ({
  movement, reps: null, load: null, loadKg: null, percent1RM: null,
  distanceMeters: null, calories: null, durationSeconds: null, notes: null, ...extra,
});

export const sprint: StimulusProfile = {
  quality: "conditioning", energySystem: "glycolytic", loadIntensity: "moderate", rationale: "Short couplet near redline.",
};
export const heavy: StimulusProfile = {
  quality: "strength", energySystem: "phosphagen", loadIntensity: "heavy", rationale: "Heavy low-rep sets.",
};

export const FRAN_TEXT = "Fran\n21-15-9 for time\nThrusters 43/30 kg\nPull-ups";

export function franDraft(): WorkoutDraft {
  return {
    name: "Fran",
    blocks: [{
      title: "Fran", rawText: FRAN_TEXT, day: null, format: "for_time", scheme: "21-15-9 for time",
      timeDomainMinutes: 6, coachingNotes: null, stimulus: sprint,
      components: [
        component("Thruster", { reps: "21-15-9", load: "43/30 kg", loadKg: { male: 43, female: 30 } }),
        component("Pull-up", { reps: "21-15-9" }),
      ],
    }],
  };
}

function resolved(draft: WorkoutDraft, rawText: string): StructuredWorkout {
  return {
    name: draft.name, rawText, source: "paste",
    blocks: draft.blocks.map((b) => ({ ...b, components: b.components.map((c) => ({ ...c, canonical: c.movement })) })),
  };
}

export const fran = (): StructuredWorkout => resolved(franDraft(), FRAN_TEXT);

export const SPLIT_TEXT = "A) Back Squat 5x3 @ 85%\n\nB) AMRAP 10 min\n10 Burpees\n10 Box Jumps";

export function split(): StructuredWorkout {
  return resolved({
    name: null,
    blocks: [
      {
        title: "A", rawText: "A) Back Squat 5x3 @ 85%", day: null, format: "strength", scheme: "5x3 @ 85%",
        timeDomainMinutes: 15, coachingNotes: null, stimulus: heavy,
        components: [component("Back Squat", { reps: "5x3", percent1RM: 85 })],
      },
      {
        title: "B", rawText: "B) AMRAP 10 min\n10 Burpees\n10 Box Jumps", day: null, format: "amrap", scheme: "AMRAP 10 min",
        timeDomainMinutes: 10, coachingNotes: null, stimulus: sprint,
        components: [component("Burpee", { reps: 10 }), component("Box Jump", { reps: 10 })],
      },
    ],
  }, SPLIT_TEXT);
}

/** The identity modification of `workout`, as the model would return it (no canonical names). */
export function toTailoringDraft(workout: StructuredWorkout, overrides: Partial<TailoringDraft> = {}): TailoringDraft {
  return {
    name: workout.name, rawText: workout.rawText, droppedBlocks: [], changes: [],
    rationale: "No change needed.", safetyNote: null,
    blocks: workout.blocks.map((b, i) => ({
      ...b,
      sourceBlocks: [i],
      components: b.components.map((c): ComponentDraft => {
        const { canonical, ...draft } = c;
        void canonical;
        return draft;
      }),
    })),
    ...overrides,
  };
}

/** The identity modification of `workout` after code resolution (canonical names kept). */
export function identityResult(workout: StructuredWorkout): TailoringResult {
  return {
    name: workout.name, rawText: workout.rawText, droppedBlocks: [], changes: [],
    rationale: "No change needed.", safetyNote: null,
    blocks: workout.blocks.map((b, i) => ({ ...b, sourceBlocks: [i] })),
  };
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/types.test.ts` → PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: engine schemas for per-block stimulus, analysis, tailoring, profile and findings"
```

---

### Task E2: `LlmProvider`, structured-output errors, retry decorator and `FakeProvider`

**Files:**
- Create: `src/lib/ai/provider.ts`, `src/lib/ai/retry.ts`, `src/lib/ai/fake-provider.ts`
- Test: `tests/ai/fake-provider.test.ts`, `tests/ai/retry.test.ts`

**Interfaces:**
- Produces (`@/lib/ai/provider`): `interface GenerateStructuredArgs<T> { systemPrompt?: string; prompt: string; schema: z.ZodType<T>; schemaName: string }`, `interface LlmProvider { readonly model: string; generateStructured<T>(args): Promise<T> }`, `class StructuredOutputError extends Error { details: string }`, `parseStructured<T>(schema, value, source): T`.
- Produces (`@/lib/ai/retry`): `withValidationRetry(provider): LlmProvider`.
- Produces (`@/lib/ai/fake-provider`): `class FakeProvider` (`model = "fake"`, `calls: GenerateStructuredArgs<unknown>[]`, constructor `(scripts: Record<string, unknown>)`; a scripted `Error` is thrown), `sequence(...values): unknown` (one value per call, in order).

- [ ] **Step 1: Write the failing tests**

`tests/ai/fake-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { StructuredOutputError } from "@/lib/ai/provider";

const schema = z.object({ ok: z.boolean() });

describe("FakeProvider", () => {
  it("returns the scripted value and records the call", async () => {
    const p = new FakeProvider({ Demo: { ok: true } });
    expect(await p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).toEqual({ ok: true });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0].prompt).toBe("x");
    expect(p.model).toBe("fake");
  });

  it("throws StructuredOutputError when the scripted value fails the schema", async () => {
    const p = new FakeProvider({ Demo: { ok: "nope" } });
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toBeInstanceOf(StructuredOutputError);
  });

  it("throws a scripted Error", async () => {
    const p = new FakeProvider({ Demo: new Error("boom") });
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow("boom");
  });

  it("plays a sequence one value per call and fails when exhausted", async () => {
    const p = new FakeProvider({ Demo: sequence({ ok: true }, { ok: false }) });
    expect((await p.generateStructured({ prompt: "1", schema, schemaName: "Demo" })).ok).toBe(true);
    expect((await p.generateStructured({ prompt: "2", schema, schemaName: "Demo" })).ok).toBe(false);
    await expect(p.generateStructured({ prompt: "3", schema, schemaName: "Demo" })).rejects.toThrow(/exhausted/);
  });

  it("throws when no script exists for the schema name", async () => {
    const p = new FakeProvider({});
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Missing" })).rejects.toThrow(/no scripted response/i);
  });
});
```

`tests/ai/retry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { withValidationRetry } from "@/lib/ai/retry";

const schema = z.object({ ok: z.boolean() });

describe("withValidationRetry", () => {
  it("retries once with the validation error appended to the prompt", async () => {
    const fake = new FakeProvider({ Demo: sequence({ ok: "nope" }, { ok: true }) });
    const p = withValidationRetry(fake);
    expect(await p.generateStructured({ prompt: "base", schema, schemaName: "Demo" })).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].prompt).toContain("base");
    expect(fake.calls[1].prompt).toContain("previous response was rejected");
    expect(p.model).toBe("fake");
  });

  it("gives up after the second invalid response", async () => {
    const p = withValidationRetry(new FakeProvider({ Demo: sequence({ ok: 1 }, { ok: 2 }) }));
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow(/schema validation/);
  });

  it("does not retry other errors", async () => {
    const fake = new FakeProvider({ Demo: sequence(new Error("network"), { ok: true }) });
    await expect(withValidationRetry(fake).generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow("network");
    expect(fake.calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/ai` → FAIL (modules not found).

- [ ] **Step 3: Implement `src/lib/ai/provider.ts`**

```ts
import { z } from "zod";

export interface GenerateStructuredArgs<T> {
  systemPrompt?: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string; // names the response for providers that need it; keys FakeProvider scripts
}

export interface LlmProvider {
  readonly model: string;
  /** Send the prompt and return a value validated against `schema`. */
  generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T>;
}

/** The model answered, but not with schema-valid JSON. `details` is fed back on retry. */
export class StructuredOutputError extends Error {
  constructor(message: string, readonly details: string) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export function parseStructured<T>(schema: z.ZodType<T>, value: unknown, source: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StructuredOutputError(`${source}: response failed schema validation`, z.prettifyError(result.error));
  }
  return result.data;
}
```

- [ ] **Step 4: Implement `src/lib/ai/retry.ts`**

```ts
import { StructuredOutputError, type GenerateStructuredArgs, type LlmProvider } from "./provider";

/** One retry when the output fails schema validation, with the validation error in the prompt. */
export function withValidationRetry(provider: LlmProvider): LlmProvider {
  return {
    model: provider.model,
    async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
      try {
        return await provider.generateStructured(args);
      } catch (e) {
        if (!(e instanceof StructuredOutputError)) throw e;
        return provider.generateStructured({
          ...args,
          prompt: `${args.prompt}\n\nYour previous response was rejected:\n${e.details}\nReturn JSON that satisfies the schema exactly.`,
        });
      }
    },
  };
}
```

- [ ] **Step 5: Implement `src/lib/ai/fake-provider.ts`**

```ts
import { parseStructured, type GenerateStructuredArgs, type LlmProvider } from "./provider";

const SEQUENCE = Symbol("sequence");
type Sequence = { [SEQUENCE]: unknown[] };

/** Script one value per call, in order, for a schema name. */
export function sequence(...values: unknown[]): unknown {
  return { [SEQUENCE]: values } satisfies Sequence;
}

function isSequence(value: unknown): value is Sequence {
  return typeof value === "object" && value !== null && SEQUENCE in value;
}

/** Test double: maps schemaName → scripted value (validated against the schema) or Error (thrown). */
export class FakeProvider implements LlmProvider {
  readonly model = "fake";
  readonly calls: GenerateStructuredArgs<unknown>[] = [];
  private readonly queues = new Map<string, unknown[]>();

  constructor(private readonly scripts: Record<string, unknown>) {}

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    this.calls.push(args as GenerateStructuredArgs<unknown>);
    if (!(args.schemaName in this.scripts)) {
      throw new Error(`FakeProvider: no scripted response for "${args.schemaName}"`);
    }
    let value = this.scripts[args.schemaName];
    if (isSequence(value)) {
      const queue = this.queues.get(args.schemaName) ?? [...value[SEQUENCE]];
      this.queues.set(args.schemaName, queue);
      if (queue.length === 0) throw new Error(`FakeProvider: sequence for "${args.schemaName}" exhausted`);
      value = queue.shift();
    }
    if (value instanceof Error) throw value;
    return parseStructured(args.schema, value, "FakeProvider");
  }
}
```

- [ ] **Step 6: Run them, verify they pass**

Run: `pnpm exec vitest run tests/ai` → PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: LlmProvider contract, validation retry decorator and FakeProvider"
```

---

### Task E3: Gemini adapter and provider factory

**Files:**
- Create: `src/lib/ai/gemini-provider.ts`, `src/lib/ai/index.ts`, `tests/ai/gemini-provider.test.ts`
- Modify: `.env.example`, `package.json` (dependency)

**Interfaces:**
- Consumes: `LlmProvider`, `parseStructured`, `StructuredOutputError` (E2), `withValidationRetry` (E2), `StimulusProfileSchema` (E1, integration test only).
- Produces: `class GeminiProvider(apiKey: string, model: string)`, `DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"`, `getProvider(): LlmProvider` (already wrapped in `withValidationRetry`).

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @google/genai
```

No schema-converter dependency: Zod 4 converts natively with `z.toJSONSchema()`.

- [ ] **Step 2: Implement `src/lib/ai/gemini-provider.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseStructured, StructuredOutputError, type GenerateStructuredArgs, type LlmProvider } from "./provider";

// The only file that imports the Gemini SDK.
export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, readonly model: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        systemInstruction: args.systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(args.schema),
      },
    });
    const text = response.text;
    if (!text) throw new StructuredOutputError("GeminiProvider: empty response", "The response was empty.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StructuredOutputError("GeminiProvider: invalid JSON", `The response was not valid JSON: ${text.slice(0, 200)}`);
    }
    return parseStructured(args.schema, parsed, "GeminiProvider");
  }
}
```

> `responseJsonSchema` takes standard JSON Schema (what `z.toJSONSchema` emits, incl. `anyOf` for nullable fields). If Gemini rejects a shape, drop `responseJsonSchema`, keep `responseMimeType`, and append `JSON.stringify(z.toJSONSchema(args.schema))` to the prompt; `parseStructured` still guarantees correctness.

- [ ] **Step 3: Implement `src/lib/ai/index.ts`**

```ts
import type { LlmProvider } from "./provider";
import { GeminiProvider } from "./gemini-provider";
import { withValidationRetry } from "./retry";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function getProvider(): LlmProvider {
  const which = process.env.AI_PROVIDER ?? "gemini";
  if (which !== "gemini") throw new Error(`Unknown AI_PROVIDER: ${which}`);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return withValidationRetry(new GeminiProvider(key, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL));
}
```

- [ ] **Step 4: Write the integration test `tests/ai/gemini-provider.test.ts`** (skips without a key)

It exercises the schema features the engine relies on: enums and nullable fields.

```ts
import { describe, it, expect } from "vitest";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai";
import { StimulusProfileSchema } from "@/lib/engine/types";

const key = process.env.GEMINI_API_KEY;
const maybe = key ? describe : describe.skip;

maybe("GeminiProvider (integration)", () => {
  it("returns schema-valid structured output with enums and nulls", async () => {
    const provider = new GeminiProvider(key!, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    const result = await provider.generateStructured({
      prompt: "Classify the stimulus of: 5 rounds for time of 400 m run and 15 air squats. Use quality conditioning or strength.",
      schema: StimulusProfileSchema,
      schemaName: "StimulusProfile",
    });
    expect(result.quality).toBe("conditioning");
  }, 60000);
});
```

- [ ] **Step 5: Update `.env.example`** — replace the AI block with:

```bash
# AI provider: "gemini" (v1). The model is pinned: change it only deliberately, then run `pnpm eval`.
AI_PROVIDER="gemini"
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.8-flash"
```

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run tests/ai`
Expected: PASS; the Gemini suite is SKIPPED without `GEMINI_API_KEY` (PASS with one).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Gemini provider adapter with a pinned model and the provider factory"
```

---

### Task E4: Analyze — split, stimulus and situation in one call

**Files:**
- Create: `src/lib/engine/render-text.ts`, `src/lib/engine/resolve-blocks.ts`, `src/lib/engine/analyze.ts`
- Test: `tests/engine/render-text.test.ts`, `tests/engine/analyze.test.ts`

**Interfaces:**
- Consumes: E1 schemas, `createMovementResolver` / `MovementResolver` (D5), `getDomainData` / `DomainData` (D5), `LlmProvider` (E2).
- Produces:
  - `@/lib/engine/render-text`: `renderComponent(c: ComponentDraft): string`, `renderBlock(b: Pick<ManualBlock, "title" | "scheme" | "components" | "coachingNotes">): string`, `renderManualWorkout(w: ManualWorkout): string`.
  - `@/lib/engine/resolve-blocks`: `resolveBlocks<B extends { components: ComponentDraft[] }>(blocks: B[], resolve: MovementResolver): Array<Omit<B, "components"> & { components: WorkoutComponent[] }>`.
  - `@/lib/engine/analyze`: `interface AnalyzeContext { movements; contraindications; taxonomy }`, `interface WorkoutAnalysis { workout: StructuredWorkout; conditions: DetectedCondition[]; unavailableEquipment: Equipment[]; analyzed: boolean }`, `analyzePaste(provider, rawText, situation, ctx)`, `analyzeManual(provider, manual, situation, ctx)`, `analyzeSituation(provider, situation, ctx): Promise<SituationAnalysis>`. Schema names: `"PasteAnalysis"`, `"ManualAnalysis"`, `"SituationAnalysis"`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/render-text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderComponent, renderManualWorkout } from "@/lib/engine/render-text";
import { component } from "../fixtures/workouts";

describe("render-text", () => {
  it("renders a component with only its present fields", () => {
    expect(renderComponent(component("Thruster", { reps: 21, load: "43/30 kg" }))).toBe("21 Thruster @ 43/30 kg");
    expect(renderComponent(component("Row (Erg)", { calories: 15, notes: "easy pace" }))).toBe("Row (Erg) 15 cal (easy pace)");
  });

  it("renders a manual workout block by block", () => {
    const text = renderManualWorkout({
      name: "Monday",
      blocks: [
        { title: "Strength", format: "strength", scheme: "5x5", timeDomainMinutes: 15, coachingNotes: "Rest 2 min",
          components: [component("Back Squat", { load: "100 kg" })] },
        { title: null, format: "amrap", scheme: "AMRAP 8", timeDomainMinutes: 8, coachingNotes: null,
          components: [component("Burpee", { reps: 10 })] },
      ],
    });
    expect(text).toBe("Monday\n\nStrength\n5x5\nBack Squat @ 100 kg\nRest 2 min\n\nAMRAP 8\n10 Burpee");
  });

  it("never renders an empty block", () => {
    expect(renderManualWorkout({ name: null, blocks: [{ title: null, format: "rest", scheme: null, timeDomainMinutes: null, coachingNotes: null, components: [] }] }))
      .toBe("(rest)");
  });
});
```

`tests/engine/analyze.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { analyzeManual, analyzePaste, analyzeSituation } from "@/lib/engine/analyze";
import { FRAN_TEXT, component, franDraft, sprint } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulder = { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro derecho" };

describe("analyzePaste", () => {
  it("returns a resolved session, known conditions and unavailable equipment", async () => {
    const draft = franDraft();
    draft.blocks[0].components[1] = component("Pull-ups", { reps: "21-15-9" });
    const provider = new FakeProvider({
      PasteAnalysis: {
        workout: draft,
        conditions: [shoulder, { key: "made_up_key", side: null, severity: "mild", evidence: "?" }],
        unavailableEquipment: ["rower", "rower"],
      },
    });
    const a = await analyzePaste(provider, FRAN_TEXT, "Me duele el hombro derecho. Hoy no hay remo.", domain);
    expect(a.analyzed).toBe(true);
    expect(a.workout.source).toBe("paste");
    expect(a.workout.rawText).toBe(FRAN_TEXT);
    expect(a.workout.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster", "Pull-up"]);
    expect(a.conditions.map((c) => c.key)).toEqual(["shoulder_impingement"]);
    expect(a.unavailableEquipment).toEqual(["rower"]);
  });

  it("sends the library, the catalog, the taxonomy and the situation to the model", async () => {
    const provider = new FakeProvider({ PasteAnalysis: { workout: franDraft(), conditions: [], unavailableEquipment: [] } });
    await analyzePaste(provider, FRAN_TEXT, "Sore right shoulder", domain);
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("- Toes-to-Bar (aka T2B, TTB)");
    expect(prompt).toContain("- shoulder_impingement: Shoulder impingement [injury]");
    expect(prompt).toContain("- glycolytic:");
    expect(prompt).toContain("Sore right shoulder");
    expect(prompt).toContain(FRAN_TEXT);
  });

  it("forces verbatim block text: a paraphrased slice falls back to the session text", async () => {
    const draft = franDraft();
    draft.blocks[0].rawText = "a paraphrase, not a slice";
    const a = await analyzePaste(new FakeProvider({ PasteAnalysis: { workout: draft, conditions: [], unavailableEquipment: [] } }), FRAN_TEXT, "", domain);
    expect(a.workout.blocks[0].rawText).toBe(FRAN_TEXT);
  });

  it("degrades to one raw block and still analyzes the situation", async () => {
    const provider = new FakeProvider({
      PasteAnalysis: new Error("model returned garbage"),
      SituationAnalysis: { conditions: [shoulder], unavailableEquipment: [] },
    });
    const a = await analyzePaste(provider, "cryptic programming", "me duele el hombro derecho", domain);
    expect(a.analyzed).toBe(false);
    expect(a.workout.blocks).toEqual([{
      title: null, rawText: "cryptic programming", day: null, format: "other", scheme: null,
      timeDomainMinutes: null, coachingNotes: null, stimulus: null, components: [],
    }]);
    expect(a.conditions.map((c) => c.key)).toEqual(["shoulder_impingement"]);
  });

  it("skips the situation call when there is no situation", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new Error("garbage") });
    const a = await analyzePaste(provider, "cryptic", "   ", domain);
    expect(a.conditions).toEqual([]);
    expect(provider.calls).toHaveLength(1);
  });

  it("fails rather than ignore stated pain when both calls fail", async () => {
    const provider = new FakeProvider({ PasteAnalysis: new Error("garbage"), SituationAnalysis: new Error("down") });
    await expect(analyzePaste(provider, "cryptic", "me duele la rodilla", domain)).rejects.toThrow("down");
  });
});

describe("analyzeManual", () => {
  const manual = {
    name: "Manual",
    blocks: [
      { title: "A", format: "strength" as const, scheme: "5x5", timeDomainMinutes: 15, coachingNotes: null, components: [component("Back Squat")] },
      { title: "B", format: "amrap" as const, scheme: "AMRAP 8", timeDomainMinutes: 8, coachingNotes: null, components: [component("T2B", { reps: 10 })] },
    ],
  };

  it("renders text, aligns stimuli by block and resolves names", async () => {
    const provider = new FakeProvider({ ManualAnalysis: { stimuli: [null, sprint], conditions: [], unavailableEquipment: [] } });
    const a = await analyzeManual(provider, manual, "", domain);
    expect(a.workout.source).toBe("manual");
    expect(a.workout.blocks[0].rawText).toBe("A\n5x5\nBack Squat");
    expect(a.workout.blocks[1].stimulus).toEqual(sprint);
    expect(a.workout.blocks[1].components[0].canonical).toBe("Toes-to-Bar");
  });

  it("fills missing stimuli with null when the model returns too few", async () => {
    const provider = new FakeProvider({ ManualAnalysis: { stimuli: [sprint], conditions: [], unavailableEquipment: [] } });
    const a = await analyzeManual(provider, manual, "", domain);
    expect(a.workout.blocks[1].stimulus).toBeNull();
  });
});

describe("analyzeSituation", () => {
  it("returns nothing for an empty situation without calling the model", async () => {
    const provider = new FakeProvider({});
    expect(await analyzeSituation(provider, "", domain)).toEqual({ conditions: [], unavailableEquipment: [] });
    expect(provider.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/engine/render-text.test.ts tests/engine/analyze.test.ts` → FAIL (modules not found).

- [ ] **Step 3: Implement `src/lib/engine/render-text.ts`**

```ts
import type { ComponentDraft, ManualBlock, ManualWorkout } from "./types";

export function renderComponent(c: ComponentDraft): string {
  const parts = [
    c.reps != null ? String(c.reps) : null,
    c.movement,
    c.load ? `@ ${c.load}` : null,
    c.distanceMeters != null ? `${c.distanceMeters} m` : null,
    c.calories != null ? `${c.calories} cal` : null,
    c.durationSeconds != null ? `${c.durationSeconds} s` : null,
  ].filter((p): p is string => p !== null);
  return parts.join(" ") + (c.notes ? ` (${c.notes})` : "");
}

export function renderBlock(b: Pick<ManualBlock, "title" | "scheme" | "components" | "coachingNotes"> & { format?: string }): string {
  const lines = [b.title, b.scheme, ...b.components.map(renderComponent), b.coachingNotes]
    .filter((l): l is string => !!l && l.trim().length > 0);
  return lines.length > 0 ? lines.join("\n") : `(${b.format ?? "block"})`;
}

export function renderManualWorkout(w: ManualWorkout): string {
  return [w.name, ...w.blocks.map(renderBlock)].filter((p): p is string => !!p).join("\n\n");
}
```

- [ ] **Step 4: Implement `src/lib/engine/resolve-blocks.ts`**

```ts
import type { MovementResolver } from "@/lib/domain/resolve";
import type { ComponentDraft, WorkoutComponent } from "./types";

/** Attach the canonical library name (or null) to every component; the model never sets it. */
export function resolveBlocks<B extends { components: ComponentDraft[] }>(
  blocks: B[], resolve: MovementResolver,
): Array<Omit<B, "components"> & { components: WorkoutComponent[] }> {
  return blocks.map((b) => ({
    ...b,
    components: b.components.map((c) => ({ ...c, canonical: resolve(c.movement)?.name ?? null })),
  }));
}
```

- [ ] **Step 5: Implement `src/lib/engine/analyze.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { Equipment, type Contraindication, type Movement, type StimulusDef, type StimulusTaxonomy } from "@/lib/domain/types";
import { createMovementResolver } from "@/lib/domain/resolve";
import {
  ManualAnalysisSchema, PasteAnalysisSchema, SituationAnalysisSchema,
  type DetectedCondition, type ManualWorkout, type SituationAnalysis, type StimulusProfile, type StructuredWorkout,
} from "./types";
import { renderBlock, renderManualWorkout } from "./render-text";
import { resolveBlocks } from "./resolve-blocks";

export interface AnalyzeContext {
  movements: Movement[];
  contraindications: Contraindication[];
  taxonomy: StimulusTaxonomy;
}

export interface WorkoutAnalysis extends SituationAnalysis {
  workout: StructuredWorkout;
  analyzed: boolean; // false = degraded to a raw block
}

const SITUATION_RULES = `From the SITUATION text (any language) report:
- "conditions": each injury, limitation or condition it describes, as a key from the CONDITION CATALOG only; never invent keys and omit what does not fit. "side": left/right/both when stated, else null. "severity": "mild" (a niggle), "moderate" (pain that limits training; the default when unclear) or "acute" (recent injury, sharp pain, told to rest). "evidence": the athlete's own words.
- "unavailableEquipment": equipment the athlete says they lack today, only from: ${Equipment.options.join(", ")}.`;

const STIMULUS_RULES = `"stimulus" per block is the intended training effect, using only TAXONOMY keys: "quality", "energySystem" (null when not metabolic, e.g. skill work) and "loadIntensity" (null when unloaded), plus a one-sentence "rationale". Use null for the whole stimulus only for a pure rest block.`;

const PASTE_SYSTEM = `You analyze a functional-fitness training session for a coaching engine. Return JSON only.

WORKOUT
- A session often has several blocks with different formats (strength, conditioning, accessory). Split it into ordered "blocks".
- "rawText" of each block is its exact slice of the input. Never paraphrase.
- If the text spans several days ("Day 1", "Monday", ...), set "day" (1-based) on every block; otherwise null.
- "format": amrap | for_time | emom | intervals | strength | skill | partner | rest | other. "scheme": the prescription as written. "timeDomainMinutes": estimated working time.
- "components": one per movement. "movement": the MOVEMENT LIBRARY name when one matches (exact spelling), otherwise the name as written. "load" as written (e.g. "61/43 kg"); "loadKg" male/female kilograms when explicit (convert lb); "percent1RM" when prescribed as a percentage.
- Keep intensity cues, tempo, rest and scaling tiers (Rx+/Rx/Int, M/F) in "coachingNotes".
- ${STIMULUS_RULES}

SITUATION
${SITUATION_RULES}`;

const MANUAL_SYSTEM = `You classify an athlete-entered training session for a coaching engine. Return JSON only.
- "stimuli": one entry per block, in the given order. ${STIMULUS_RULES}

SITUATION
${SITUATION_RULES}`;

const SITUATION_SYSTEM = `You read an athlete's description of their situation for a coaching engine. Return JSON only.
${SITUATION_RULES}`;

const defs = (title: string, list: StimulusDef[]) => `${title}:\n${list.map((d) => `- ${d.key}: ${d.description}`).join("\n")}`;

function catalogText(ctx: AnalyzeContext): string {
  return `CONDITION CATALOG:\n${ctx.contraindications.map((c) => `- ${c.key}: ${c.label} [${c.kind}]`).join("\n")}`;
}

function vocabularyText(ctx: AnalyzeContext): string {
  const library = ctx.movements
    .map((m) => (m.aliases.length > 0 ? `- ${m.name} (aka ${m.aliases.join(", ")})` : `- ${m.name}`))
    .join("\n");
  const taxonomy = [
    defs("quality", ctx.taxonomy.qualities),
    defs("energySystem", ctx.taxonomy.energySystems),
    defs("loadIntensity", ctx.taxonomy.loadIntensities),
  ].join("\n\n");
  return `MOVEMENT LIBRARY:\n${library}\n\n${catalogText(ctx)}\n\nTAXONOMY:\n${taxonomy}`;
}

const situationText = (situation: string) => `SITUATION:\n"""\n${situation.trim() || "(none)"}\n"""`;

function knownConditions(detected: DetectedCondition[], ctx: AnalyzeContext): DetectedCondition[] {
  const keys = new Set(ctx.contraindications.map((c) => c.key));
  const seen = new Set<string>();
  return detected.filter((d) => {
    if (!keys.has(d.key)) {
      console.warn(`analyze: dropped unknown condition key "${d.key}"`);
      return false;
    }
    if (seen.has(d.key)) return false;
    seen.add(d.key);
    return true;
  });
}

function clean(s: SituationAnalysis, ctx: AnalyzeContext): SituationAnalysis {
  return { conditions: knownConditions(s.conditions, ctx), unavailableEquipment: [...new Set(s.unavailableEquipment)] };
}

export async function analyzeSituation(provider: LlmProvider, situation: string, ctx: AnalyzeContext): Promise<SituationAnalysis> {
  if (situation.trim() === "") return { conditions: [], unavailableEquipment: [] };
  const out = await provider.generateStructured({
    systemPrompt: SITUATION_SYSTEM,
    prompt: `${catalogText(ctx)}\n\n${situationText(situation)}`,
    schema: SituationAnalysisSchema,
    schemaName: "SituationAnalysis",
  });
  return clean(out, ctx);
}

export async function analyzePaste(
  provider: LlmProvider, rawText: string, situation: string, ctx: AnalyzeContext,
): Promise<WorkoutAnalysis> {
  const resolve = createMovementResolver(ctx.movements);
  try {
    const out = await provider.generateStructured({
      systemPrompt: PASTE_SYSTEM,
      prompt: `${vocabularyText(ctx)}\n\n${situationText(situation)}\n\nSESSION:\n"""\n${rawText}\n"""`,
      schema: PasteAnalysisSchema,
      schemaName: "PasteAnalysis",
    });
    // Models paraphrase: a block slice that is not in the input falls back to the session text.
    const blocks = out.workout.blocks.map((b) => (rawText.includes(b.rawText) ? b : { ...b, rawText }));
    return {
      workout: { name: out.workout.name, rawText, source: "paste", blocks: resolveBlocks(blocks, resolve) },
      ...clean(out, ctx),
      analyzed: true,
    };
  } catch (e) {
    console.error("analyzePaste failed; degrading to a raw block", e);
    const s = await analyzeSituation(provider, situation, ctx); // stated pain is never ignored
    return {
      workout: {
        name: null, rawText, source: "paste",
        blocks: [{
          title: null, rawText, day: null, format: "other", scheme: null,
          timeDomainMinutes: null, coachingNotes: null, stimulus: null, components: [],
        }],
      },
      ...s,
      analyzed: false,
    };
  }
}

export async function analyzeManual(
  provider: LlmProvider, manual: ManualWorkout, situation: string, ctx: AnalyzeContext,
): Promise<WorkoutAnalysis> {
  const resolve = createMovementResolver(ctx.movements);
  const rawText = renderManualWorkout(manual);
  const build = (stimuli: (StimulusProfile | null)[]): StructuredWorkout => ({
    name: manual.name, rawText, source: "manual",
    blocks: resolveBlocks(
      manual.blocks.map((b, i) => ({ ...b, rawText: renderBlock(b), day: null, stimulus: stimuli[i] ?? null })),
      resolve,
    ),
  });
  try {
    const out = await provider.generateStructured({
      systemPrompt: MANUAL_SYSTEM,
      prompt: `${vocabularyText(ctx)}\n\n${situationText(situation)}\n\nSESSION (one entry per block, in order):\n${
        manual.blocks.map((b, i) => `[block ${i}]\n${renderBlock(b)}`).join("\n\n")
      }`,
      schema: ManualAnalysisSchema,
      schemaName: "ManualAnalysis",
    });
    return { workout: build(out.stimuli), ...clean(out, ctx), analyzed: true };
  } catch (e) {
    console.error("analyzeManual failed; continuing without stimulus", e);
    const s = await analyzeSituation(provider, situation, ctx);
    return { workout: build([]), ...s, analyzed: false };
  }
}
```

- [ ] **Step 6: Run them, verify they pass**

Run: `pnpm exec vitest run tests/engine` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: analyze step (blocks, per-block stimulus and situation in one call, verbatim guard, safe fallback)"
```

---

### Task E5: Active conditions and the deterministic component plan

**Files:**
- Create: `src/lib/engine/conditions.ts`, `src/lib/engine/plan.ts`
- Test: `tests/engine/conditions.test.ts`, `tests/engine/plan.test.ts`

**Interfaces:**
- Consumes: `assessMovement`, `ActiveCondition`, `AssessmentReason`, `Verdict` (D1); `MovementResolver` (D5); E1 types.
- Produces:
  - `@/lib/engine/conditions`: `profileConditionRefs(injuries: ProfileInjury[]): ConditionRef[]`, `interface ActivatedConditions { active: ActiveCondition[]; refs: ConditionRef[] }` (index-aligned), `activateConditions(base: ConditionRef[], detected: DetectedCondition[], catalog: Contraindication[]): ActivatedConditions`.
  - `@/lib/engine/plan`: `availableEquipment(profile: Equipment[] | null, today: Equipment[] | null, unavailable: Equipment[]): Equipment[] | null`, `missingEquipment(m, equipment): Equipment[]`, `interface Candidate { name: string; verdict: "ok" | "caution"; source: "substitute" | "pattern" | "goal"; score: number }`, `interface PlanContext { movements: Movement[]; resolve: MovementResolver; active: ActiveCondition[]; equipment: Equipment[] | null }`, `interface ComponentPlan { blockIndex: number; componentIndex: number; movement: string; canonical: string | null; verdict: Verdict | "unknown"; reasons: AssessmentReason[]; missingEquipment: Equipment[]; needsChange: boolean; candidates: Candidate[] }`, `rankCandidates(original, ctx, limit = 5): Candidate[]`, `planComponents(workout, ctx): ComponentPlan[]`, `goalFamily(target: string | null, ctx): Candidate[]`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/conditions.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { activateConditions, profileConditionRefs } from "@/lib/engine/conditions";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

describe("activateConditions", () => {
  it("keeps profile injuries and lets today's detection override the same key", () => {
    const base = profileConditionRefs([
      { key: "knee_pain", side: "left", severity: "mild", notes: "old", since: null },
      { key: "hand_tear", side: null, severity: "moderate", notes: null, since: null },
    ]);
    const { active, refs } = activateConditions(base, [
      { key: "knee_pain", side: "left", severity: "acute", evidence: "me la torcí ayer" },
    ], domain.contraindications);
    expect(refs.map((r) => [r.key, r.severity, r.source])).toEqual([
      ["knee_pain", "acute", "today"],
      ["hand_tear", "moderate", "profile"],
    ]);
    expect(active.map((a) => a.contraindication.key)).toEqual(["knee_pain", "hand_tear"]);
    expect(active[0].side).toBe("left");
  });

  it("drops keys missing from the catalog", () => {
    const { refs } = activateConditions(
      [{ key: "gone", side: null, severity: "mild", source: "profile", evidence: null }], [], domain.contraindications,
    );
    expect(refs).toEqual([]);
  });
});
```

`tests/engine/plan.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { ActiveCondition } from "@/lib/domain/assess";
import type { Equipment } from "@/lib/domain/types";
import { availableEquipment, goalFamily, planComponents, rankCandidates, type PlanContext } from "@/lib/engine/plan";
import { component, fran } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

function ctx(conditions: [string, "mild" | "moderate" | "acute"][] = [], equipment: Equipment[] | null = null): PlanContext {
  const active: ActiveCondition[] = conditions.map(([key, severity]) => ({
    contraindication: domain.contraindications.find((c) => c.key === key)!, side: null, severity,
  }));
  return { movements: domain.movements, resolve: createMovementResolver(domain.movements), active, equipment };
}
const movement = (name: string) => domain.movements.find((m) => m.name === name)!;

describe("availableEquipment", () => {
  it("is null (a full box) when nothing is specified or missing", () => {
    expect(availableEquipment(null, null, [])).toBeNull();
  });
  it("removes today's missing items from a full box", () => {
    const e = availableEquipment(null, null, ["rower"])!;
    expect(e).not.toContain("rower");
    expect(e).toContain("barbell");
  });
  it("prefers today's equipment over the profile", () => {
    expect(availableEquipment(["barbell"], ["dumbbell", "rower"], ["rower"])).toEqual(["dumbbell"]);
  });
});

describe("rankCandidates", () => {
  it("keeps listed substitutes that survive, in order", () => {
    const c = rankCandidates(movement("Thruster"), ctx([["shoulder_impingement", "moderate"]]));
    expect(c).toEqual([{ name: "Kettlebell Goblet Squat", verdict: "ok", source: "substitute", score: 1000 }]);
  });

  it("filters substitutes by equipment", () => {
    const c = rankCandidates(movement("Row (Erg)"), ctx([], ["barbell", "pullup_bar"]));
    expect(c.map((x) => x.name)).toEqual(["Run"]);
  });

  it("falls back to the primary pattern only when every substitute is blocked", () => {
    const c = rankCandidates(movement("Handstand Walk"), ctx([["no_inversion", "moderate"]]));
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) {
      expect(x.source).toBe("pattern");
      expect(movement(x.name).patterns).toContain("carry");
      expect(movement(x.name).positions).not.toContain("inverted");
    }
  });
});

describe("planComponents", () => {
  it("marks contraindicated components for change and lists candidates", () => {
    const plan = planComponents(fran(), ctx([["shoulder_impingement", "moderate"]]));
    expect(plan.map((p) => [p.canonical, p.verdict, p.needsChange])).toEqual([
      ["Thruster", "avoid", true],
      ["Pull-up", "avoid", true],
    ]);
    expect(plan[1].candidates[0]).toMatchObject({ name: "Ring Row", verdict: "ok" });
  });

  it("flags missing equipment as a required change", () => {
    const plan = planComponents(fran(), ctx([], ["dumbbell"]));
    expect(plan[0].missingEquipment).toEqual(["barbell"]);
    expect(plan[0].needsChange).toBe(true);
  });

  it("offers alternatives for a caution without forcing a change", () => {
    const w = fran();
    w.blocks[0].components = [{ ...component("Dead Hang"), canonical: "Dead Hang" }];
    const [p] = planComponents(w, ctx([["hand_tear", "moderate"]]));
    expect(p.verdict).toBe("caution");
    expect(p.needsChange).toBe(false);
    expect(p.candidates.length).toBeGreaterThan(0);
  });

  it("reports an unrecognized movement as unknown", () => {
    const w = fran();
    w.blocks[0].components = [{ ...component("Zercher Carry"), canonical: null }];
    expect(planComponents(w, ctx())[0]).toMatchObject({ verdict: "unknown", needsChange: false, candidates: [] });
  });
});

describe("goalFamily", () => {
  it("returns the target and its usable substitutes", () => {
    expect(goalFamily("T2B", ctx()).map((c) => c.name)).toEqual([
      "Toes-to-Bar", "Knees-to-Elbows", "Hanging Knee Raise", "Sit-up", "Strict Toes-to-Bar",
    ]);
  });
  it("drops family members the athlete cannot do", () => {
    expect(goalFamily("Toes-to-Bar", ctx([["no_hanging", "moderate"]])).map((c) => c.name)).toEqual(["Sit-up"]);
  });
  it("is empty without a target", () => {
    expect(goalFamily(null, ctx())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/engine/conditions.test.ts tests/engine/plan.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/engine/conditions.ts`**

```ts
import type { ActiveCondition } from "@/lib/domain/assess";
import type { Contraindication } from "@/lib/domain/types";
import type { ConditionRef, DetectedCondition, ProfileInjury } from "./types";

export interface ActivatedConditions {
  active: ActiveCondition[]; // index-aligned with refs
  refs: ConditionRef[];
}

export function profileConditionRefs(injuries: ProfileInjury[]): ConditionRef[] {
  return injuries.map((i) => ({ key: i.key, side: i.side, severity: i.severity, source: "profile", evidence: i.notes }));
}

/** base (profile or a previous result) ⊕ today's detections; for the same key today's side/severity win. */
export function activateConditions(
  base: ConditionRef[], detected: DetectedCondition[], catalog: Contraindication[],
): ActivatedConditions {
  const merged = new Map<string, ConditionRef>();
  for (const r of base) merged.set(r.key, r);
  for (const d of detected) {
    merged.set(d.key, { key: d.key, side: d.side, severity: d.severity, source: "today", evidence: d.evidence });
  }
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const out: ActivatedConditions = { active: [], refs: [] };
  for (const ref of merged.values()) {
    const contraindication = byKey.get(ref.key);
    if (!contraindication) {
      console.warn(`conditions: unknown key "${ref.key}" ignored`);
      continue;
    }
    out.active.push({ contraindication, side: ref.side, severity: ref.severity });
    out.refs.push(ref);
  }
  return out;
}
```

- [ ] **Step 4: Implement `src/lib/engine/plan.ts`**

```ts
import { assessMovement, type ActiveCondition, type AssessmentReason, type Verdict } from "@/lib/domain/assess";
import type { MovementResolver } from "@/lib/domain/resolve";
import { Equipment, type Movement } from "@/lib/domain/types";
import type { StructuredWorkout } from "./types";

export interface PlanContext {
  movements: Movement[];
  resolve: MovementResolver;
  active: ActiveCondition[];
  equipment: Equipment[] | null; // null = a full box
}

export interface Candidate {
  name: string;
  verdict: "ok" | "caution";
  source: "substitute" | "pattern" | "goal";
  score: number;
}

export interface ComponentPlan {
  blockIndex: number;
  componentIndex: number;
  movement: string;
  canonical: string | null;
  verdict: Verdict | "unknown";
  reasons: AssessmentReason[];
  missingEquipment: Equipment[];
  needsChange: boolean;
  candidates: Candidate[];
}

/** Today's equipment overrides the profile; null with nothing missing means a full box. */
export function availableEquipment(
  profile: Equipment[] | null, today: Equipment[] | null, unavailable: Equipment[],
): Equipment[] | null {
  const base = today ?? profile;
  if (base === null && unavailable.length === 0) return null;
  return (base ?? Equipment.options).filter((e) => !unavailable.includes(e));
}

export function missingEquipment(m: Movement, equipment: Equipment[] | null): Equipment[] {
  return equipment === null ? [] : m.equipment.filter((e) => !equipment.includes(e));
}

function usable(m: Movement, ctx: PlanContext): "ok" | "caution" | null {
  if (missingEquipment(m, ctx.equipment).length > 0) return null;
  const v = assessMovement(m, ctx.active).verdict;
  return v === "avoid" ? null : v;
}

function sharedStressPairs(a: Movement, b: Movement): number {
  let n = 0;
  for (const sa of a.stresses) {
    for (const sb of b.stresses) {
      if (sa.site === sb.site) n += sa.mechanisms.filter((m) => sb.mechanisms.includes(m)).length;
    }
  }
  return n;
}

const VERDICT_RANK = { ok: 0, caution: 1 } as const;
const byRank = (a: Candidate, b: Candidate) =>
  VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.score - a.score || a.name.localeCompare(b.name);

/** substitutes[] first (in order); the primary-pattern fallback only when none survives. */
export function rankCandidates(original: Movement, ctx: PlanContext, limit = 5): Candidate[] {
  const listed: Candidate[] = [];
  original.substitutes.forEach((name, i) => {
    const m = ctx.resolve(name);
    const verdict = m ? usable(m, ctx) : null;
    if (m && verdict) listed.push({ name: m.name, verdict, source: "substitute", score: 1000 - i });
  });
  if (listed.length > 0) return listed.sort(byRank).slice(0, limit);

  const primary = original.patterns[0];
  const fallback: Candidate[] = [];
  for (const m of ctx.movements) {
    if (m.name === original.name || !m.patterns.includes(primary)) continue;
    const verdict = usable(m, ctx);
    if (!verdict) continue;
    const score =
      10 * m.patterns.filter((p) => original.patterns.includes(p)).length +
      2 * sharedStressPairs(original, m) +
      (m.skill === original.skill ? 1 : 0);
    fallback.push({ name: m.name, verdict, source: "pattern", score });
  }
  return fallback.sort(byRank).slice(0, limit);
}

export function planComponents(workout: StructuredWorkout, ctx: PlanContext): ComponentPlan[] {
  return workout.blocks.flatMap((block, blockIndex) =>
    block.components.map((c, componentIndex): ComponentPlan => {
      const m = c.canonical ? ctx.resolve(c.canonical) : null;
      if (!m) {
        return {
          blockIndex, componentIndex, movement: c.movement, canonical: null, verdict: "unknown",
          reasons: [], missingEquipment: [], needsChange: false, candidates: [],
        };
      }
      const assessment = assessMovement(m, ctx.active);
      const missing = missingEquipment(m, ctx.equipment);
      const needsChange = assessment.verdict === "avoid" || missing.length > 0;
      return {
        blockIndex, componentIndex, movement: c.movement, canonical: m.name, verdict: assessment.verdict,
        reasons: assessment.reasons, missingEquipment: missing, needsChange,
        candidates: needsChange || assessment.verdict === "caution" ? rankCandidates(m, ctx) : [],
      };
    }),
  );
}

/** Movement-goal bias: the target and its substitutes the athlete can do today. */
export function goalFamily(target: string | null, ctx: PlanContext): Candidate[] {
  const m = target ? ctx.resolve(target) : null;
  if (!m) return [];
  const out: Candidate[] = [];
  for (const name of [m.name, ...m.substitutes]) {
    const x = ctx.resolve(name);
    const verdict = x ? usable(x, ctx) : null;
    if (x && verdict) out.push({ name: x.name, verdict, source: "goal", score: 0 });
  }
  return out;
}
```

- [ ] **Step 5: Run them, verify they pass**

Run: `pnpm exec vitest run tests/engine` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: active conditions and the deterministic component plan with ranked candidates"
```

---

### Task E6: Tailor — grounded prompt and the tailoring call

**Files:**
- Create: `src/lib/engine/tailor.ts`
- Test: `tests/engine/tailor.test.ts`

**Interfaces:**
- Consumes: E1 types, `ComponentPlan`, `Candidate` (E5), `Contraindication`, `Conversions`, `Movement`, `Equipment` (D), `resolveBlocks` (E4), `LlmProvider` (E2).
- Produces: `interface TailorInput { original: StructuredWorkout; profile: AthleteProfile; request: TailorRequest; conditions: ConditionRef[]; contraindications: Contraindication[]; plan: ComponentPlan[]; goal: Candidate[]; equipment: Equipment[] | null; movements: Movement[]; conversions: Conversions; previousAttempt: { result: TailoringResult; feedbackHistory: string[] } | null; violations: Finding[] }`, `buildTailorPrompt(input): string`, `tailor(provider, input): Promise<TailoringResult>` (schema name `"TailoringResult"`).

- [ ] **Step 1: Write the failing test `tests/engine/tailor.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { planComponents, goalFamily } from "@/lib/engine/plan";
import { buildTailorPrompt, tailor, type TailorInput } from "@/lib/engine/tailor";
import { emptyProfile, emptyRequest } from "@/lib/engine/types";
import { component, fran, identityResult, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

function input(overrides: Partial<TailorInput> = {}): TailorInput {
  const shoulder = domain.contraindications.find((c) => c.key === "shoulder_impingement")!;
  const ctx = {
    movements: domain.movements, resolve: createMovementResolver(domain.movements),
    active: [{ contraindication: shoulder, side: "right" as const, severity: "moderate" as const }], equipment: null,
  };
  return {
    original: fran(),
    profile: { ...emptyProfile(), sex: "female", scalingLevel: "rx" },
    request: { ...emptyRequest(), situation: "Me duele el hombro derecho", targetMovement: "Toes-to-Bar" },
    conditions: [{ key: "shoulder_impingement", side: "right", severity: "moderate", source: "today", evidence: "Me duele el hombro derecho" }],
    contraindications: domain.contraindications,
    plan: planComponents(fran(), ctx),
    goal: goalFamily("Toes-to-Bar", ctx),
    equipment: null,
    movements: domain.movements,
    conversions: domain.conversions,
    previousAttempt: null,
    violations: [],
    ...overrides,
  };
}

describe("buildTailorPrompt", () => {
  it("grounds the model in the plan, the conditions and the candidates", () => {
    const p = buildTailorPrompt(input());
    expect(p).toContain("[b0.c0] Thruster → AVOID");
    expect(p).toContain("MUST CHANGE");
    expect(p).toContain("candidates: Kettlebell Goblet Squat (ok)");
    expect(p).toContain("- shoulder_impingement (Shoulder impingement) side=right severity=moderate source=today");
    expect(p).toContain("EQUIPMENT AVAILABLE: a full box");
    expect(p).toContain("- Kettlebell Goblet Squat [squat; beginner; equip: kettlebell;");
    // shoulder_impingement blocks kipping, so only the strict/supported members of the family survive
    expect(p).toContain("GOAL FAMILY: Hanging Knee Raise (caution), Sit-up (ok), Strict Toes-to-Bar (caution)");
    expect(p).toContain("Run 400/400 meters = Row (Erg) 500/500 meters");
    expect(p).toContain('"sex":"female"');
    expect(p).not.toContain("PREVIOUS ATTEMPT");
    expect(p).not.toContain("REJECTED");
  });

  it("lists the athlete's equipment when it is restricted", () => {
    expect(buildTailorPrompt(input({ equipment: ["dumbbell", "box"] }))).toContain("EQUIPMENT AVAILABLE: dumbbell, box");
  });

  it("adds the refine section with the rejected attempt and the feedback history", () => {
    const p = buildTailorPrompt(input({
      previousAttempt: { result: identityResult(fran()), feedbackHistory: ["too easy", "still hurts"] },
    }));
    expect(p).toContain("PREVIOUS ATTEMPT");
    expect(p).toContain("- too easy\n- still hurts");
  });

  it("adds the rejected findings on a retry", () => {
    const p = buildTailorPrompt(input({
      violations: [{ kind: "contraindicated_movement", severity: "violation", blockIndex: 0, movement: "Thruster", message: "Thruster is contraindicated." }],
    }));
    expect(p).toContain("REJECTED BY THE SAFETY CHECK");
    expect(p).toContain("- [contraindicated_movement] Thruster is contraindicated.");
  });
});

describe("tailor", () => {
  it("returns the modification with canonical names resolved by code", async () => {
    const draft = toTailoringDraft(fran());
    draft.blocks[0].components = [component("KB Goblet Squat", { reps: "21-15-9" }), component("Ring Rows", { reps: "21-15-9" })];
    const result = await tailor(new FakeProvider({ TailoringResult: draft }), input());
    expect(result.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/tailor.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/engine/tailor.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { Contraindication, Conversions, Equipment, Movement } from "@/lib/domain/types";
import type { Candidate, ComponentPlan } from "./plan";
import { resolveBlocks } from "./resolve-blocks";
import {
  TailoringDraftSchema,
  type AthleteProfile, type ConditionRef, type Finding, type StructuredWorkout, type TailorRequest, type TailoringResult,
} from "./types";

export interface TailorInput {
  original: StructuredWorkout;
  profile: AthleteProfile;
  request: TailorRequest;
  conditions: ConditionRef[];
  contraindications: Contraindication[];
  plan: ComponentPlan[];
  goal: Candidate[];
  equipment: Equipment[] | null;
  movements: Movement[];
  conversions: Conversions;
  previousAttempt: { result: TailoringResult; feedbackHistory: string[] } | null;
  violations: Finding[];
}

const SYSTEM = `You are an expert functional fitness coach. Modify ONE athlete's training session for today so it fits their situation WHILE PRESERVING EACH BLOCK'S STIMULUS (quality, energy system, load intensity, time domain). Return JSON only.

Hard rules (code checks the output and rejects violations):
1. Never prescribe a movement marked AVOID, nor one that needs MISSING equipment. Replace every component marked MUST CHANGE, preferring its candidates in order.
2. Spell every movement exactly as in the MOVEMENT LIBRARY.
3. Each tailored block lists in "sourceBlocks" the 0-based indices of the original blocks it comes from. Every original block appears in some "sourceBlocks" or in "droppedBlocks" with a reason.
4. With a time cap, the sum of "timeDomainMinutes" over the tailored blocks must not exceed it.
5. Keep each block's "stimulus" unless a change is unavoidable; then explain it in "changes".

Coaching rules:
- CAUTION movements may stay at reduced load or range: say so in the component "notes" and in "safetyNote". "healthy side only" means single-limb work on the uninjured side.
- Scale loads to the athlete's benchmarks, sex and scaling level; when the programming lists tiers (Rx+/Rx/Int, M/F) pick the athlete's. Fill "loadKg" or "percent1RM" whenever you set a load.
- Use the EFFORT CONVERSIONS when swapping monostructural or rope work, and the implement load range when replacing a barbell with dumbbells or kettlebells.
- Blocks with different "day" values are missed days: merge and prioritize them into ONE session that fits today, keeping the most important stimuli.
- A target movement means: bias the session toward its GOAL FAMILY without breaking the stimulus.
- With no constraint, keep the session and only personalize loads.
- Be conservative with pain: when unsure choose the lower-risk option, and recommend consulting a professional in "safetyNote".
- "rawText" (session and each block) is clean text of the MODIFIED workout. "rationale" explains how the stimulus is preserved; "changes" lists original/modified/reason with the tailored "blockIndex". Write prose in the language of the athlete's situation (English if none).`;

function annotate(m: Movement): string {
  const stresses = m.stresses
    .map((s) => `${s.site}(${s.mechanisms.join(",")}${s.load === "low" ? ", low" : ""})`)
    .join(" ") || "none";
  return `- ${m.name} [${m.patterns.join("+")}; ${m.skill}; equip: ${m.equipment.join("+") || "none"}; stresses: ${stresses}; positions: ${m.positions.join(",") || "none"}${m.unilateral ? `; unilateral: ${m.unilateral}` : ""}]`;
}

function planLine(p: ComponentPlan): string {
  const head = `[b${p.blockIndex}.c${p.componentIndex}] ${p.canonical ?? p.movement}`;
  if (p.verdict === "unknown") return `${head} → UNRECOGNIZED (not in the library: judge it against the active conditions yourself)`;
  const parts = [`${head} → ${p.verdict.toUpperCase()}`];
  if (p.reasons.length > 0) {
    parts.push(`(${p.reasons.map((r) => `${r.conditionKey}: ${r.detail}${r.healthySideOnly ? ", healthy side only" : ""}`).join("; ")})`);
  }
  if (p.missingEquipment.length > 0) parts.push(`missing: ${p.missingEquipment.join(", ")}`);
  if (p.needsChange) parts.push("MUST CHANGE");
  if (p.candidates.length > 0) parts.push(`candidates: ${p.candidates.map((c) => `${c.name} (${c.verdict})`).join(", ")}`);
  return parts.join("; ");
}

export function buildTailorPrompt(input: TailorInput): string {
  const byName = new Map(input.movements.map((m) => [m.name, m]));
  const catalog = new Map(input.contraindications.map((c) => [c.key, c]));
  const detailed = [...new Set([...input.plan.flatMap((p) => p.candidates), ...input.goal].map((c) => c.name))]
    .map((n) => byName.get(n))
    .filter((m): m is Movement => m !== undefined);

  const parts = [
    `ORIGINAL SESSION (block index in brackets):\n${input.original.blocks.map((b, i) => `[${i}] ${JSON.stringify({
      title: b.title, day: b.day, format: b.format, scheme: b.scheme, timeDomainMinutes: b.timeDomainMinutes,
      stimulus: b.stimulus, coachingNotes: b.coachingNotes, rawText: b.rawText, components: b.components,
    })}`).join("\n")}`,
    `ATHLETE:\n${JSON.stringify({
      sex: input.profile.sex, scalingLevel: input.profile.scalingLevel, benchmarks: input.profile.benchmarks,
      goals: input.profile.goals, minutesPerDay: input.profile.availability.minutesPerDay,
    })}`,
    `TODAY:\n${JSON.stringify({
      situation: input.request.situation, timeCapMinutes: input.request.timeCapMinutes, targetMovement: input.request.targetMovement,
    })}`,
    `ACTIVE CONDITIONS:\n${input.conditions.map((r) => {
      const c = catalog.get(r.key);
      return `- ${r.key} (${c?.label ?? r.key}) side=${r.side ?? "n/a"} severity=${r.severity} source=${r.source}${r.evidence ? `: "${r.evidence}"` : ""}${c?.notes ? ` — ${c.notes}` : ""}`;
    }).join("\n") || "none"}`,
    `EQUIPMENT AVAILABLE: ${input.equipment === null ? "a full box (assume everything)" : input.equipment.join(", ") || "none (bodyweight only)"}`,
    `COMPONENT PLAN:\n${input.plan.map(planLine).join("\n") || "(no components extracted: work from the block rawText)"}`,
    `GOAL FAMILY: ${input.goal.map((c) => `${c.name} (${c.verdict})`).join(", ") || "none"}`,
    `CANDIDATE DETAILS:\n${detailed.map(annotate).join("\n") || "none"}`,
    `EFFORT CONVERSIONS (approximate, male/female):\n${[
      ...input.conversions.effort.map((g) => `- ${g.equivalents.map((e) => `${e.movement} ${e.male}/${e.female} ${e.unit}`).join(" = ")} (${g.note})`),
      ...input.conversions.implementLoad.map((r) => `- ${r.from} → ${r.to}: ${r.perHandFraction.low}-${r.perHandFraction.high} of the barbell load per hand (${r.note})`),
    ].join("\n")}`,
    `MOVEMENT LIBRARY (names): ${input.movements.map((m) => m.name).join(", ")}`,
  ];
  if (input.previousAttempt) {
    parts.push(
      `PREVIOUS ATTEMPT (rejected by the athlete):\n${JSON.stringify(input.previousAttempt.result)}\n` +
      `ATHLETE FEEDBACK (oldest first):\n${input.previousAttempt.feedbackHistory.map((f) => `- ${f}`).join("\n")}\n` +
      `Produce a NEW modification of the ORIGINAL session that addresses the latest feedback while following every rule.`,
    );
  }
  if (input.violations.length > 0) {
    parts.push(
      `YOUR PREVIOUS OUTPUT WAS REJECTED BY THE SAFETY CHECK:\n${input.violations.map((v) => `- [${v.kind}] ${v.message}`).join("\n")}\nFix every item.`,
    );
  }
  parts.push("Return the tailored session as JSON.");
  return parts.join("\n\n");
}

export async function tailor(provider: LlmProvider, input: TailorInput): Promise<TailoringResult> {
  const draft = await provider.generateStructured({
    systemPrompt: SYSTEM,
    prompt: buildTailorPrompt(input),
    schema: TailoringDraftSchema,
    schemaName: "TailoringResult",
  });
  return { ...draft, blocks: resolveBlocks(draft.blocks, createMovementResolver(input.movements)) };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/tailor.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tailor step grounded by the component plan, candidates, conversions and benchmarks"
```

---

### Task E7: Deterministic validator

**Files:**
- Create: `src/lib/engine/validate.ts`
- Test: `tests/engine/validate.test.ts`

**Interfaces:**
- Consumes: `assessMovement`, `ActiveCondition`, `AssessmentReason` (D1); `createMovementResolver`, `normalizeMovementName` (D5); `missingEquipment` (E5); E1 types.
- Produces: `interface ValidateArgs { original: StructuredWorkout; result: TailoringResult; movements: Movement[]; active: ActiveCondition[]; equipment: Equipment[] | null; timeCapMinutes: number | null }`, `validateTailoring(args): Finding[]`, `isViolation(f: Finding): boolean`.

- [ ] **Step 1: Write the failing test `tests/engine/validate.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import type { ActiveCondition } from "@/lib/domain/assess";
import { validateTailoring, type ValidateArgs } from "@/lib/engine/validate";
import type { TailoringResult } from "@/lib/engine/types";
import { fran, identityResult, split, sprint } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const condition = (key: string): ActiveCondition => ({
  contraindication: domain.contraindications.find((c) => c.key === key)!, side: null, severity: "moderate",
});

const identity = (original = fran()): TailoringResult => identityResult(original);

function run(overrides: Partial<ValidateArgs> = {}) {
  return validateTailoring({
    original: fran(), result: identity(), movements: domain.movements, active: [], equipment: null, timeCapMinutes: null,
    ...overrides,
  });
}

const swap = (r: TailoringResult, movement: string, canonical: string | null) => {
  r.blocks[0].components[0] = { ...r.blocks[0].components[0], movement, canonical };
  return r;
};

describe("validateTailoring", () => {
  it("accepts an identity result with no conditions", () => {
    expect(run()).toEqual([]);
  });

  it("flags a contraindicated movement as a violation", () => {
    const f = run({ active: [condition("shoulder_impingement")] });
    expect(f.filter((x) => x.kind === "contraindicated_movement").map((x) => x.movement)).toEqual(["Thruster", "Pull-up"]);
    expect(f.every((x) => x.severity === "violation")).toBe(true);
  });

  it("warns about a caution movement", () => {
    const r = swap(identity(), "Dead Hang", "Dead Hang");
    const f = run({ result: r, active: [condition("hand_tear")] });
    expect(f.find((x) => x.movement === "Dead Hang")).toMatchObject({ kind: "caution_movement", severity: "warning" });
  });

  it("flags missing equipment", () => {
    const f = run({ equipment: ["pullup_bar"] });
    expect(f).toContainEqual(expect.objectContaining({ kind: "equipment_unavailable", movement: "Thruster", severity: "violation" }));
  });

  it("rejects a newly introduced unknown movement but only warns about one kept from the original", () => {
    expect(run({ result: swap(identity(), "Zercher Carry", null) }))
      .toContainEqual(expect.objectContaining({ kind: "unrecognized_movement", severity: "violation" }));
    const original = fran();
    original.blocks[0].components[0] = { ...original.blocks[0].components[0], movement: "Zercher Carry", canonical: null };
    expect(run({ original, result: identity(original) }))
      .toContainEqual(expect.objectContaining({ kind: "unrecognized_movement", severity: "warning" }));
  });

  it("enforces the time cap with 10% tolerance", () => {
    expect(run({ timeCapMinutes: 6 })).toEqual([]);
    const r = identity();
    r.blocks[0].timeDomainMinutes = 7;
    expect(run({ result: r, timeCapMinutes: 6 })).toEqual([
      expect.objectContaining({ kind: "time_cap_exceeded", severity: "violation" }),
    ]);
  });

  it("rejects a changed block quality and warns about a changed energy system", () => {
    const r = identity();
    r.blocks[0].stimulus = { ...sprint, quality: "strength" };
    expect(run({ result: r })).toContainEqual(expect.objectContaining({ kind: "stimulus_drift", severity: "violation" }));
    const r2 = identity();
    r2.blocks[0].stimulus = { ...sprint, energySystem: "oxidative" };
    expect(run({ result: r2 })).toContainEqual(expect.objectContaining({ kind: "stimulus_drift", severity: "warning" }));
  });

  it("requires every original block to be mapped or dropped", () => {
    const original = split();
    const r = identity(original);
    r.blocks = [r.blocks[0]];
    expect(run({ original, result: r })).toContainEqual(expect.objectContaining({ kind: "unaccounted_block", blockIndex: 1 }));
    r.droppedBlocks = [{ index: 1, reason: "No time today." }];
    expect(run({ original, result: r }).filter((x) => x.kind === "unaccounted_block")).toEqual([]);
  });

  it("skips the stimulus check for merged blocks", () => {
    const original = split();
    const r = identity(original);
    r.blocks = [{ ...r.blocks[1], sourceBlocks: [0, 1] }];
    expect(run({ original, result: r }).filter((x) => x.kind === "stimulus_drift")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/validate.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/engine/validate.ts`**

```ts
import { assessMovement, type ActiveCondition, type AssessmentReason } from "@/lib/domain/assess";
import { createMovementResolver, normalizeMovementName } from "@/lib/domain/resolve";
import type { Equipment, Movement } from "@/lib/domain/types";
import { missingEquipment } from "./plan";
import type { Finding, LoadIntensity, StructuredWorkout, TailoringResult } from "./types";

export interface ValidateArgs {
  original: StructuredWorkout;
  result: TailoringResult;
  movements: Movement[];
  active: ActiveCondition[];
  equipment: Equipment[] | null;
  timeCapMinutes: number | null;
}

export const isViolation = (f: Finding) => f.severity === "violation";

const describeReasons = (reasons: AssessmentReason[]) => reasons.map((r) => `${r.conditionKey}: ${r.detail}`).join("; ");
const LOAD_RANK: Record<LoadIntensity, number> = { light: 0, moderate: 1, heavy: 2 };

export function validateTailoring(a: ValidateArgs): Finding[] {
  const resolve = createMovementResolver(a.movements);
  const findings: Finding[] = [];
  const originalNames = new Set(
    a.original.blocks.flatMap((b) => b.components.map((c) => normalizeMovementName(c.movement))),
  );

  a.result.blocks.forEach((block, blockIndex) => {
    for (const c of block.components) {
      const m = c.canonical ? resolve(c.canonical) : null;
      if (!m) {
        const kept = originalNames.has(normalizeMovementName(c.movement));
        findings.push({
          kind: "unrecognized_movement", severity: kept ? "warning" : "violation", blockIndex, movement: c.movement,
          message: kept
            ? `"${c.movement}" is not in the movement library, so it could not be checked against your conditions.`
            : `"${c.movement}" is not in the movement library.`,
        });
        continue;
      }
      const assessment = assessMovement(m, a.active);
      if (assessment.verdict === "avoid") {
        findings.push({
          kind: "contraindicated_movement", severity: "violation", blockIndex, movement: m.name,
          message: `${m.name} is contraindicated (${describeReasons(assessment.reasons.filter((r) => r.verdict === "avoid"))}).`,
        });
      } else if (assessment.verdict === "caution") {
        const healthySide = assessment.reasons.some((r) => r.healthySideOnly);
        findings.push({
          kind: "caution_movement", severity: "warning", blockIndex, movement: m.name,
          message: `${m.name}: use caution (${describeReasons(assessment.reasons)})${healthySide ? "; healthy side only" : ""}.`,
        });
      }
      const missing = missingEquipment(m, a.equipment);
      if (missing.length > 0) {
        findings.push({
          kind: "equipment_unavailable", severity: "violation", blockIndex, movement: m.name,
          message: `${m.name} needs ${missing.join(", ")}, which is not available.`,
        });
      }
    }
  });

  if (a.timeCapMinutes !== null) {
    const total = a.result.blocks.reduce((sum, b) => sum + (b.timeDomainMinutes ?? 0), 0);
    if (total > a.timeCapMinutes * 1.1) {
      findings.push({
        kind: "time_cap_exceeded", severity: "violation", blockIndex: null, movement: null,
        message: `The session takes about ${total} min, over the ${a.timeCapMinutes} min cap.`,
      });
    }
  }

  a.result.blocks.forEach((block, blockIndex) => {
    if (block.sourceBlocks.length !== 1) return; // merged blocks are judged by the athlete, not by a 1:1 rule
    const source = a.original.blocks[block.sourceBlocks[0]];
    if (!source?.stimulus || !block.stimulus) return;
    const from = source.stimulus;
    const to = block.stimulus;
    if (from.quality !== to.quality) {
      findings.push({
        kind: "stimulus_drift", severity: "violation", blockIndex, movement: null,
        message: `Block ${blockIndex + 1} changed its training quality from ${from.quality} to ${to.quality}.`,
      });
      return;
    }
    if (from.energySystem && to.energySystem && from.energySystem !== to.energySystem) {
      findings.push({
        kind: "stimulus_drift", severity: "warning", blockIndex, movement: null,
        message: `Block ${blockIndex + 1} shifted its energy system from ${from.energySystem} to ${to.energySystem}.`,
      });
    }
    if (from.loadIntensity && to.loadIntensity && LOAD_RANK[to.loadIntensity] > LOAD_RANK[from.loadIntensity]) {
      findings.push({
        kind: "stimulus_drift", severity: "warning", blockIndex, movement: null,
        message: `Block ${blockIndex + 1} is heavier than programmed (${from.loadIntensity} → ${to.loadIntensity}).`,
      });
    }
  });

  const accounted = new Set([
    ...a.result.blocks.flatMap((b) => b.sourceBlocks),
    ...a.result.droppedBlocks.map((d) => d.index),
  ]);
  a.original.blocks.forEach((_, i) => {
    if (!accounted.has(i)) {
      findings.push({
        kind: "unaccounted_block", severity: "violation", blockIndex: i, movement: null,
        message: `Original block ${i + 1} was neither kept nor explicitly dropped.`,
      });
    }
  });

  return findings;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/validate.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: deterministic validator for contraindications, equipment, time cap, stimulus drift and block accounting"
```

---

### Task E8: Pipeline orchestration (retry, fail-closed, progress, refine)

**Files:**
- Create: `src/lib/engine/pipeline.ts`
- Test: `tests/engine/pipeline.test.ts`

**Interfaces:**
- Consumes: `analyzePaste`, `analyzeManual`, `analyzeSituation` (E4); `activateConditions`, `profileConditionRefs` (E5); `availableEquipment`, `planComponents`, `goalFamily` (E5); `tailor`, `TailorInput` (E6); `validateTailoring`, `isViolation` (E7); `DomainData` (D5).
- Produces: `type WorkoutInput = { kind: "paste"; rawText: string } | { kind: "manual"; workout: ManualWorkout }`, `type ProgressStage = "analyzing" | "tailoring" | "validating" | "retrying"`, `class EngineUnsafeError extends Error { findings: Finding[] }`, `interface PipelineArgs { input; profile; request; domain; onProgress? }`, `runTailorPipeline(provider, args): Promise<PipelineResult>`, `interface RefineArgs { previous: PipelineResult; feedback: string; profile; request; domain; onProgress? }`, `runRefinePipeline(provider, args): Promise<PipelineResult>`.

- [ ] **Step 1: Write the failing test `tests/engine/pipeline.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { EngineUnsafeError, runRefinePipeline, runTailorPipeline, type ProgressStage } from "@/lib/engine/pipeline";
import { emptyProfile, emptyRequest, type TailoringDraft } from "@/lib/engine/types";
import { FRAN_TEXT, component, fran, franDraft, sprint, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulderToday = { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro derecho" };
const pasteAnalysis = (conditions: unknown[] = [shoulderToday]) => ({ workout: franDraft(), conditions, unavailableEquipment: [] });

function safeDraft(): TailoringDraft {
  const d = toTailoringDraft(fran());
  d.blocks[0].components = [
    component("Kettlebell Goblet Squat", { reps: "21-15-9", loadKg: { male: 24, female: 16 } }),
    component("Ring Row", { reps: "21-15-9" }),
  ];
  d.changes = [{ blockIndex: 0, original: "Thruster", modified: "Kettlebell Goblet Squat", reason: "No overhead." }];
  return d;
}
const unsafeDraft = () => toTailoringDraft(fran()); // keeps Thruster and Pull-up

const run = (provider: FakeProvider, stages: ProgressStage[] = [], situation = "me duele el hombro derecho") =>
  runTailorPipeline(provider, {
    input: { kind: "paste", rawText: FRAN_TEXT },
    profile: emptyProfile(),
    request: { ...emptyRequest(), situation },
    domain,
    onProgress: (s) => stages.push(s),
  });

describe("runTailorPipeline", () => {
  it("analyzes, tailors and validates in two model calls", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: safeDraft() });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["analyzing", "tailoring", "validating"]);
    expect(provider.calls).toHaveLength(2);
    expect(r.conditions).toEqual([{ ...shoulderToday, source: "today" }]);
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
    expect(r.findings.filter((f) => f.severity === "violation")).toEqual([]);
    expect(r.feedbackHistory).toEqual([]);
    expect(r.model).toBe("fake");
  });

  it("retries once with the violations and returns the corrected result", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: sequence(unsafeDraft(), safeDraft()) });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["analyzing", "tailoring", "validating", "retrying", "validating"]);
    expect(provider.calls[2].prompt).toContain("REJECTED BY THE SAFETY CHECK");
    expect(r.tailored.blocks[0].components[0].canonical).toBe("Kettlebell Goblet Squat");
  });

  it("fails closed when a contraindicated movement survives the retry", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    await expect(run(provider)).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("returns non-safety violations that survive the retry as findings", async () => {
    const slow = () => {
      const d = safeDraft();
      d.blocks[0].timeDomainMinutes = 30;
      return d;
    };
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: sequence(slow(), slow()) });
    const r = await runTailorPipeline(provider, {
      input: { kind: "paste", rawText: FRAN_TEXT }, profile: emptyProfile(),
      request: { ...emptyRequest(), situation: "me duele el hombro derecho", timeCapMinutes: 10 }, domain,
    });
    expect(r.findings).toContainEqual(expect.objectContaining({ kind: "time_cap_exceeded", severity: "violation" }));
  });

  it("applies profile injuries even when today's situation is empty", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis([]), TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    const profile = { ...emptyProfile(), injuries: [{ key: "no_hanging", side: null, severity: "moderate" as const, notes: "cast", since: null }] };
    await expect(runTailorPipeline(provider, {
      input: { kind: "paste", rawText: FRAN_TEXT }, profile, request: emptyRequest(), domain,
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("accepts a manual workout", async () => {
    const provider = new FakeProvider({
      ManualAnalysis: { stimuli: [sprint], conditions: [], unavailableEquipment: [] },
      TailoringResult: (() => {
        const d = toTailoringDraft(fran());
        d.blocks[0].rawText = "21-15-9 for time";
        return d;
      })(),
    });
    const r = await runTailorPipeline(provider, {
      input: { kind: "manual", workout: { name: "Fran", blocks: [{
        title: "Fran", format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
        components: franDraft().blocks[0].components,
      }] } },
      profile: emptyProfile(), request: emptyRequest(), domain,
    });
    expect(r.original.source).toBe("manual");
    expect(r.original.blocks[0].stimulus).toEqual(sprint);
  });
});

describe("runRefinePipeline", () => {
  it("re-tailors the original with the feedback, keeping and extending the conditions", async () => {
    const first = await run(new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: safeDraft() }));
    const provider = new FakeProvider({
      SituationAnalysis: { conditions: [{ key: "knee_pain", side: "left", severity: "mild", evidence: "la rodilla también" }], unavailableEquipment: ["kettlebell"] },
      TailoringResult: (() => {
        const d = safeDraft();
        d.blocks[0].components[0] = component("Dumbbell Goblet Squat", { reps: "15-12-9" });
        return d;
      })(),
    });
    const stages: ProgressStage[] = [];
    const r = await runRefinePipeline(provider, {
      previous: first, feedback: "too heavy, and my knee hurts too", profile: emptyProfile(), request: emptyRequest(), domain,
      onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual(["analyzing", "tailoring", "validating"]);
    expect(r.original).toEqual(first.original);
    expect(r.conditions.map((c) => c.key)).toEqual(["shoulder_impingement", "knee_pain"]);
    expect(r.unavailableEquipment).toEqual(["kettlebell"]);
    expect(r.feedbackHistory).toEqual(["too heavy, and my knee hurts too"]);
    expect(provider.calls[1].prompt).toContain("PREVIOUS ATTEMPT");
    expect(provider.calls[1].prompt).toContain("- too heavy, and my knee hurts too");
  });

  it("re-applies profile injuries even if the client dropped them from the previous result", async () => {
    const first = await run(new FakeProvider({ PasteAnalysis: pasteAnalysis(), TailoringResult: safeDraft() }));
    const tampered = { ...first, conditions: [] };
    const provider = new FakeProvider({
      SituationAnalysis: { conditions: [], unavailableEquipment: [] },
      TailoringResult: safeDraft(),
    });
    const profile = { ...emptyProfile(), injuries: [{ key: "hand_tear", side: null, severity: "moderate" as const, notes: null, since: null }] };
    const r = await runRefinePipeline(provider, { previous: tampered, feedback: "more volume", profile, request: emptyRequest(), domain });
    expect(r.conditions.map((c) => c.key)).toEqual(["hand_tear"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/engine/pipeline.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/engine/pipeline.ts`**

```ts
import type { LlmProvider } from "@/lib/ai/provider";
import type { ActiveCondition } from "@/lib/domain/assess";
import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { Equipment } from "@/lib/domain/types";
import { analyzeManual, analyzePaste, analyzeSituation, type AnalyzeContext } from "./analyze";
import { activateConditions, profileConditionRefs } from "./conditions";
import { availableEquipment, goalFamily, planComponents } from "./plan";
import { tailor, type TailorInput } from "./tailor";
import type {
  AthleteProfile, ConditionRef, Finding, ManualWorkout, PipelineResult, StructuredWorkout, TailorRequest, TailoringResult,
} from "./types";
import { isViolation, validateTailoring } from "./validate";

export type WorkoutInput = { kind: "paste"; rawText: string } | { kind: "manual"; workout: ManualWorkout };
export type ProgressStage = "analyzing" | "tailoring" | "validating" | "retrying";

/** A contraindicated movement survived the retry: nothing is returned to the athlete. */
export class EngineUnsafeError extends Error {
  constructor(readonly findings: Finding[]) {
    super("engine_unsafe");
    this.name = "EngineUnsafeError";
  }
}

export interface PipelineArgs {
  input: WorkoutInput;
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

export interface RefineArgs {
  previous: PipelineResult;
  feedback: string;
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

interface TailorStage {
  original: StructuredWorkout;
  active: ActiveCondition[];
  refs: ConditionRef[];
  unavailable: Equipment[];
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  previousAttempt: TailorInput["previousAttempt"];
  progress: (stage: ProgressStage) => void;
}

const analyzeContext = (d: DomainData): AnalyzeContext => ({
  movements: d.movements, contraindications: d.contraindications, taxonomy: d.taxonomy,
});

async function tailorAndValidate(
  provider: LlmProvider, s: TailorStage,
): Promise<{ result: TailoringResult; findings: Finding[] }> {
  const { domain } = s;
  const equipment = availableEquipment(s.profile.equipment, s.request.equipmentToday, s.unavailable);
  const planContext = { movements: domain.movements, resolve: createMovementResolver(domain.movements), active: s.active, equipment };
  const input: TailorInput = {
    original: s.original, profile: s.profile, request: s.request, conditions: s.refs,
    contraindications: domain.contraindications, plan: planComponents(s.original, planContext),
    goal: goalFamily(s.request.targetMovement, planContext), equipment, movements: domain.movements,
    conversions: domain.conversions, previousAttempt: s.previousAttempt, violations: [],
  };
  const validate = (result: TailoringResult) => validateTailoring({
    original: s.original, result, movements: domain.movements, active: s.active, equipment,
    timeCapMinutes: s.request.timeCapMinutes,
  });

  s.progress("tailoring");
  let result = await tailor(provider, input);
  s.progress("validating");
  let findings = validate(result);
  if (findings.some(isViolation)) {
    s.progress("retrying");
    result = await tailor(provider, { ...input, violations: findings.filter(isViolation) });
    s.progress("validating");
    findings = validate(result);
  }
  if (findings.some((f) => f.kind === "contraindicated_movement" && isViolation(f))) {
    throw new EngineUnsafeError(findings);
  }
  return { result, findings };
}

export async function runTailorPipeline(provider: LlmProvider, args: PipelineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  progress("analyzing");
  const ctx = analyzeContext(args.domain);
  const analysis = args.input.kind === "paste"
    ? await analyzePaste(provider, args.input.rawText, args.request.situation, ctx)
    : await analyzeManual(provider, args.input.workout, args.request.situation, ctx);
  const { active, refs } = activateConditions(
    profileConditionRefs(args.profile.injuries), analysis.conditions, args.domain.contraindications,
  );
  const { result, findings } = await tailorAndValidate(provider, {
    original: analysis.workout, active, refs, unavailable: analysis.unavailableEquipment,
    profile: args.profile, request: args.request, domain: args.domain, previousAttempt: null, progress,
  });
  return {
    original: analysis.workout, conditions: refs, unavailableEquipment: analysis.unavailableEquipment,
    tailored: result, findings, feedbackHistory: [], model: provider.model,
  };
}

export async function runRefinePipeline(provider: LlmProvider, args: RefineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  progress("analyzing");
  const situation = await analyzeSituation(provider, args.feedback, analyzeContext(args.domain));
  // `previous` comes back from the client: the stored profile injuries are always re-applied.
  const { active, refs } = activateConditions(
    [...profileConditionRefs(args.profile.injuries), ...args.previous.conditions],
    situation.conditions,
    args.domain.contraindications,
  );
  const unavailable = [...new Set([...args.previous.unavailableEquipment, ...situation.unavailableEquipment])];
  const feedbackHistory = [...args.previous.feedbackHistory, args.feedback];
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.previous.original, active, refs, unavailable, profile: args.profile, request: args.request,
    domain: args.domain, previousAttempt: { result: args.previous.tailored, feedbackHistory }, progress,
  });
  return {
    original: args.previous.original, conditions: refs, unavailableEquipment: unavailable,
    tailored: result, findings, feedbackHistory, model: provider.model,
  };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/engine/pipeline.test.ts` → PASS.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test` → all PASS, no DB, no API key.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tailor and refine pipelines with validation retry, fail-closed safety and progress stages"
```

---

### Task E9: Evaluation harness and corpus coverage report

**Files:**
- Create: `src/lib/eval/grade.ts`, `tests/eval/grade.test.ts`, `scripts/eval.ts`, `scripts/coverage.ts`, `evals/cases/*.json` (10 cases)
- Modify: `package.json` (scripts, `tsx`), `.gitignore`

**Interfaces:**
- Consumes: `runTailorPipeline`, `EngineUnsafeError`, `WorkoutInput` (E8); `analyzePaste` (E4); `getProvider` (E3); `getDomainData` (D5); `normalizeMovementName` (D5); E1 schemas.
- Produces: `EvalCaseSchema` / `EvalCase`, `type EvalOutcome = { kind: "result"; result: PipelineResult } | { kind: "error"; error: "engine_unsafe" | "engine_failed" }`, `resolveCase(c): { input: WorkoutInput; profile: AthleteProfile; request: TailorRequest }`, `gradeCase(c, outcome): { passed: boolean; failures: string[] }`; commands `pnpm eval [caseId]`, `pnpm coverage`.

- [ ] **Step 1: Write the failing test `tests/eval/grade.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { EvalCaseSchema, gradeCase, resolveCase } from "@/lib/eval/grade";
import type { PipelineResult } from "@/lib/engine/types";
import { fran } from "../fixtures/workouts";

const baseCase = EvalCaseSchema.parse({
  id: "fran-shoulder", description: "Fran with a sore shoulder",
  input: { kind: "paste", rawText: "Fran" },
  request: { situation: "sore shoulder" },
  expect: { mustAvoid: ["Thruster"], mustDetect: ["shoulder_impingement"], maxTotalMinutes: 10 },
});

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  const original = fran();
  return {
    original,
    conditions: [{ key: "shoulder_impingement", side: "right", severity: "moderate", source: "today", evidence: "sore" }],
    unavailableEquipment: [],
    tailored: {
      name: null, rawText: "x", droppedBlocks: [], changes: [], rationale: "r", safetyNote: null,
      blocks: original.blocks.map((b, i) => ({
        ...b, sourceBlocks: [i],
        components: [{ ...b.components[1], movement: "Ring Row", canonical: "Ring Row" }],
      })),
    },
    findings: [], feedbackHistory: [], model: "fake", ...overrides,
  };
}

describe("eval grading", () => {
  it("fills defaults for profile, request and expectations", () => {
    const c = EvalCaseSchema.parse({ id: "x", description: "x", input: { kind: "paste", rawText: "x" } });
    expect(c.expect).toEqual({ mustAvoid: [], mustDetect: [], maxTotalMinutes: null, expectFailClosed: false });
    const { profile, request } = resolveCase(c);
    expect(profile.equipment).toBeNull();
    expect(request.situation).toBe("");
  });

  it("passes a clean result that meets every expectation", () => {
    expect(gradeCase(baseCase, { kind: "result", result: result() })).toEqual({ passed: true, failures: [] });
  });

  it("fails on violations, forbidden movements, missed detections and overtime", () => {
    const bad = result({
      conditions: [],
      findings: [{ kind: "time_cap_exceeded", severity: "violation", blockIndex: null, movement: null, message: "over" }],
    });
    bad.tailored.blocks[0].components = [{ ...bad.tailored.blocks[0].components[0], movement: "Thruster", canonical: "Thruster" }];
    bad.tailored.blocks[0].timeDomainMinutes = 20;
    const g = gradeCase(baseCase, { kind: "result", result: bad });
    expect(g.passed).toBe(false);
    expect(g.failures).toEqual([
      "violation [time_cap_exceeded] over",
      "prescribed forbidden movement Thruster",
      "did not detect shoulder_impingement",
      "total 20 min > 10 min",
    ]);
  });

  it("treats an engine error as a failure unless fail-closed was expected", () => {
    expect(gradeCase(baseCase, { kind: "error", error: "engine_unsafe" }).failures).toEqual(["engine error: engine_unsafe"]);
    const closed = EvalCaseSchema.parse({ ...baseCase, expect: { expectFailClosed: true } });
    expect(gradeCase(closed, { kind: "error", error: "engine_unsafe" }).passed).toBe(true);
    expect(gradeCase(closed, { kind: "result", result: result() }).failures).toEqual(["expected the engine to fail closed"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/eval/grade.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/eval/grade.ts`**

```ts
import { z } from "zod";
import type { WorkoutInput } from "@/lib/engine/pipeline";
import {
  AthleteProfileSchema, ManualWorkoutSchema, TailorRequestSchema, emptyProfile, emptyRequest,
  type AthleteProfile, type PipelineResult, type TailorRequest,
} from "@/lib/engine/types";

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  input: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("paste"), rawText: z.string().min(1) }),
    z.object({ kind: z.literal("manual"), workout: ManualWorkoutSchema }),
  ]),
  profile: AthleteProfileSchema.partial().default({}),
  request: TailorRequestSchema.partial().default({}),
  // prefault (not default): the fallback object is parsed, so the inner defaults apply.
  expect: z.object({
    mustAvoid: z.array(z.string()).default([]),
    mustDetect: z.array(z.string()).default([]),
    maxTotalMinutes: z.number().positive().nullable().default(null),
    expectFailClosed: z.boolean().default(false),
  }).prefault({}),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export type EvalOutcome =
  | { kind: "result"; result: PipelineResult }
  | { kind: "error"; error: "engine_unsafe" | "engine_failed" };

export function resolveCase(c: EvalCase): { input: WorkoutInput; profile: AthleteProfile; request: TailorRequest } {
  return {
    input: c.input,
    profile: { ...emptyProfile(), ...c.profile },
    request: { ...emptyRequest(), ...c.request },
  };
}

export function gradeCase(c: EvalCase, outcome: EvalOutcome): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  if (outcome.kind === "error") {
    if (!(c.expect.expectFailClosed && outcome.error === "engine_unsafe")) failures.push(`engine error: ${outcome.error}`);
    return { passed: failures.length === 0, failures };
  }
  if (c.expect.expectFailClosed) failures.push("expected the engine to fail closed");
  const r = outcome.result;
  for (const f of r.findings.filter((x) => x.severity === "violation")) failures.push(`violation [${f.kind}] ${f.message}`);
  const prescribed = new Set(r.tailored.blocks.flatMap((b) => b.components.map((x) => x.canonical ?? x.movement)));
  for (const name of c.expect.mustAvoid) if (prescribed.has(name)) failures.push(`prescribed forbidden movement ${name}`);
  const detected = new Set(r.conditions.map((x) => x.key));
  for (const key of c.expect.mustDetect) if (!detected.has(key)) failures.push(`did not detect ${key}`);
  if (c.expect.maxTotalMinutes !== null) {
    const total = r.tailored.blocks.reduce((sum, b) => sum + (b.timeDomainMinutes ?? 0), 0);
    if (total > c.expect.maxTotalMinutes) failures.push(`total ${total} min > ${c.expect.maxTotalMinutes} min`);
  }
  return { passed: failures.length === 0, failures };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/eval/grade.test.ts` → PASS.

- [ ] **Step 5: Add `tsx`, the scripts and the ignores**

```bash
pnpm add -D tsx
```

In `package.json` `scripts`, add:
```json
    "eval": "tsx scripts/eval.ts",
    "coverage": "tsx scripts/coverage.ts"
```

Append to `.gitignore`:
```
# private corpus (real, often paid programming) and generated reports — the repo is public
/data/corpus/
/reports/
```

- [ ] **Step 6: Create `scripts/eval.ts`**

```ts
// Runs every evals/cases/*.json through the real pipeline (needs GEMINI_API_KEY).
// Usage: pnpm eval            — all cases
//        pnpm eval <caseId>   — one case
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getProvider } from "@/lib/ai";
import { getDomainData } from "@/lib/domain/repository";
import { EngineUnsafeError, runTailorPipeline } from "@/lib/engine/pipeline";
import { EvalCaseSchema, gradeCase, resolveCase, type EvalOutcome } from "@/lib/eval/grade";

async function main() {
  const dir = path.join(process.cwd(), "evals", "cases");
  const only = process.argv[2];
  const provider = getProvider();
  const domain = await getDomainData();
  const rows: unknown[] = [];
  let failed = 0;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const c = EvalCaseSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
    if (only && c.id !== only) continue;
    const started = Date.now();
    let outcome: EvalOutcome;
    try {
      outcome = { kind: "result", result: await runTailorPipeline(provider, { ...resolveCase(c), domain }) };
    } catch (e) {
      if (!(e instanceof EngineUnsafeError)) console.error(e);
      outcome = { kind: "error", error: e instanceof EngineUnsafeError ? "engine_unsafe" : "engine_failed" };
    }
    const ms = Date.now() - started;
    const grade = gradeCase(c, outcome);
    if (!grade.passed) failed++;
    rows.push({ id: c.id, ms, ...grade, outcome });
    console.log(`${grade.passed ? "PASS" : "FAIL"}  ${c.id}  (${ms} ms)`);
    for (const f of grade.failures) console.log(`      - ${f}`);
  }

  fs.mkdirSync("reports", { recursive: true });
  const out = path.join("reports", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(out, JSON.stringify({ model: provider.model, rows }, null, 2));
  console.log(`\n${rows.length - failed}/${rows.length} passed (model ${provider.model}) — ${out}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Create `scripts/coverage.ts`**

```ts
// Measures how much of a real corpus resolves to the movement library (needs GEMINI_API_KEY).
// Put .txt/.md files under data/corpus/ (gitignored). Usage: pnpm coverage
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getProvider } from "@/lib/ai";
import { getDomainData } from "@/lib/domain/repository";
import { normalizeMovementName } from "@/lib/domain/resolve";
import { analyzePaste } from "@/lib/engine/analyze";

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(txt|md)$/i.test(e.name) ? [p] : [];
  });
}

async function main() {
  const corpus = files(path.join(process.cwd(), "data", "corpus"));
  if (corpus.length === 0) throw new Error("No .txt/.md files under data/corpus/");
  const provider = getProvider();
  const domain = await getDomainData();
  const unresolved = new Map<string, { example: string; count: number }>();
  let total = 0;
  let resolved = 0;
  let degraded = 0;

  for (const file of corpus) {
    const analysis = await analyzePaste(provider, fs.readFileSync(file, "utf8"), "", domain);
    if (!analysis.analyzed) degraded++;
    for (const c of analysis.workout.blocks.flatMap((b) => b.components)) {
      total++;
      if (c.canonical) {
        resolved++;
        continue;
      }
      const key = normalizeMovementName(c.movement);
      const entry = unresolved.get(key) ?? { example: c.movement, count: 0 };
      entry.count++;
      unresolved.set(key, entry);
    }
    console.log(`analyzed ${path.relative(process.cwd(), file)}`);
  }

  const ranked = [...unresolved.values()].sort((a, b) => b.count - a.count);
  const pct = total === 0 ? 0 : (100 * resolved) / total;
  console.log(`\nfiles: ${corpus.length} (${degraded} degraded)  components: ${total}  resolved: ${resolved} (${pct.toFixed(1)}%)`);
  console.log("most frequent unrecognized:");
  for (const u of ranked.slice(0, 40)) console.log(`  ${String(u.count).padStart(4)}  ${u.example}`);
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(path.join("reports", "coverage.json"), JSON.stringify({ total, resolved, pct, degraded, unresolved: ranked }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
```

- [ ] **Step 8: Create the eval cases** (synthetic or public benchmarks only — the repo is public)

`evals/cases/01-fran-shoulder-today.json`:
```json
{
  "id": "fran-shoulder-today",
  "description": "Fran with right-shoulder pain stated today in Spanish",
  "input": { "kind": "paste", "rawText": "Fran\n21-15-9 for time\nThrusters 43/30 kg\nPull-ups" },
  "request": { "situation": "Me duele el hombro derecho al levantar el brazo por encima de la cabeza" },
  "expect": { "mustDetect": ["shoulder_impingement"], "mustAvoid": ["Thruster", "Pull-up", "Shoulder Press", "Push Press"] }
}
```

`evals/cases/02-cindy-no-hanging.json`:
```json
{
  "id": "cindy-no-hanging",
  "description": "Cindy for an athlete with a cast who cannot hang (profile limitation)",
  "input": { "kind": "paste", "rawText": "Cindy\nAMRAP 20 min\n5 Pull-ups\n10 Push-ups\n15 Air Squats" },
  "profile": { "injuries": [{ "key": "no_hanging", "side": null, "severity": "moderate", "notes": "Cast on the left wrist", "since": null }] },
  "expect": { "mustAvoid": ["Pull-up", "Strict Pull-up", "Banded Pull-up", "Chest-to-Bar", "Dead Hang"] }
}
```

`evals/cases/03-run-knee-acute.json`:
```json
{
  "id": "run-knee-acute",
  "description": "Running and jumping with an acute knee sprain",
  "input": { "kind": "paste", "rawText": "5 rounds for time\n400 m Run\n15 Kettlebell Swings 24/16 kg\n10 Box Jumps 60/50 cm" },
  "request": { "situation": "Ayer me torcí la rodilla izquierda y hoy me duele bastante al apoyar" },
  "expect": { "mustDetect": ["knee_pain"], "mustAvoid": ["Run", "Box Jump", "Box Jump Over"] }
}
```

`evals/cases/04-split-time-cap.json`:
```json
{
  "id": "split-time-cap",
  "description": "Three-block session squeezed into 30 minutes",
  "input": { "kind": "paste", "rawText": "A) Back Squat 5x5 @ 75%, rest 2 min\n\nB) For time, 21-15-9:\nPower Cleans 61/43 kg\nBurpee Box Jump Overs\n\nC) Accessory\n3x12 Dumbbell Rows\n3x20 GHD Sit-ups" },
  "request": { "timeCapMinutes": 30 },
  "expect": { "maxTotalMinutes": 33 }
}
```

`evals/cases/05-missed-days.json`:
```json
{
  "id": "missed-days",
  "description": "Two missed days merged into one hour",
  "input": { "kind": "paste", "rawText": "Day 1\nEMOM 10: 3 Power Snatches @ 60%\nThen 5 rounds: 12 Wall Balls 9/6 kg, 9 Toes-to-Bar\n\nDay 2\nFront Squat 4x8 @ 70%\nAMRAP 20 min: 10 Double-unders, 10 Dumbbell Snatches 22.5/15 kg, 200 m Run" },
  "request": { "situation": "I missed the last two days and have one hour today", "timeCapMinutes": 60 },
  "expect": { "maxTotalMinutes": 66 }
}
```

`evals/cases/06-no-rower.json`:
```json
{
  "id": "no-rower",
  "description": "Rowing workout when the rower is not available",
  "input": { "kind": "paste", "rawText": "4 rounds for time\n500 m Row\n15 Thrusters 43/30 kg\n400 m Run" },
  "request": { "situation": "No rower available today" },
  "expect": { "mustAvoid": ["Row (Erg)"] }
}
```

`evals/cases/07-pregnancy.json`:
```json
{
  "id": "pregnancy",
  "description": "Chipper for a pregnant athlete (profile condition)",
  "profile": { "sex": "female", "injuries": [{ "key": "pregnancy", "side": null, "severity": "moderate", "notes": "Second trimester", "since": null }] },
  "input": { "kind": "paste", "rawText": "For time\n50 Sit-ups\n40 Wall Balls 9/6 kg\n30 Box Jumps\n20 Handstand Push-ups" },
  "expect": { "mustAvoid": ["Sit-up", "GHD Sit-up", "V-up", "Handstand Push-up", "Strict Handstand Push-up"] }
}
```

`evals/cases/08-goal-toes-to-bar.json`:
```json
{
  "id": "goal-toes-to-bar",
  "description": "No constraint, biased toward toes-to-bar",
  "input": { "kind": "paste", "rawText": "AMRAP 12 min\n12 Kettlebell Swings 24/16 kg\n12 Box Jumps 60/50 cm\n200 m Run" },
  "request": { "targetMovement": "Toes-to-Bar" },
  "expect": {}
}
```

`evals/cases/09-hand-tear.json`:
```json
{
  "id": "hand-tear",
  "description": "Gymnastics EMOM with a torn palm stated today",
  "input": { "kind": "paste", "rawText": "EMOM 12\nMin 1: 15 Toes-to-Bar\nMin 2: 12 Chest-to-Bar Pull-ups\nMin 3: 15/12 Cal Row" },
  "request": { "situation": "Se me ha abierto un callo en la palma de la mano derecha" },
  "expect": { "mustDetect": ["hand_tear"], "mustAvoid": ["Toes-to-Bar", "Chest-to-Bar", "Pull-up", "Bar Muscle-up"] }
}
```

`evals/cases/10-dumbbells-at-home.json`:
```json
{
  "id": "dumbbells-at-home",
  "description": "Fran at home with dumbbells and a jump rope only",
  "profile": { "equipment": ["dumbbell", "jump_rope"] },
  "input": { "kind": "paste", "rawText": "Fran\n21-15-9 for time\nThrusters 43/30 kg\nPull-ups" },
  "expect": { "mustAvoid": ["Thruster", "Pull-up"] }
}
```

- [ ] **Step 9: Verify the scripts type-check and the cases parse**

(If `src/generated/prisma` is missing, run `pnpm exec prisma generate` first: `tsc` also checks `src/lib/db.ts`.)

Run:
```bash
pnpm exec tsc --noEmit
node -e "for (const f of require('fs').readdirSync('evals/cases')) JSON.parse(require('fs').readFileSync('evals/cases/'+f,'utf8')); console.log('cases ok')"
pnpm test
```
Expected: no type errors; `cases ok`; all tests PASS.

- [ ] **Step 10: Run the evaluation against Gemini (requires `GEMINI_API_KEY` in `.env`)**

Run: `pnpm eval`
Expected: a PASS/FAIL line per case and a report in `reports/`. Target before moving on: **≥ 9/10 passing and no `contraindicated_movement` violation in any report.** When a case fails, read its report: fix prompts (E4/E6) or data, never the expectation, unless the expectation contradicts the spec. Record the pass rate and model in the commit message.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: evaluation harness with 10 synthetic cases and the corpus coverage report"
```

---

### Task E10: Corpus coverage pass (data — needs the user's corpus)

The catalog grows from real usage, not intuition. This task is data-driven: its exact rows depend on the report.

**Files:**
- Modify: `data/movements.json` (via `scripts/migrations/e10-corpus.mjs`, deleted after running), `tests/domain/data.test.ts`, `docs/specs/training-tailor-engine-v1-design.md` (seed counts)

- [ ] **Step 1: The user places their programming under `data/corpus/`** (one week or day per `.txt`/`.md` file). Verify it is ignored:

```bash
git check-ignore -v data/corpus/
```
Expected: the `.gitignore` rule is printed. If not, stop.

- [ ] **Step 2: Measure**

Run: `pnpm coverage`
Record: files, components, resolved %, and the unrecognized list.

- [ ] **Step 3: Classify each unrecognized name, most frequent first, until the projected coverage is ≥ 95 %**

For each name decide exactly one:
1. **Alias** — a spelling, language or shorthand of an existing row (e.g. "Dominadas" → `Pull-up`): add it to that row's `aliases`.
2. **New movement** — author a row following the catalog rules (spec, *Movement*):
   - `patterns` primary first; `olympic` only with a barbell;
   - `stresses` list only clinically significant mechanisms (`load: "low"` for bodyweight end-range or impact); a hanging row carries `grip`; trunk flexion carries `abdominals`; never `flexion` with `deep_flexion` on one site;
   - one row per implement (KB/DB twins mirror stresses and substitute each other); strict and kipping as separate rows;
   - `positions` (`hanging`, `inverted`, `partial_inversion`, `supine`, `prone`) when required;
   - `unilateral` when a standard single-limb variant exists;
   - `substitutes` are existing names, stimulus-preserving, primary first;
   - `equipment` only availability-relevant items.
3. **Not a movement** (rest, cues, warm-up prose): ignore and note it in the commit message.

- [ ] **Step 4: Pin each new row's non-obvious annotation with a test** in `tests/domain/data.test.ts` (one `it` per row or family, in the style of the existing ones, e.g. "the X is a Y with Z"). Run `pnpm exec vitest run tests/domain` and see the new tests fail.

- [ ] **Step 5: Apply with a one-off migration** `scripts/migrations/e10-corpus.mjs` using `readRows`/`writeRows` (same helpers as D2/D3: `get`, `insertAfter`, `addAlias`), run it, delete it.

- [ ] **Step 6: Verify**

Run: `pnpm test` → PASS (including the alias-collision and every-site-blocked guards).
Run: `pnpm coverage` → resolved **≥ 95 %**.
Run: `pnpm eval` → no regression against the E9 pass rate.

- [ ] **Step 7: Update the seed counts** in the spec's *Domain-grounding assets* section to the new movement total.

- [ ] **Step 8: Commit** (statistics only — never corpus content)

```bash
git add -A
git commit -m "feat: grow the movement catalog from corpus coverage (<before>% → <after>% resolved)"
```

---
## Phase S — Database and auth

### Task S1: Database schema v2 and migrations

Replaces the revision-1 schema (Auth.js models, five JSON profile columns) with the Better Auth core models, a single validated profile document, the saved-result shape and the quota ledger. The dev database holds no real data; it is reset.

**Files:**
- Modify: `prisma/schema.prisma` (rewrite), `package.json` (scripts)
- Create: `src/lib/json.ts`, `tests/lib/json.test.ts`, `prisma/migrations/<timestamp>_init/` (generated)

**Interfaces:**
- Produces: Prisma models `User`, `Session`, `Account`, `Verification` (mapped to `user`, `session`, `account`, `verification`), `AthleteProfile { userId @unique, data Json }`, `TailoredWorkout { original, request, conditions, tailored, findings, feedbackHistory: Json; model: String }`, `LlmUsage { userId, kind, createdAt }`; `toJson(value: unknown): Prisma.InputJsonValue` from `@/lib/json`; scripts `db:migrate`, `db:deploy`, `postinstall`.

- [ ] **Step 1: Write the failing test `tests/lib/json.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toJson } from "@/lib/json";

describe("toJson", () => {
  it("returns a plain JSON copy, dropping undefined", () => {
    const value = { a: 1, b: null, c: undefined, d: [{ e: "x" }] };
    expect(toJson(value)).toEqual({ a: 1, b: null, d: [{ e: "x" }] });
    expect(toJson(value)).not.toBe(value);
  });
});
```

Run: `pnpm exec vitest run tests/lib/json.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/json.ts`**

```ts
import type { Prisma } from "@/generated/prisma/client";

/** Zod-parsed values are plain JSON; this narrows them to Prisma's JSON input type. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
```

Run: `pnpm exec vitest run tests/lib/json.test.ts` → PASS.

- [ ] **Step 3: Rewrite `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ---- Better Auth core. Field names are fixed by Better Auth, which also generates the ids. ----
model User {
  id            String            @id
  name          String
  email         String            @unique
  emailVerified Boolean           @default(false)
  image         String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  sessions      Session[]
  accounts      Account[]
  profile       AthleteProfile?
  tailored      TailoredWorkout[]
  usage         LlmUsage[]

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}

// ---- Training Tailor ----
model AthleteProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json // AthleteProfileSchema (src/lib/engine/types.ts)
  updatedAt DateTime @updatedAt
}

model TailoredWorkout {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  original        Json // StructuredWorkout
  request         Json // TailorRequest
  conditions      Json // ConditionRef[]
  tailored        Json // TailoringResult
  findings        Json // Finding[]
  feedbackHistory Json     @default("[]") // string[]
  model           String
  createdAt       DateTime @default(now())

  @@index([userId, createdAt])
}

// Quota ledger: one row per engine run.
model LlmUsage {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind      String // "tailor" | "refine"
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

- [ ] **Step 4: Switch the scripts to migrations** — in `package.json` `scripts`, replace `"db:push": "prisma db push"` with:

```json
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "postinstall": "prisma generate",
```

- [ ] **Step 5: Reset the dev database and create the initial migration**

The dev database only holds throwaway data from `db push`; resetting it is expected. Before running it, confirm `DIRECT_URL` in `.env` points at the Neon `dev` branch: `migrate reset` drops every table on whatever database it targets.

```bash
pnpm exec prisma migrate reset --force
pnpm exec prisma migrate dev --name init
pnpm exec prisma generate
```
Expected: `prisma/migrations/<timestamp>_init/migration.sql` exists and creates `user`, `session`, `account`, `verification`, `AthleteProfile`, `TailoredWorkout`, `LlmUsage`.

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit` → no errors. `pnpm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: database schema v2 (Better Auth core, profile document, saved results, quota ledger) under migrations"
```

---

### Task S2: Google sign-in with Better Auth

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/app/api/auth/[...all]/route.ts`, `src/proxy.ts`, `src/app/signin/page.tsx`, `src/components/SignOutButton.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `.env.example`, `package.json` (dependency)

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; models from S1.
- Produces: `auth` (`@/lib/auth`), `authClient` (`@/lib/auth-client`), `getUserId(): Promise<string | null>` and `getSessionUser(): Promise<{ id: string; name: string; email: string } | null>` (`@/lib/session`) — every page and API route uses `getUserId`.

- [ ] **Step 1: Create the Google OAuth client (manual, Google Cloud Console)**

1. APIs & Services → OAuth consent screen: External, app name "Training Tailor", scopes `openid`, `email`, `profile`; add yourself as a test user.
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` (add the production one, `https://<domain>/api/auth/callback/google`, in Task F1).
4. Copy the client ID and secret into `.env` (never commit them).

- [ ] **Step 2: Install and configure the environment**

```bash
pnpm add better-auth
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

In `.env.example`, replace the whole `# Auth.js` block with:

```bash
# Better Auth (Google OAuth)
BETTER_AUTH_SECRET=""     # 32+ random bytes, base64
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Put real values in `.env` (the generated secret, `BETTER_AUTH_URL`, the Google credentials).

- [ ] **Step 3: Implement the server instance `src/lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [nextCookies()], // keep last: sets cookies from server actions
});
```

- [ ] **Step 4: Verify our auth models against Better Auth's generator**

```bash
pnpm dlx auth@latest generate --help
```
Use the printed flags to generate the Prisma schema to a scratch file **outside** `prisma/schema.prisma` (e.g. `--output ./auth-schema.check.prisma`; answer "no" if asked to overwrite anything). Compare its `User`/`Session`/`Account`/`Verification` models with ours: field names, types and optionality must match. If they differ, align `prisma/schema.prisma`, then run `pnpm exec prisma migrate dev --name better_auth_alignment`. Delete the scratch file.

- [ ] **Step 5: Implement the client, the session helpers and the route handler**

`src/lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

`src/lib/session.ts`:
```ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getSessionUser(): Promise<{ id: string; name: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}

export async function getUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
```

`src/app/api/auth/[...all]/route.ts`:
```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 6: Protect the pages in `src/proxy.ts`** (Next 16 runs `proxy` on the Node runtime, so a full session check works; API routes still check the session themselves and return 401)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL("/signin", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/tailor/:path*", "/profile/:path*", "/history/:path*"] };
```

- [ ] **Step 7: Sign-in page, sign-out button, layout and home**

`src/app/signin/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    if (error) {
      setError("Google sign-in failed. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-neutral-600">
        Training Tailor adapts your programmed workout to today&apos;s body, time and equipment.
      </p>
      <button onClick={signIn} disabled={pending}
        className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
```

`src/components/SignOutButton.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button className="text-neutral-600 underline" onClick={async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    }}>
      Sign out
    </button>
  );
}
```

`src/app/layout.tsx` (replace):
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SignOutButton } from "@/components/SignOutButton";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Training Tailor",
  description: "Tailor your programmed workout to today's body, time and equipment.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <header className="border-b">
          <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">Training Tailor</Link>
            {user && (
              <>
                <Link href="/tailor">Tailor</Link>
                <Link href="/history">History</Link>
                <Link href="/profile">Profile</Link>
                <span className="ml-auto"><SignOutButton /></span>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 py-6 text-xs text-neutral-500">
          Not medical advice. Training Tailor suggests workout modifications; it does not diagnose or treat
          injuries. When in doubt, consult a qualified professional.
        </footer>
      </body>
    </html>
  );
}
```

`src/app/page.tsx` (replace):
```tsx
import Link from "next/link";
import { getSessionUser } from "@/lib/session";

const SECTIONS = [
  { href: "/tailor", title: "Tailor a workout", text: "Paste today's session and say how you are." },
  { href: "/profile", title: "Profile", text: "Injuries, equipment, benchmarks, goals." },
  { href: "/history", title: "History", text: "Your saved tailored workouts." },
];

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <section className="flex flex-col gap-4 py-10">
        <h1 className="text-2xl font-semibold">Your programming, tailored to today</h1>
        <p className="text-neutral-700">
          Pain, little time, missing equipment or missed days: keep the stimulus of the workout and stay safe.
        </p>
        <Link href="/signin" className="w-fit rounded bg-black px-4 py-2 text-white">Sign in</Link>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Hi {user.name.split(" ")[0]}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded border p-4">
            <div className="font-medium">{s.title}</div>
            <div className="text-sm text-neutral-600">{s.text}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Manual verification**

Run `pnpm dev`, open `http://localhost:3000`:
1. Signed out: the home shows "Sign in"; `/tailor` redirects to `/signin`.
2. "Continue with Google" → Google consent → back on `/` with the nav visible.
3. A row exists in `user`, `account` (`providerId = 'google'`) and `session` (`pnpm db:studio`).
4. "Sign out" returns to the signed-out home.

- [ ] **Step 9: Verify and commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

```bash
git add -A
git commit -m "feat: Google sign-in with Better Auth, proxy route protection and the app shell"
```

---

## Phase U — API and UI

### Task U1: Profile helpers, API and form

**Files:**
- Create: `src/lib/profile.ts`, `src/lib/http.ts`, `src/app/api/profile/route.ts`, `src/app/profile/page.tsx`, `src/app/profile/ProfileForm.tsx`
- Test: `tests/profile/profile.test.ts`

**Interfaces:**
- Consumes: `AthleteProfileSchema`, `emptyProfile` (E1), `getDomainData` (D5), `createMovementResolver` (D5), `getUserId` (S2), `prisma`, `toJson` (S1).
- Produces: `normalizeProfile(raw: unknown): AthleteProfile`, `sanitizeProfile(profile, domain: Pick<DomainData, "movements" | "contraindications">): AthleteProfile` (`@/lib/profile`); `jsonError(code: string, status: number): NextResponse` (`@/lib/http`); `GET/PUT /api/profile` → `{ profile }`.

- [ ] **Step 1: Write the failing test `tests/profile/profile.test.ts`**

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import { emptyProfile, type AthleteProfile } from "@/lib/engine/types";
import { normalizeProfile, sanitizeProfile } from "@/lib/profile";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

describe("normalizeProfile", () => {
  it("returns an empty profile for a new athlete", () => {
    expect(normalizeProfile(null)).toEqual(emptyProfile());
  });

  it("passes a valid stored profile through", () => {
    const p: AthleteProfile = { ...emptyProfile(), sex: "male", equipment: ["barbell"] };
    expect(normalizeProfile(p)).toEqual(p);
  });

  it("falls back to an empty profile when the stored document is invalid", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(normalizeProfile({ injuries: "nope" })).toEqual(emptyProfile());
    spy.mockRestore();
  });
});

describe("sanitizeProfile", () => {
  it("keeps catalog injuries once and canonicalizes movement names", () => {
    const p = sanitizeProfile({
      ...emptyProfile(),
      injuries: [
        { key: "knee_pain", side: "left", severity: "mild", notes: null, since: null },
        { key: "knee_pain", side: "right", severity: "acute", notes: null, since: null },
        { key: "broken_heart", side: null, severity: "acute", notes: null, since: null },
      ],
      benchmarks: [
        { movement: "T2B", kind: "max_reps", value: 15, unit: "reps", recordedAt: null },
        { movement: "Zercher Carry", kind: "1rm", value: 100, unit: "kg", recordedAt: null },
      ],
      goals: [
        { movement: "pull ups", description: "First strict pull-up" },
        { movement: "Moonwalk", description: "Dance" },
      ],
    }, domain);
    expect(p.injuries.map((i) => [i.key, i.side])).toEqual([["knee_pain", "left"]]);
    expect(p.benchmarks.map((b) => b.movement)).toEqual(["Toes-to-Bar"]);
    expect(p.goals.map((g) => g.movement)).toEqual(["Pull-up", null]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/profile/profile.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/profile.ts` and `src/lib/http.ts`**

```ts
import type { DomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { AthleteProfileSchema, emptyProfile, type AthleteProfile, type ProfileInjury } from "@/lib/engine/types";

export function normalizeProfile(raw: unknown): AthleteProfile {
  if (raw == null) return emptyProfile();
  const parsed = AthleteProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.error("stored profile failed validation; using an empty profile", parsed.error.issues);
  return emptyProfile();
}

/** Only catalog injury keys (first occurrence wins) and canonical movement names are stored. */
export function sanitizeProfile(
  profile: AthleteProfile, domain: Pick<DomainData, "movements" | "contraindications">,
): AthleteProfile {
  const resolve = createMovementResolver(domain.movements);
  const catalog = new Set(domain.contraindications.map((c) => c.key));
  const injuries: ProfileInjury[] = [];
  for (const i of profile.injuries) {
    if (catalog.has(i.key) && !injuries.some((x) => x.key === i.key)) injuries.push(i);
  }
  return {
    ...profile,
    injuries,
    benchmarks: profile.benchmarks.flatMap((b) => {
      const m = resolve(b.movement);
      return m ? [{ ...b, movement: m.name }] : [];
    }),
    goals: profile.goals.map((g) => ({ ...g, movement: g.movement ? resolve(g.movement)?.name ?? null : null })),
  };
}
```

`src/lib/http.ts`:
```ts
import { NextResponse } from "next/server";

/** Error responses carry a code, never exception text. */
export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run tests/profile/profile.test.ts` → PASS.

- [ ] **Step 5: Implement `src/app/api/profile/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { AthleteProfileSchema } from "@/lib/engine/types";
import { jsonError } from "@/lib/http";
import { toJson } from "@/lib/json";
import { normalizeProfile, sanitizeProfile } from "@/lib/profile";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const row = await prisma.athleteProfile.findUnique({ where: { userId } });
  return NextResponse.json({ profile: normalizeProfile(row?.data) });
}

export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const parsed = AthleteProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid_request", 400);
  const profile = sanitizeProfile(parsed.data, await getDomainData());
  await prisma.athleteProfile.upsert({
    where: { userId },
    create: { userId, data: toJson(profile) },
    update: { data: toJson(profile) },
  });
  return NextResponse.json({ profile });
}
```

- [ ] **Step 6: Implement the page `src/app/profile/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { Equipment } from "@/lib/domain/types";
import { normalizeProfile } from "@/lib/profile";
import { getUserId } from "@/lib/session";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const userId = await getUserId();
  if (!userId) redirect("/signin");
  const [row, domain] = await Promise.all([prisma.athleteProfile.findUnique({ where: { userId } }), getDomainData()]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <ProfileForm
        initial={normalizeProfile(row?.data)}
        catalog={domain.contraindications.map((c) => ({ key: c.key, label: c.label, kind: c.kind }))}
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
      />
    </section>
  );
}
```

- [ ] **Step 7: Implement the form `src/app/profile/ProfileForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Severity, Side, type Equipment } from "@/lib/domain/types";
import {
  BenchmarkKind, BenchmarkUnit, ScalingLevel, Sex, Weekday,
  type AthleteProfile, type Benchmark, type Goal, type ProfileInjury,
} from "@/lib/engine/types";

interface Props {
  initial: AthleteProfile;
  catalog: { key: string; label: string; kind: string }[];
  movementNames: string[];
  equipmentOptions: Equipment[];
}

const field = "rounded border px-2 py-1 text-sm";
const chip = (on: boolean) => `rounded border px-3 py-1 text-sm ${on ? "bg-black text-white" : ""}`;
const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const intOrNull = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
const label = (s: string) => s.replaceAll("_", " ");

export function ProfileForm({ initial, catalog, movementNames, equipmentOptions }: Props) {
  const [p, setP] = useState<AthleteProfile>(initial);
  const [newInjury, setNewInjury] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const conditionLabel = (key: string) => catalog.find((c) => c.key === key)?.label ?? key;
  const setInjury = (i: number, patch: Partial<ProfileInjury>) =>
    setP({ ...p, injuries: p.injuries.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setBenchmark = (i: number, patch: Partial<Benchmark>) =>
    setP({ ...p, benchmarks: p.benchmarks.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setGoal = (i: number, patch: Partial<Goal>) =>
    setP({ ...p, goals: p.goals.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  async function save() {
    setStatus("Saving…");
    const body: AthleteProfile = {
      ...p,
      benchmarks: p.benchmarks.filter((b) => b.movement.trim() !== "" && b.value > 0),
      goals: p.goals.filter((g) => g.description.trim() !== ""),
    };
    const res = await fetch("/api/profile", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      setStatus("Could not save. Check the values and try again.");
      return;
    }
    setP((await res.json()).profile);
    setStatus("Saved");
  }

  return (
    <div className="flex flex-col gap-8">
      <datalist id="movement-names">{movementNames.map((n) => <option key={n} value={n} />)}</datalist>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">About you</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">Loads
            <select className={field} value={p.sex ?? ""} onChange={(e) => setP({ ...p, sex: e.target.value === "" ? null : Sex.parse(e.target.value) })}>
              <option value="">not set</option>
              {Sex.options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">Level
            <select className={field} value={p.scalingLevel ?? ""} onChange={(e) => setP({ ...p, scalingLevel: e.target.value === "" ? null : ScalingLevel.parse(e.target.value) })}>
              <option value="">not set</option>
              {ScalingLevel.options.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Injuries and limitations</h2>
        {p.injuries.map((inj, i) => (
          <div key={inj.key} className="flex flex-wrap items-center gap-2 rounded border p-2">
            <span className="font-medium">{conditionLabel(inj.key)}</span>
            <select className={field} value={inj.side ?? ""} onChange={(e) => setInjury(i, { side: e.target.value === "" ? null : Side.parse(e.target.value) })}>
              <option value="">no side</option>
              {Side.options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={field} value={inj.severity} onChange={(e) => setInjury(i, { severity: Severity.parse(e.target.value) })}>
              {Severity.options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={`${field} grow`} placeholder="notes" value={inj.notes ?? ""} onChange={(e) => setInjury(i, { notes: e.target.value || null })} />
            <button type="button" className="text-sm underline" onClick={() => setP({ ...p, injuries: p.injuries.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
        <div className="flex gap-2">
          <select className={field} value={newInjury} onChange={(e) => setNewInjury(e.target.value)}>
            <option value="">add an injury or limitation…</option>
            {catalog.filter((c) => !p.injuries.some((i) => i.key === c.key)).map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button type="button" className={chip(false)} disabled={!newInjury} onClick={() => {
            setP({ ...p, injuries: [...p.injuries, { key: newInjury, side: null, severity: "moderate", notes: null, since: null }] });
            setNewInjury("");
          }}>Add</button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Equipment</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.equipment === null} onChange={(e) => setP({ ...p, equipment: e.target.checked ? null : [] })} />
          I train in a fully equipped box
        </label>
        {p.equipment !== null && (
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((e) => (
              <button key={e} type="button" className={chip(p.equipment!.includes(e))}
                onClick={() => setP({ ...p, equipment: toggle(p.equipment!, e) })}>{label(e)}</button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Benchmarks</h2>
        {p.benchmarks.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={field} list="movement-names" placeholder="movement" value={b.movement} onChange={(e) => setBenchmark(i, { movement: e.target.value })} />
            <select className={field} value={b.kind} onChange={(e) => setBenchmark(i, { kind: BenchmarkKind.parse(e.target.value) })}>
              {BenchmarkKind.options.map((k) => <option key={k} value={k}>{label(k)}</option>)}
            </select>
            <input className={`${field} w-24`} type="number" min={0} step="any" value={b.value || ""} onChange={(e) => setBenchmark(i, { value: Number(e.target.value) })} />
            <select className={field} value={b.unit} onChange={(e) => setBenchmark(i, { unit: BenchmarkUnit.parse(e.target.value) })}>
              {BenchmarkUnit.options.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button type="button" className="text-sm underline" onClick={() => setP({ ...p, benchmarks: p.benchmarks.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
        <button type="button" className={`${chip(false)} w-fit`} onClick={() => setP({
          ...p, benchmarks: [...p.benchmarks, { movement: "", kind: "1rm", value: 0, unit: "kg", recordedAt: null }],
        })}>Add benchmark</button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Goals</h2>
        {p.goals.map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={`${field} grow`} placeholder="e.g. first strict muscle-up" value={g.description} onChange={(e) => setGoal(i, { description: e.target.value })} />
            <input className={field} list="movement-names" placeholder="movement (optional)" value={g.movement ?? ""} onChange={(e) => setGoal(i, { movement: e.target.value || null })} />
            <button type="button" className="text-sm underline" onClick={() => setP({ ...p, goals: p.goals.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
        <button type="button" className={`${chip(false)} w-fit`} onClick={() => setP({ ...p, goals: [...p.goals, { movement: null, description: "" }] })}>Add goal</button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Availability</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">Minutes per day
            <input className={`${field} w-20`} type="number" min={1} value={p.availability.minutesPerDay ?? ""} onChange={(e) => setP({ ...p, availability: { ...p.availability, minutesPerDay: intOrNull(e.target.value) } })} />
          </label>
          <label className="flex items-center gap-2">Days per week
            <input className={`${field} w-16`} type="number" min={1} max={7} value={p.availability.daysPerWeek ?? ""} onChange={(e) => setP({ ...p, availability: { ...p.availability, daysPerWeek: intOrNull(e.target.value) } })} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {Weekday.options.map((d) => (
            <button key={d} type="button" className={chip(p.availability.days.includes(d))}
              onClick={() => setP({ ...p, availability: { ...p.availability, days: toggle(p.availability.days, d) } })}>{d}</button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className="rounded bg-black px-4 py-2 text-white" onClick={save}>Save profile</button>
        {status && <span className="text-sm text-neutral-600">{status}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Manual check**

`pnpm dev`, sign in, open `/profile`: add `Knee pain` (left, mild) and `Unable to hang`, untick "fully equipped box" and pick dumbbell + jump rope, add a benchmark "T2B" / max reps / 15 / reps, a goal, availability; Save → "Saved", reload → values persist and the benchmark reads "Toes-to-Bar".

- [ ] **Step 9: Verify and commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

```bash
git add -A
git commit -m "feat: structured athlete profile (injuries with side and severity, benchmarks, equipment, goals, availability)"
```

---

### Task U2: Quota and the NDJSON engine stream

**Files:**
- Create: `src/lib/quota.ts`, `src/lib/quota-store.ts`, `src/lib/engine-events.ts`, `src/lib/engine-stream.ts`
- Test: `tests/lib/quota.test.ts`, `tests/lib/engine-stream.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `EngineUnsafeError`, `ProgressStage` (E8); `PipelineResult` (E1); `prisma` (S1).
- Produces:
  - `@/lib/quota`: `type UsageKind = "tailor" | "refine"`, `interface QuotaStore { countSince(userId: string, since: Date): Promise<number>; record(userId: string, kind: UsageKind): Promise<void> }`, `dailyLimit(): number`, `consumeQuota(store, userId, kind, limit, now?): Promise<{ allowed: boolean; used: number; limit: number }>`.
  - `@/lib/quota-store`: `prismaQuotaStore: QuotaStore`.
  - `@/lib/engine-events` (client-safe): `type EngineErrorCode = "engine_failed" | "engine_unsafe"`, `type EngineEvent`, `readEngineStream(response, onEvent): Promise<void>`.
  - `@/lib/engine-stream` (server): `engineStreamResponse(run: (onProgress) => Promise<PipelineResult>): Response`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/quota.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { consumeQuota, dailyLimit, type QuotaStore, type UsageKind } from "@/lib/quota";

function memoryStore(): QuotaStore & { rows: { userId: string; kind: UsageKind; at: Date }[] } {
  const rows: { userId: string; kind: UsageKind; at: Date }[] = [];
  return {
    rows,
    async countSince(userId, since) { return rows.filter((r) => r.userId === userId && r.at >= since).length; },
    async record(userId, kind) { rows.push({ userId, kind, at: new Date() }); },
  };
}

describe("consumeQuota", () => {
  it("records usage until the limit and then refuses", async () => {
    const store = memoryStore();
    expect(await consumeQuota(store, "u1", "tailor", 2)).toEqual({ allowed: true, used: 1, limit: 2 });
    expect(await consumeQuota(store, "u1", "refine", 2)).toEqual({ allowed: true, used: 2, limit: 2 });
    expect(await consumeQuota(store, "u1", "tailor", 2)).toEqual({ allowed: false, used: 2, limit: 2 });
    expect(await consumeQuota(store, "u2", "tailor", 2)).toMatchObject({ allowed: true });
    expect(store.rows).toHaveLength(3);
  });

  it("only counts the last 24 hours", async () => {
    const store = memoryStore();
    store.rows.push({ userId: "u1", kind: "tailor", at: new Date(Date.now() - 25 * 3600 * 1000) });
    expect((await consumeQuota(store, "u1", "tailor", 1)).allowed).toBe(true);
  });
});

describe("dailyLimit", () => {
  const original = process.env.DAILY_ENGINE_LIMIT;
  afterEach(() => {
    if (original === undefined) delete process.env.DAILY_ENGINE_LIMIT;
    else process.env.DAILY_ENGINE_LIMIT = original;
  });

  it("reads a positive integer and defaults to 30", () => {
    process.env.DAILY_ENGINE_LIMIT = "5";
    expect(dailyLimit()).toBe(5);
    process.env.DAILY_ENGINE_LIMIT = "abc";
    expect(dailyLimit()).toBe(30);
  });
});
```

`tests/lib/engine-stream.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { engineStreamResponse } from "@/lib/engine-stream";
import { readEngineStream, type EngineEvent } from "@/lib/engine-events";
import { EngineUnsafeError } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};

async function events(response: Response): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  await readEngineStream(response, (e) => out.push(e));
  return out;
}

describe("engine stream", () => {
  it("streams progress then the result as NDJSON", async () => {
    const res = engineStreamResponse(async (progress) => {
      progress("analyzing");
      progress("tailoring");
      return result;
    });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await events(res)).toEqual([
      { type: "progress", stage: "analyzing" },
      { type: "progress", stage: "tailoring" },
      { type: "result", result },
    ]);
  });

  it("reports a fail-closed engine as engine_unsafe", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = engineStreamResponse(async () => { throw new EngineUnsafeError([]); });
    expect(await events(res)).toEqual([{ type: "error", error: "engine_unsafe" }]);
    warn.mockRestore();
  });

  it("hides any other failure behind engine_failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = engineStreamResponse(async () => { throw new Error("secret stack"); });
    const out = await events(res);
    expect(out).toEqual([{ type: "error", error: "engine_failed" }]);
    expect(JSON.stringify(out)).not.toContain("secret");
    error.mockRestore();
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm exec vitest run tests/lib` → FAIL (modules not found).

- [ ] **Step 3: Implement the quota**

`src/lib/quota.ts`:
```ts
export type UsageKind = "tailor" | "refine";

export interface QuotaStore {
  countSince(userId: string, since: Date): Promise<number>;
  record(userId: string, kind: UsageKind): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dailyLimit(): number {
  const n = Number(process.env.DAILY_ENGINE_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

/** Counts engine runs in the last 24 h; records this one only when it is allowed. */
export async function consumeQuota(
  store: QuotaStore, userId: string, kind: UsageKind, limit: number, now: Date = new Date(),
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const used = await store.countSince(userId, new Date(now.getTime() - DAY_MS));
  if (used >= limit) return { allowed: false, used, limit };
  await store.record(userId, kind);
  return { allowed: true, used: used + 1, limit };
}
```

`src/lib/quota-store.ts`:
```ts
import { prisma } from "@/lib/db";
import type { QuotaStore } from "@/lib/quota";

export const prismaQuotaStore: QuotaStore = {
  countSince: (userId, since) => prisma.llmUsage.count({ where: { userId, createdAt: { gte: since } } }),
  record: async (userId, kind) => {
    await prisma.llmUsage.create({ data: { userId, kind } });
  },
};
```

Append to `.env.example`:
```bash
# Engine runs (tailor + refine) allowed per user per rolling 24 h
DAILY_ENGINE_LIMIT="30"
```

- [ ] **Step 4: Implement the stream**

`src/lib/engine-events.ts` (imported by client components — keep it free of server code):
```ts
import type { ProgressStage } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";

export type EngineErrorCode = "engine_failed" | "engine_unsafe";

export type EngineEvent =
  | { type: "progress"; stage: ProgressStage }
  | { type: "result"; result: PipelineResult }
  | { type: "error"; error: EngineErrorCode };

/** Reads an NDJSON engine stream, calling onEvent once per line. */
export async function readEngineStream(response: Response, onEvent: (e: EngineEvent) => void): Promise<void> {
  if (!response.body) throw new Error("empty engine response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as EngineEvent);
      newline = buffer.indexOf("\n");
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as EngineEvent);
}
```

`src/lib/engine-stream.ts`:
```ts
import { EngineUnsafeError, type ProgressStage } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";
import type { EngineEvent } from "@/lib/engine-events";

/** Streams progress stages, then the result or an error code, as NDJSON. Never leaks exception text. */
export function engineStreamResponse(
  run: (onProgress: (stage: ProgressStage) => void) => Promise<PipelineResult>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: EngineEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const result = await run((stage) => send({ type: "progress", stage }));
        send({ type: "result", result });
      } catch (e) {
        if (e instanceof EngineUnsafeError) {
          console.warn("engine failed closed", e.findings);
          send({ type: "error", error: "engine_unsafe" });
        } else {
          console.error("engine failed", e);
          send({ type: "error", error: "engine_failed" });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
```

- [ ] **Step 5: Run them, verify they pass**

Run: `pnpm exec vitest run tests/lib` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: per-user daily engine quota and the NDJSON progress stream"
```

---

### Task U3: Engine API routes (tailor, refine, save)

**Files:**
- Create: `src/lib/api-schemas.ts`, `src/lib/tailor-service.ts`, `src/app/api/tailor/route.ts`, `src/app/api/tailor/refine/route.ts`, `src/app/api/tailor/save/route.ts`
- Test: `tests/lib/api-schemas.test.ts`

**Interfaces:**
- Consumes: `runTailorPipeline`, `runRefinePipeline` (E8); `getProvider` (E3); `getDomainData` (D5); `consumeQuota`, `dailyLimit`, `prismaQuotaStore`, `engineStreamResponse` (U2); `normalizeProfile`, `jsonError` (U1); `getUserId` (S2); `toJson` (S1).
- Produces: `TailorBodySchema` (`{ input, request }`), `RefineBodySchema` (`{ previous, feedback, request }`), `SaveBodySchema` (`{ result, request }`) from `@/lib/api-schemas`; `loadProfile(userId): Promise<AthleteProfile>` from `@/lib/tailor-service`; routes `POST /api/tailor` and `POST /api/tailor/refine` (NDJSON `EngineEvent` stream; JSON error codes `unauthorized` 401, `invalid_request` 400, `engine_unavailable` 503, `quota_exceeded` 429), `POST /api/tailor/save` → `{ ok: true, id }`.

- [ ] **Step 1: Write the failing test `tests/lib/api-schemas.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { RefineBodySchema, SaveBodySchema, TailorBodySchema } from "@/lib/api-schemas";
import { emptyRequest, type PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};

describe("API bodies", () => {
  it("accepts a paste and a manual tailor request", () => {
    expect(TailorBodySchema.safeParse({ input: { kind: "paste", rawText: "Fran" }, request: emptyRequest() }).success).toBe(true);
    expect(TailorBodySchema.safeParse({
      input: { kind: "manual", workout: { name: null, blocks: [{ title: null, format: "amrap", scheme: null, timeDomainMinutes: 10, coachingNotes: null, components: [] }] } },
      request: emptyRequest(),
    }).success).toBe(true);
  });

  it("rejects an empty or oversized paste", () => {
    expect(TailorBodySchema.safeParse({ input: { kind: "paste", rawText: "" }, request: emptyRequest() }).success).toBe(false);
    expect(TailorBodySchema.safeParse({ input: { kind: "paste", rawText: "x".repeat(20001) }, request: emptyRequest() }).success).toBe(false);
  });

  it("requires feedback to refine", () => {
    expect(RefineBodySchema.safeParse({ previous: result, feedback: "", request: emptyRequest() }).success).toBe(false);
    expect(RefineBodySchema.safeParse({ previous: result, feedback: "too easy", request: emptyRequest() }).success).toBe(true);
  });

  it("saves a full pipeline result", () => {
    expect(SaveBodySchema.safeParse({ result, request: emptyRequest() }).success).toBe(true);
    expect(SaveBodySchema.safeParse({ result: { ...result, model: "" }, request: emptyRequest() }).success).toBe(false);
  });
});
```

Run: `pnpm exec vitest run tests/lib/api-schemas.test.ts` → FAIL.

- [ ] **Step 2: Implement `src/lib/api-schemas.ts`**

```ts
import { z } from "zod";
import { ManualWorkoutSchema, PipelineResultSchema, TailorRequestSchema } from "@/lib/engine/types";

export const WorkoutInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paste"), rawText: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("manual"), workout: ManualWorkoutSchema }),
]);

export const TailorBodySchema = z.object({ input: WorkoutInputSchema, request: TailorRequestSchema });
export const RefineBodySchema = z.object({
  previous: PipelineResultSchema,
  feedback: z.string().trim().min(1).max(2000),
  request: TailorRequestSchema,
});
export const SaveBodySchema = z.object({ result: PipelineResultSchema, request: TailorRequestSchema });
```

Run: `pnpm exec vitest run tests/lib/api-schemas.test.ts` → PASS.

- [ ] **Step 3: Implement `src/lib/tailor-service.ts`**

```ts
import { prisma } from "@/lib/db";
import type { AthleteProfile } from "@/lib/engine/types";
import { normalizeProfile } from "@/lib/profile";

export async function loadProfile(userId: string): Promise<AthleteProfile> {
  const row = await prisma.athleteProfile.findUnique({ where: { userId } });
  return normalizeProfile(row?.data);
}
```

- [ ] **Step 4: Implement `src/app/api/tailor/route.ts`**

```ts
import { getProvider } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { TailorBodySchema } from "@/lib/api-schemas";
import { getDomainData } from "@/lib/domain/repository";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { engineStreamResponse } from "@/lib/engine-stream";
import { jsonError } from "@/lib/http";
import { consumeQuota, dailyLimit } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const body = TailorBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("invalid_request", 400);

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return jsonError("engine_unavailable", 503);
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, "tailor", dailyLimit());
  if (!quota.allowed) return jsonError("quota_exceeded", 429);

  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return engineStreamResponse((onProgress) =>
    runTailorPipeline(provider, { input: body.data.input, profile, request: body.data.request, domain, onProgress }),
  );
}
```

- [ ] **Step 5: Implement `src/app/api/tailor/refine/route.ts`**

```ts
import { getProvider } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { RefineBodySchema } from "@/lib/api-schemas";
import { getDomainData } from "@/lib/domain/repository";
import { runRefinePipeline } from "@/lib/engine/pipeline";
import { engineStreamResponse } from "@/lib/engine-stream";
import { jsonError } from "@/lib/http";
import { consumeQuota, dailyLimit } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const body = RefineBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("invalid_request", 400);

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return jsonError("engine_unavailable", 503);
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, "refine", dailyLimit());
  if (!quota.allowed) return jsonError("quota_exceeded", 429);

  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return engineStreamResponse((onProgress) =>
    runRefinePipeline(provider, {
      previous: body.data.previous, feedback: body.data.feedback, profile, request: body.data.request, domain, onProgress,
    }),
  );
}
```

- [ ] **Step 6: Implement `src/app/api/tailor/save/route.ts`** (persists exactly what was reviewed — never re-runs the nondeterministic engine)

```ts
import { NextResponse } from "next/server";
import { SaveBodySchema } from "@/lib/api-schemas";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { toJson } from "@/lib/json";
import { getUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const body = SaveBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("invalid_request", 400);
  const { result, request } = body.data;
  const saved = await prisma.tailoredWorkout.create({
    data: {
      userId,
      original: toJson(result.original),
      request: toJson(request),
      conditions: toJson(result.conditions),
      tailored: toJson(result.tailored),
      findings: toJson(result.findings),
      feedbackHistory: toJson(result.feedbackHistory),
      model: result.model,
    },
  });
  return NextResponse.json({ ok: true, id: saved.id });
}
```

- [ ] **Step 7: Smoke-test the routes** (signed in, `pnpm dev`, `GEMINI_API_KEY` set)

In the browser devtools console on `http://localhost:3000`:
```js
const r = await fetch("/api/tailor", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: { kind: "paste", rawText: "Fran\n21-15-9 for time\nThrusters 43/30 kg\nPull-ups" },
    request: { situation: "sore right shoulder", timeCapMinutes: null, targetMovement: null, equipmentToday: null } }) });
console.log(await r.text());
```
Expected: NDJSON lines `progress` (analyzing, tailoring, validating) then one `result` without Thruster or Pull-up. Signed out, the same call returns `{"error":"unauthorized"}` with 401.

- [ ] **Step 8: Verify and commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

```bash
git add -A
git commit -m "feat: streaming tailor and refine endpoints with quota, and save-what-you-reviewed"
```

---

### Task U3b: Unrecognized-movement queue

The catalog grows from real usage: every movement name the engine meets but cannot resolve is queued (name only, never workout text), and `pnpm review:movements` lists the queue by frequency and closes entries the library has since learned. Adding a movement stays a reviewed data change (one-off migration script + a test, as in Task E10) — the queue never edits `data/`.

**Files:**
- Create: `src/lib/unrecognized.ts`, `src/lib/unrecognized-store.ts`, `scripts/review-movements.ts`, `tests/lib/unrecognized.test.ts`, `prisma/migrations/<timestamp>_unrecognized_movement/` (generated)
- Modify: `prisma/schema.prisma` (append a model), `src/app/api/tailor/route.ts`, `src/app/api/tailor/refine/route.ts`, `package.json` (script)

**Interfaces:**
- Consumes: `normalizeMovementName`, `createMovementResolver`, `MovementResolver` (D5); `getDomainData` (D5); `PipelineResult` (E1); `prisma` (S1); the U3 routes.
- Produces:
  - `@/lib/unrecognized`: `type UnrecognizedStatus = "pending" | "resolved" | "ignored"`, `interface UnrecognizedEntry { key: string; example: string }`, `interface UnrecognizedStore { record(entries: UnrecognizedEntry[]): Promise<void> }`, `collectUnrecognized(result: PipelineResult): UnrecognizedEntry[]`, `recordUnrecognized(store, result): Promise<void>` (never throws), `newlyResolved(entries, resolve): { key: string; resolvedTo: string }[]`.
  - `@/lib/unrecognized-store`: `prismaUnrecognizedStore: UnrecognizedStore`.
  - Prisma model `UnrecognizedMovement { key @unique, example, count, status, resolvedTo?, firstSeenAt, lastSeenAt }`; command `pnpm review:movements [ignore <key>]`.

- [ ] **Step 1: Write the failing test `tests/lib/unrecognized.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import movementsJson from "../../data/movements.json";
import { MovementSchema } from "@/lib/domain/types";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { PipelineResult, WorkoutComponent } from "@/lib/engine/types";
import { collectUnrecognized, newlyResolved, recordUnrecognized, type UnrecognizedStore } from "@/lib/unrecognized";
import { fran, identityResult } from "../fixtures/workouts";

const unknown = (base: WorkoutComponent, movement: string): WorkoutComponent => ({ ...base, movement, canonical: null });

function result(extraOriginal: string[] = [], extraTailored: string[] = []): PipelineResult {
  const original = fran();
  const tailored = identityResult(fran());
  const base = original.blocks[0].components[0];
  original.blocks[0].components.push(...extraOriginal.map((m) => unknown(base, m)));
  tailored.blocks[0].components.push(...extraTailored.map((m) => unknown(base, m)));
  return { original, conditions: [], unavailableEquipment: [], tailored, findings: [], feedbackHistory: [], model: "fake" };
}

function store(fail = false): UnrecognizedStore & { record: ReturnType<typeof vi.fn> } {
  return { record: vi.fn(async () => { if (fail) throw new Error("db down"); }) };
}

describe("collectUnrecognized", () => {
  it("returns nothing when every movement resolved", () => {
    expect(collectUnrecognized(result())).toEqual([]);
  });

  it("collects each unresolved name once, from the original and the tailored session", () => {
    expect(collectUnrecognized(result(["Zercher Carry"], [" zercher carry ", "Sandbag Bear Hug Squat"]))).toEqual([
      { key: "zerchercarry", example: "Zercher Carry" },
      { key: "sandbagbearhugsquat", example: "Sandbag Bear Hug Squat" },
    ]);
  });

  it("stores a bounded example, never a whole block of text", () => {
    const [entry] = collectUnrecognized(result(["x".repeat(500)]));
    expect(entry.example).toHaveLength(80);
  });
});

describe("recordUnrecognized", () => {
  it("records the entries", async () => {
    const s = store();
    await recordUnrecognized(s, result(["Zercher Carry"]));
    expect(s.record).toHaveBeenCalledWith([{ key: "zerchercarry", example: "Zercher Carry" }]);
  });

  it("does not touch the store when there is nothing to record", async () => {
    const s = store();
    await recordUnrecognized(s, result());
    expect(s.record).not.toHaveBeenCalled();
  });

  it("never fails the request when the store fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordUnrecognized(store(true), result(["Zercher Carry"]))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("newlyResolved", () => {
  it("closes the entries the library now resolves", () => {
    const resolve = createMovementResolver(movementsJson.map((m) => MovementSchema.parse(m)));
    expect(newlyResolved([
      { key: "t2b", example: "T2B" },
      { key: "zerchercarry", example: "Zercher Carry" },
    ], resolve)).toEqual([{ key: "t2b", resolvedTo: "Toes-to-Bar" }]);
  });
});
```

Run: `pnpm exec vitest run tests/lib/unrecognized.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/unrecognized.ts`**

```ts
import { normalizeMovementName, type MovementResolver } from "@/lib/domain/resolve";
import type { PipelineResult } from "@/lib/engine/types";

// The queue that grows the catalog: movement names the engine met but could not resolve.
// Only the name is stored, never the workout text (programming may be private or paid).

export type UnrecognizedStatus = "pending" | "resolved" | "ignored";

export interface UnrecognizedEntry {
  key: string; // normalizeMovementName(example)
  example: string; // as written, truncated
}

export interface UnrecognizedStore {
  record(entries: UnrecognizedEntry[]): Promise<void>;
}

const MAX_EXAMPLE = 80;

/** Each unresolved movement name of the original and the tailored session, once per normalized key. */
export function collectUnrecognized(result: PipelineResult): UnrecognizedEntry[] {
  const byKey = new Map<string, UnrecognizedEntry>();
  for (const c of [...result.original.blocks, ...result.tailored.blocks].flatMap((b) => b.components)) {
    if (c.canonical) continue;
    const example = c.movement.trim().slice(0, MAX_EXAMPLE);
    const key = normalizeMovementName(example);
    if (key && !byKey.has(key)) byKey.set(key, { key, example });
  }
  return [...byKey.values()];
}

/** Records the result's unrecognized names; a store failure is logged, never surfaced to the athlete. */
export async function recordUnrecognized(store: UnrecognizedStore, result: PipelineResult): Promise<void> {
  const entries = collectUnrecognized(result);
  if (entries.length === 0) return;
  try {
    await store.record(entries);
  } catch (e) {
    console.error("recording unrecognized movements failed", e);
  }
}

/** Queue entries the current library resolves (a new row or alias was added since they were seen). */
export function newlyResolved(
  entries: UnrecognizedEntry[], resolve: MovementResolver,
): { key: string; resolvedTo: string }[] {
  return entries.flatMap((e) => {
    const m = resolve(e.example);
    return m ? [{ key: e.key, resolvedTo: m.name }] : [];
  });
}
```

Run: `pnpm exec vitest run tests/lib/unrecognized.test.ts` → PASS (7 tests).

- [ ] **Step 3: Append the model to `prisma/schema.prisma` and migrate**

```prisma
// Catalog growth queue: movement names the engine could not resolve (names only, never workout text).
model UnrecognizedMovement {
  id          String   @id @default(cuid())
  key         String   @unique // normalizeMovementName(example)
  example     String // as first written, max 80 chars
  count       Int      @default(1)
  status      String   @default("pending") // "pending" | "resolved" | "ignored"
  resolvedTo  String? // canonical name once the library resolves it
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  @@index([status, count])
}
```

Confirm `DIRECT_URL` points at the Neon `dev` branch, then:

```bash
pnpm exec prisma migrate dev --name unrecognized_movement
```

Expected: `prisma/migrations/<timestamp>_unrecognized_movement/migration.sql` creates `UnrecognizedMovement` only (no drops).

- [ ] **Step 4: Implement `src/lib/unrecognized-store.ts`**

```ts
import { prisma } from "@/lib/db";
import type { UnrecognizedStore } from "@/lib/unrecognized";

export const prismaUnrecognizedStore: UnrecognizedStore = {
  record: async (entries) => {
    const now = new Date();
    await prisma.$transaction(
      entries.map((e) =>
        prisma.unrecognizedMovement.upsert({
          where: { key: e.key },
          create: { key: e.key, example: e.example },
          update: { count: { increment: 1 }, lastSeenAt: now },
        }),
      ),
    );
  },
};
```

- [ ] **Step 5: Record from both engine routes**

In `src/app/api/tailor/route.ts` add the imports:
```ts
import { recordUnrecognized } from "@/lib/unrecognized";
import { prismaUnrecognizedStore } from "@/lib/unrecognized-store";
```
and replace the `return engineStreamResponse(...)` statement with:
```ts
  return engineStreamResponse(async (onProgress) => {
    const result = await runTailorPipeline(provider, { input: body.data.input, profile, request: body.data.request, domain, onProgress });
    await recordUnrecognized(prismaUnrecognizedStore, result);
    return result;
  });
```

In `src/app/api/tailor/refine/route.ts` add the same two imports and replace its `return engineStreamResponse(...)` statement with:
```ts
  return engineStreamResponse(async (onProgress) => {
    const result = await runRefinePipeline(provider, {
      previous: body.data.previous, feedback: body.data.feedback, profile, request: body.data.request, domain, onProgress,
    });
    await recordUnrecognized(prismaUnrecognizedStore, result);
    return result;
  });
```

A fail-closed run (`EngineUnsafeError`) records nothing: it throws before returning a result.

- [ ] **Step 6: Create `scripts/review-movements.ts`** and add `"review:movements": "tsx scripts/review-movements.ts"` to `package.json` `scripts`

```ts
// Reviews the unrecognized-movement queue (needs DATABASE_URL).
// Usage: pnpm review:movements               — close entries the library now resolves, list the pending ones
//        pnpm review:movements ignore <key>  — mark a non-movement (drill, cue, typo) as ignored
// Adding a movement stays a reviewed data change (scripts/migrations + a test), never automatic.
import "dotenv/config";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { newlyResolved } from "@/lib/unrecognized";

async function main() {
  const [command, key] = process.argv.slice(2);
  if (command === "ignore") {
    if (!key) throw new Error("usage: pnpm review:movements ignore <key>");
    await prisma.unrecognizedMovement.update({ where: { key }, data: { status: "ignored" } });
    console.log(`ignored ${key}`);
    return;
  }

  const { movements } = await getDomainData();
  const pending = await prisma.unrecognizedMovement.findMany({
    where: { status: "pending" },
    orderBy: [{ count: "desc" }, { lastSeenAt: "desc" }],
  });
  const closed = newlyResolved(pending, createMovementResolver(movements));
  for (const c of closed) {
    await prisma.unrecognizedMovement.update({ where: { key: c.key }, data: { status: "resolved", resolvedTo: c.resolvedTo } });
    console.log(`resolved  ${c.key} -> ${c.resolvedTo}`);
  }

  const closedKeys = new Set(closed.map((c) => c.key));
  const open = pending.filter((p) => !closedKeys.has(p.key));
  console.log(`\npending: ${open.length}`);
  for (const p of open) {
    console.log(`  ${String(p.count).padStart(4)}  ${p.example}  [${p.key}]  last ${p.lastSeenAt.toISOString().slice(0, 10)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 7: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean. Then, signed in with `pnpm dev`, tailor a workout containing an unknown movement (e.g. "3 rounds: 10 Zercher Carry steps, 10 Air Squats") and run `pnpm review:movements`.
Expected: `zerchercarry` is listed as pending with count 1; `pnpm review:movements ignore zerchercarry` marks it ignored.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: queue unrecognized movements for catalog review"
```

---

### Task U4: Tailor page — input, request, progress and result

**Files:**
- Create: `src/components/WorkoutView.tsx`, `src/app/tailor/page.tsx`, `src/app/tailor/TailorClient.tsx`, `src/app/tailor/ResultView.tsx`, `src/app/tailor/ManualEntryForm.tsx` (a stub here; completed in U5)

**Interfaces:**
- Consumes: `readEngineStream`, `EngineEvent` (U2); `renderComponent` (E4); E1 types; routes (U3).
- Produces: `WorkoutView({ heading, name, blocks, badge? })`, `ResultView({ result, conditionLabels })`, `TailorClient({ movementNames, equipmentOptions, conditionLabels })`, `ManualEntryForm({ value, onChange, movementNames })`, `emptyManualWorkout()`.

- [ ] **Step 1: Implement `src/components/WorkoutView.tsx`**

```tsx
import type { ReactNode } from "react";
import { renderComponent } from "@/lib/engine/render-text";
import type { WorkoutBlock, WorkoutComponent } from "@/lib/engine/types";

interface Props {
  heading: string;
  name: string | null;
  blocks: WorkoutBlock[];
  badge?: (blockIndex: number, component: WorkoutComponent) => ReactNode;
}

const words = (s: string) => s.replaceAll("_", " ");

export function WorkoutView({ heading, name, blocks, badge }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{heading}</h3>
      {name && <div className="font-medium">{name}</div>}
      {blocks.map((b, i) => (
        <div key={i} className="rounded border p-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{b.title ?? `Block ${i + 1}`}</span>
            {b.day !== null && <span className="text-xs text-neutral-500">Day {b.day}</span>}
            <span className="text-xs text-neutral-500">
              {words(b.format)}{b.timeDomainMinutes !== null ? ` · ~${b.timeDomainMinutes} min` : ""}
            </span>
            {b.stimulus && (
              <span className="rounded bg-neutral-100 px-2 text-xs">
                {words(b.stimulus.quality)}{b.stimulus.energySystem ? ` · ${b.stimulus.energySystem}` : ""}
              </span>
            )}
          </div>
          {b.scheme && <div className="text-sm">{b.scheme}</div>}
          {b.components.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {b.components.map((c, j) => (
                <li key={j} className="flex flex-wrap items-center gap-2">{renderComponent(c)}{badge?.(i, c)}</li>
              ))}
            </ul>
          ) : (
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{b.rawText}</pre>
          )}
          {b.coachingNotes && <p className="mt-1 text-xs text-neutral-600">{b.coachingNotes}</p>}
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Implement `src/app/tailor/ResultView.tsx`**

```tsx
import { WorkoutView } from "@/components/WorkoutView";
import type { Finding, PipelineResult, WorkoutComponent } from "@/lib/engine/types";

const BADGE: Partial<Record<Finding["kind"], { text: string; className: string }>> = {
  caution_movement: { text: "caution", className: "bg-amber-100 text-amber-900" },
  unrecognized_movement: { text: "not verified", className: "bg-neutral-200 text-neutral-800" },
  equipment_unavailable: { text: "missing equipment", className: "bg-red-100 text-red-900" },
  contraindicated_movement: { text: "contraindicated", className: "bg-red-100 text-red-900" },
};

export function ResultView({ result, conditionLabels }: { result: PipelineResult; conditionLabels: Record<string, string> }) {
  const { tailored } = result;
  const badges = (blockIndex: number, c: WorkoutComponent) =>
    result.findings
      .filter((f) => f.blockIndex === blockIndex && f.movement === (c.canonical ?? c.movement) && BADGE[f.kind])
      .map((f) => (
        <span key={f.kind} title={f.message} className={`rounded px-2 text-xs ${BADGE[f.kind]!.className}`}>
          {BADGE[f.kind]!.text}
        </span>
      ));

  return (
    <div className="flex flex-col gap-6">
      {result.conditions.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {result.conditions.map((c) => (
            <span key={c.key} className="rounded border px-2 py-1">
              {conditionLabels[c.key] ?? c.key}{c.side ? ` (${c.side})` : ""} · {c.severity}
              {c.source === "today" ? " · today" : ""}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <WorkoutView heading="Original" name={result.original.name} blocks={result.original.blocks} />
        <WorkoutView heading="Tailored for today" name={tailored.name} blocks={tailored.blocks} badge={badges} />
      </div>

      {tailored.droppedBlocks.length > 0 && (
        <section>
          <h3 className="font-semibold">Dropped</h3>
          <ul className="list-disc pl-5 text-sm">
            {tailored.droppedBlocks.map((d) => (
              <li key={d.index}>{result.original.blocks[d.index]?.title ?? `Block ${d.index + 1}`}: {d.reason}</li>
            ))}
          </ul>
        </section>
      )}

      {tailored.changes.length > 0 && (
        <section>
          <h3 className="font-semibold">What changed</h3>
          <ul className="list-disc pl-5 text-sm">
            {tailored.changes.map((c, i) => (
              <li key={i}><span className="line-through">{c.original}</span> → <b>{c.modified}</b>: {c.reason}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-semibold">Why the stimulus is preserved</h3>
        <p className="text-sm">{tailored.rationale}</p>
      </section>

      {tailored.safetyNote && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">{tailored.safetyNote}</p>
      )}

      {result.findings.some((f) => !BADGE[f.kind] || f.blockIndex === null) && (
        <section>
          <h3 className="font-semibold">Checks</h3>
          <ul className="list-disc pl-5 text-sm text-neutral-700">
            {result.findings.filter((f) => !BADGE[f.kind] || f.blockIndex === null).map((f, i) => <li key={i}>{f.message}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the manual-entry stub `src/app/tailor/ManualEntryForm.tsx`** (U5 replaces the component body)

```tsx
"use client";

import type { ComponentDraft, ManualBlock, ManualWorkout } from "@/lib/engine/types";

export const emptyComponent = (): ComponentDraft => ({
  movement: "", reps: null, load: null, loadKg: null, percent1RM: null,
  distanceMeters: null, calories: null, durationSeconds: null, notes: null,
});
export const emptyBlock = (): ManualBlock => ({
  title: null, format: "for_time", scheme: null, timeDomainMinutes: null, coachingNotes: null, components: [emptyComponent()],
});
export const emptyManualWorkout = (): ManualWorkout => ({ name: null, blocks: [emptyBlock()] });

interface Props {
  value: ManualWorkout;
  onChange: (w: ManualWorkout) => void;
  movementNames: string[];
}

export function ManualEntryForm(_props: Props) {
  return <p className="text-sm text-neutral-600">Manual entry is coming in the next step.</p>;
}
```

- [ ] **Step 4: Implement `src/app/tailor/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getDomainData } from "@/lib/domain/repository";
import { Equipment } from "@/lib/domain/types";
import { getUserId } from "@/lib/session";
import { TailorClient } from "./TailorClient";

export default async function TailorPage() {
  if (!(await getUserId())) redirect("/signin");
  const domain = await getDomainData();
  return (
    <TailorClient
      movementNames={domain.movements.map((m) => m.name)}
      equipmentOptions={[...Equipment.options]}
      conditionLabels={Object.fromEntries(domain.contraindications.map((c) => [c.key, c.label]))}
    />
  );
}
```

- [ ] **Step 5: Implement `src/app/tailor/TailorClient.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Equipment } from "@/lib/domain/types";
import type { ProgressStage } from "@/lib/engine/pipeline";
import { ManualWorkoutSchema, type ManualWorkout, type PipelineResult, type TailorRequest } from "@/lib/engine/types";
import { readEngineStream } from "@/lib/engine-events";
import { ManualEntryForm, emptyManualWorkout } from "./ManualEntryForm";
import { ResultView } from "./ResultView";

interface Props {
  movementNames: string[];
  equipmentOptions: Equipment[];
  conditionLabels: Record<string, string>;
}

const STAGE_TEXT: Record<ProgressStage, string> = {
  analyzing: "Reading the workout and your situation…",
  tailoring: "Tailoring the session…",
  validating: "Checking it against your conditions and equipment…",
  retrying: "Fixing what the check found…",
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Your session expired. Sign in again.",
  invalid_request: "Something in the form is not valid.",
  quota_exceeded: "You reached today's limit. Try again tomorrow.",
  engine_unavailable: "The engine is not configured.",
  engine_failed: "The engine failed. Try again.",
  engine_unsafe: "We could not produce a modification that is safe for your conditions. Rephrase your situation, or check with a professional.",
};

const field = "rounded border px-2 py-1 text-sm";
const chip = (on: boolean) => `rounded border px-3 py-1 text-sm ${on ? "bg-black text-white" : ""}`;

export function TailorClient({ movementNames, equipmentOptions, conditionLabels }: Props) {
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [rawText, setRawText] = useState("");
  const [manual, setManual] = useState<ManualWorkout>(emptyManualWorkout());
  const [situation, setSituation] = useState("");
  const [timeCap, setTimeCap] = useState("");
  const [target, setTarget] = useState("");
  const [overrideEquipment, setOverrideEquipment] = useState(false);
  const [equipmentToday, setEquipmentToday] = useState<Equipment[]>([]);
  const [stage, setStage] = useState<ProgressStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [request, setRequest] = useState<TailorRequest | null>(null);
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = stage !== null;

  function buildRequest(): TailorRequest {
    return {
      situation: situation.trim(),
      timeCapMinutes: timeCap.trim() ? Math.max(1, Math.round(Number(timeCap))) : null,
      targetMovement: target.trim() || null,
      equipmentToday: overrideEquipment ? equipmentToday : null,
    };
  }

  async function runEngine(url: string, body: unknown) {
    setError(null);
    setSaved(false);
    setStage("analyzing");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const { error: code } = await res.json().catch(() => ({ error: "engine_failed" }));
        setError(ERROR_TEXT[code] ?? ERROR_TEXT.engine_failed);
        return;
      }
      await readEngineStream(res, (e) => {
        if (e.type === "progress") setStage(e.stage);
        else if (e.type === "result") {
          setResult(e.result);
          setFeedback("");
        } else setError(ERROR_TEXT[e.error]);
      });
    } catch {
      setError(ERROR_TEXT.engine_failed);
    } finally {
      setStage(null);
    }
  }

  function submit() {
    const req = buildRequest();
    if (mode === "paste") {
      if (!rawText.trim()) return setError("Paste a workout first.");
      setRequest(req);
      void runEngine("/api/tailor", { input: { kind: "paste", rawText }, request: req });
      return;
    }
    const parsed = ManualWorkoutSchema.safeParse(manual);
    if (!parsed.success) return setError("Give every movement a name.");
    setRequest(req);
    void runEngine("/api/tailor", { input: { kind: "manual", workout: parsed.data }, request: req });
  }

  function refine() {
    if (!result || !request || !feedback.trim()) return;
    void runEngine("/api/tailor/refine", { previous: result, feedback: feedback.trim(), request });
  }

  async function save() {
    if (!result || !request) return;
    const res = await fetch("/api/tailor/save", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result, request }),
    });
    if (res.ok) setSaved(true);
    else setError("Could not save the result.");
  }

  return (
    <div className="flex flex-col gap-6">
      <datalist id="movement-names">{movementNames.map((n) => <option key={n} value={n} />)}</datalist>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" className={chip(mode === "paste")} onClick={() => setMode("paste")}>Paste</button>
          <button type="button" className={chip(mode === "manual")} onClick={() => setMode("manual")}>Enter manually</button>
        </div>
        {mode === "paste" ? (
          <>
            <textarea className={`${field} min-h-48`} value={rawText} onChange={(e) => setRawText(e.target.value)}
              placeholder={"Paste today's session exactly as programmed.\nMissed days? Paste all of them."} />
          </>
        ) : (
          <ManualEntryForm value={manual} onChange={setManual} movementNames={movementNames} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Today</h2>
        <textarea className={`${field} min-h-20`} value={situation} onChange={(e) => setSituation(e.target.value)}
          placeholder="How are you? Pain, fatigue, missing equipment… in your own words (optional)" />
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">Time cap (min)
            <input className={`${field} w-20`} type="number" min={1} value={timeCap} onChange={(e) => setTimeCap(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">Work on
            <input className={field} list="movement-names" placeholder="movement (optional)" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overrideEquipment} onChange={(e) => setOverrideEquipment(e.target.checked)} />
          Different equipment than usual today
        </label>
        {overrideEquipment && (
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((e) => (
              <button key={e} type="button" className={chip(equipmentToday.includes(e))}
                onClick={() => setEquipmentToday(equipmentToday.includes(e) ? equipmentToday.filter((x) => x !== e) : [...equipmentToday, e])}>
                {e.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        )}
      </section>

      <button type="button" className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={submit}>
        Tailor my workout
      </button>

      {busy && <p className="text-sm text-neutral-600" aria-live="polite">{STAGE_TEXT[stage!]}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

      {result && (
        <>
          <ResultView result={result} conditionLabels={conditionLabels} />
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Not quite right?</h2>
            <textarea className={`${field} min-h-16`} value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. still hurts, too easy, no rower" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(false)} disabled={busy || !feedback.trim()} onClick={refine}>Refine</button>
              <button type="button" className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50" disabled={busy || saved} onClick={save}>
                {saved ? "Saved" : "Save to history"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Manual check on a phone-sized viewport (375 px)**

`pnpm dev`, sign in, `/tailor`: paste Fran, situation "me duele el hombro derecho", submit. Expected: the stage text advances; the result shows the shoulder condition chip, original and tailored blocks stacked, no Thruster/Pull-up, any caution badge with its tooltip, the rationale and the safety note. Refine with "too easy" → a new result; Save → "Saved". No horizontal scrolling at 375 px.

- [ ] **Step 7: Verify and commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

```bash
git add -A
git commit -m "feat: tailor page with streamed progress, side-by-side result, refine and save"
```

---

### Task U4b: Athlete-confirmed conditions (two-phase tailor)

The model only **suggests** today's conditions: which catalog condition, which side and how severe is an interpretation, and severity decides the whole assessment (the same "sore right shoulder" was read as moderate one day and mild the next). Phase 1 (`POST /api/tailor/analyze`, JSON) analyzes the workout and the situation; when it suggests any condition the athlete confirms or corrects it (side, severity, remove, add a missed one) and phase 2 (`POST /api/tailor`, NDJSON) tailors with the confirmed list. With no suggestion phase 2 starts at once. Refine works the same way (`/api/tailor/refine/analyze` → confirm → `/api/tailor/refine`). The client sends the phase-1 analysis back (as refine already sends `previous`): it can only alter the athlete's own session, the stored profile injuries are always re-applied, and the validator enforces whatever is confirmed. Quota is counted per kind (`analyze`, `tailor`, `refine`, each with `DAILY_ENGINE_LIMIT`) so neither phase can be called unbounded.

**Files:**
- Modify: `src/lib/engine/types.ts` (append), `src/lib/engine/conditions.ts`, `src/lib/engine/pipeline.ts`, `src/lib/quota.ts`, `src/lib/quota-store.ts`, `prisma/schema.prisma` (comment only), `src/lib/api-schemas.ts`, `src/lib/engine-route.ts`, `src/app/api/tailor/route.ts`, `src/app/api/tailor/refine/route.ts`, `src/app/tailor/page.tsx`, `src/app/tailor/TailorClient.tsx`, `src/lib/eval/grade.ts`, `scripts/eval.ts`
- Create: `src/app/api/tailor/analyze/route.ts`, `src/app/api/tailor/refine/analyze/route.ts`, `src/app/tailor/ConfirmConditions.tsx`
- Test: `tests/engine/pipeline.test.ts` (rewritten), `tests/lib/quota.test.ts`, `tests/lib/api-schemas.test.ts`, `tests/eval/grade.test.ts`

**Interfaces:**
- Consumes: `analyzePaste`, `analyzeManual`, `analyzeSituation` (E4); `activateConditions`, `profileConditionRefs` (E5); `tailorAndValidate` internals (E8); `handleEngineRequest` (U3 refactor); `readEngineOutcome` (review fixes); `ResultView` (U4).
- Produces:
  - `@/lib/engine/types`: `ConfirmedConditionSchema` / `ConfirmedCondition` (`DetectedCondition` with `evidence: string | null`), `WorkoutAnalysisResultSchema` / `WorkoutAnalysisResult` `{ original, suggested, unavailableEquipment, analyzed }`, `FeedbackAnalysisSchema` / `FeedbackAnalysis` `{ suggested, unavailableEquipment }`.
  - `@/lib/engine/pipeline`: `analyzeWorkout(provider, { input, situation, domain })`, `analyzeFeedback(provider, feedback, domain)`; `PipelineArgs` is now `{ original, confirmed, unavailableEquipment, profile, request, domain, onProgress? }`; `RefineArgs` adds `confirmed` and `unavailableEquipment`. Neither pipeline calls the analyzer any more; their first stage is `tailoring`.
  - `@/lib/quota`: `UsageKind = "analyze" | "tailor" | "refine"`; `QuotaStore.countSince(userId, kind, since)`.
  - `@/lib/api-schemas`: `AnalyzeBodySchema`, `AnalyzeFeedbackBodySchema`; `TailorBodySchema = { analysis: { original, unavailableEquipment }, confirmed, request }`; `RefineBodySchema` adds `confirmed`, `unavailableEquipment`.
  - `@/lib/engine-route`: `handleAnalyzeRequest(req, { schema, maxBodyChars, run })` → JSON.
  - `ConfirmConditions({ suggested, catalog, busy, onConfirm, onCancel })`; `TailorClient({ movementNames, equipmentOptions, catalog })`.
  - Eval cases accept `confirm` (the conditions the athlete would confirm); `mustDetect` grades the suggestions.

- [ ] **Step 1: Write the failing pipeline tests** — replace `tests/engine/pipeline.test.ts` with:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { getDomainData, type DomainData } from "@/lib/domain/repository";
import {
  EngineUnsafeError, analyzeFeedback, analyzeWorkout, runRefinePipeline, runTailorPipeline,
  type PipelineArgs, type ProgressStage,
} from "@/lib/engine/pipeline";
import { emptyProfile, emptyRequest, type ConfirmedCondition, type TailoringDraft } from "@/lib/engine/types";
import { FRAN_TEXT, component, fran, franDraft, sprint, toTailoringDraft } from "../fixtures/workouts";

let domain: DomainData;
beforeAll(async () => { domain = await getDomainData(); });

const shoulderToday: ConfirmedCondition = { key: "shoulder_impingement", side: "right", severity: "moderate", evidence: "me duele el hombro derecho" };
const pasteAnalysis = (conditions: unknown[] = [shoulderToday]) => ({ workout: franDraft(), conditions, unavailableEquipment: [] });

function safeDraft(): TailoringDraft {
  const d = toTailoringDraft(fran());
  d.blocks[0].components = [
    component("Kettlebell Goblet Squat", { reps: "21-15-9", loadKg: { male: 24, female: 16 } }),
    component("Ring Row", { reps: "21-15-9" }),
  ];
  d.changes = [{ blockIndex: 0, original: "Thruster", modified: "Kettlebell Goblet Squat", reason: "No overhead." }];
  return d;
}
const unsafeDraft = () => toTailoringDraft(fran()); // keeps Thruster and Pull-up

const run = (provider: FakeProvider, stages: ProgressStage[] = [], overrides: Partial<PipelineArgs> = {}) =>
  runTailorPipeline(provider, {
    original: fran(),
    confirmed: [shoulderToday],
    unavailableEquipment: [],
    profile: emptyProfile(),
    request: { ...emptyRequest(), situation: "me duele el hombro derecho" },
    domain,
    onProgress: (s) => stages.push(s),
    ...overrides,
  });

describe("analyzeWorkout", () => {
  it("suggests today's conditions without applying them, in one model call", async () => {
    const provider = new FakeProvider({ PasteAnalysis: pasteAnalysis() });
    const a = await analyzeWorkout(provider, { input: { kind: "paste", rawText: FRAN_TEXT }, situation: "me duele el hombro derecho", domain });
    expect(provider.calls).toHaveLength(1);
    expect(a.suggested).toEqual([shoulderToday]);
    expect(a.original.blocks[0].components.map((c) => c.canonical)).toEqual(["Thruster", "Pull-up"]);
    expect(a.analyzed).toBe(true);
  });

  it("analyzes a manual workout", async () => {
    const provider = new FakeProvider({ ManualAnalysis: { stimuli: [sprint], conditions: [], unavailableEquipment: [] } });
    const a = await analyzeWorkout(provider, {
      input: { kind: "manual", workout: { name: "Fran", blocks: [{
        title: "Fran", format: "for_time", scheme: "21-15-9 for time", timeDomainMinutes: 6, coachingNotes: null,
        components: franDraft().blocks[0].components,
      }] } },
      situation: "", domain,
    });
    expect(a.original.source).toBe("manual");
    expect(a.original.blocks[0].stimulus).toEqual(sprint);
    expect(a.suggested).toEqual([]);
  });
});

describe("analyzeFeedback", () => {
  it("suggests the feedback's conditions and missing equipment", async () => {
    const knee = { key: "knee_pain", side: "left", severity: "mild", evidence: "la rodilla también" };
    const provider = new FakeProvider({ SituationAnalysis: { conditions: [knee], unavailableEquipment: ["kettlebell"] } });
    expect(await analyzeFeedback(provider, "la rodilla también, y no hay kettlebell", domain)).toEqual({
      suggested: [knee], unavailableEquipment: ["kettlebell"],
    });
  });
});

describe("runTailorPipeline", () => {
  it("tailors and validates against the confirmed conditions in one model call", async () => {
    const provider = new FakeProvider({ TailoringResult: safeDraft() });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["tailoring", "validating"]);
    expect(provider.calls).toHaveLength(1);
    expect(r.conditions).toEqual([{ ...shoulderToday, source: "today" }]);
    expect(r.tailored.blocks[0].components.map((c) => c.canonical)).toEqual(["Kettlebell Goblet Squat", "Ring Row"]);
    expect(r.findings.filter((f) => f.severity === "violation")).toEqual([]);
    expect(r.feedbackHistory).toEqual([]);
    expect(r.model).toBe("fake");
  });

  it("the confirmed severity decides: mild keeps the Thruster with a caution, moderate fails closed", async () => {
    const mild = await run(new FakeProvider({ TailoringResult: unsafeDraft() }), [], { confirmed: [{ ...shoulderToday, severity: "mild" }] });
    expect(mild.findings).toContainEqual(expect.objectContaining({ kind: "caution_movement", movement: "Thruster", severity: "warning" }));
    await expect(run(new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) }))).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("applies a condition the athlete added (no evidence)", async () => {
    const provider = new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) });
    await expect(run(provider, [], {
      confirmed: [{ key: "no_hanging", side: null, severity: "moderate", evidence: null }],
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });

  it("retries once with the violations and returns the corrected result", async () => {
    const provider = new FakeProvider({ TailoringResult: sequence(unsafeDraft(), safeDraft()) });
    const stages: ProgressStage[] = [];
    const r = await run(provider, stages);
    expect(stages).toEqual(["tailoring", "validating", "retrying", "validating"]);
    expect(provider.calls[1].prompt).toContain("REJECTED BY THE SAFETY CHECK");
    expect(r.tailored.blocks[0].components[0].canonical).toBe("Kettlebell Goblet Squat");
  });

  it("returns non-safety violations that survive the retry as findings", async () => {
    const slow = () => {
      const d = safeDraft();
      d.blocks[0].timeDomainMinutes = 30;
      return d;
    };
    const r = await run(new FakeProvider({ TailoringResult: sequence(slow(), slow()) }), [], {
      request: { ...emptyRequest(), situation: "me duele el hombro derecho", timeCapMinutes: 10 },
    });
    expect(r.findings).toContainEqual(expect.objectContaining({ kind: "time_cap_exceeded", severity: "violation" }));
  });

  it("applies profile injuries even with nothing confirmed today", async () => {
    const profile = { ...emptyProfile(), injuries: [{ key: "no_hanging", side: null, severity: "moderate" as const, notes: "cast", since: null }] };
    await expect(run(new FakeProvider({ TailoringResult: sequence(unsafeDraft(), unsafeDraft()) }), [], {
      confirmed: [], profile, request: emptyRequest(),
    })).rejects.toBeInstanceOf(EngineUnsafeError);
  });
});

describe("runRefinePipeline", () => {
  it("re-tailors the original with the feedback and the newly confirmed conditions", async () => {
    const first = await run(new FakeProvider({ TailoringResult: safeDraft() }));
    const provider = new FakeProvider({
      TailoringResult: (() => {
        const d = safeDraft();
        d.blocks[0].components[0] = component("Dumbbell Goblet Squat", { reps: "15-12-9" });
        d.changes = [{ blockIndex: 0, original: "Thruster", modified: "Dumbbell Goblet Squat", reason: "No kettlebell today." }];
        return d;
      })(),
    });
    const stages: ProgressStage[] = [];
    const r = await runRefinePipeline(provider, {
      previous: first, feedback: "too heavy, and my knee hurts too",
      confirmed: [{ key: "knee_pain", side: "left", severity: "mild", evidence: "my knee hurts too" }],
      unavailableEquipment: ["kettlebell"],
      profile: emptyProfile(), request: emptyRequest(), domain, onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual(["tailoring", "validating"]);
    expect(provider.calls).toHaveLength(1);
    expect(r.original).toEqual(first.original);
    expect(r.conditions.map((c) => c.key)).toEqual(["shoulder_impingement", "knee_pain"]);
    expect(r.unavailableEquipment).toEqual(["kettlebell"]);
    expect(r.feedbackHistory).toEqual(["too heavy, and my knee hurts too"]);
    expect(provider.calls[0].prompt).toContain("PREVIOUS ATTEMPT");
    expect(provider.calls[0].prompt).toContain("- too heavy, and my knee hurts too");
  });

  it("re-applies profile injuries even if the client dropped them from the previous result", async () => {
    const first = await run(new FakeProvider({ TailoringResult: safeDraft() }));
    const tampered = { ...first, conditions: [] };
    const profile = { ...emptyProfile(), injuries: [{ key: "hand_tear", side: null, severity: "moderate" as const, notes: null, since: null }] };
    const r = await runRefinePipeline(new FakeProvider({ TailoringResult: safeDraft() }), {
      previous: tampered, feedback: "more volume", confirmed: [], unavailableEquipment: [],
      profile, request: emptyRequest(), domain,
    });
    expect(r.conditions.map((c) => c.key)).toEqual(["hand_tear"]);
  });
});
```

Run: `pnpm exec vitest run tests/engine/pipeline.test.ts` → FAIL (`analyzeWorkout` is not exported; `ConfirmedCondition` missing).

- [ ] **Step 2: Append the two-phase types to `src/lib/engine/types.ts`** (after `PipelineResultSchema`)

```ts
// ---- athlete-confirmed conditions (two-phase tailor) ----
// The analyzer only suggests today's conditions; the athlete confirms or corrects them before tailoring.
export const ConfirmedConditionSchema = DetectedConditionSchema.extend({
  evidence: z.string().nullable(), // null when the athlete added the condition
});
export type ConfirmedCondition = z.infer<typeof ConfirmedConditionSchema>;

export const WorkoutAnalysisResultSchema = z.object({
  original: StructuredWorkoutSchema,
  suggested: z.array(DetectedConditionSchema),
  unavailableEquipment: z.array(Equipment),
  analyzed: z.boolean(), // false = degraded to one raw block
});
export type WorkoutAnalysisResult = z.infer<typeof WorkoutAnalysisResultSchema>;

export const FeedbackAnalysisSchema = z.object({
  suggested: z.array(DetectedConditionSchema),
  unavailableEquipment: z.array(Equipment),
});
export type FeedbackAnalysis = z.infer<typeof FeedbackAnalysisSchema>;
```

- [ ] **Step 3: Let `activateConditions` take confirmed conditions** — in `src/lib/engine/conditions.ts` replace the type import and the signature:

```ts
import type { ConditionRef, ConfirmedCondition, ProfileInjury } from "./types";
```
```ts
/** base (profile or a previous result) ⊕ today's confirmed conditions; for the same key today's side/severity win. */
export function activateConditions(
  base: ConditionRef[], confirmed: ConfirmedCondition[], catalog: Contraindication[],
): ActivatedConditions {
  const merged = new Map<string, ConditionRef>();
  for (const r of base) merged.set(r.key, r);
  for (const d of confirmed) {
    merged.set(d.key, { key: d.key, side: d.side, severity: d.severity, source: "today", evidence: d.evidence });
  }
```
(the rest of the function is unchanged; `DetectedCondition` values still type-check because their `evidence` is a string).

- [ ] **Step 4: Split the pipeline in `src/lib/engine/pipeline.ts`**

Replace the type import block with:
```ts
import type {
  AthleteProfile, ConditionRef, ConfirmedCondition, FeedbackAnalysis, Finding, ManualWorkout, PipelineResult,
  StructuredWorkout, TailorRequest, TailoringResult, WorkoutAnalysisResult,
} from "./types";
```
Replace `PipelineArgs` and `RefineArgs` with:
```ts
export interface AnalyzeArgs {
  input: WorkoutInput;
  situation: string;
  domain: DomainData;
}

/** Phase 2 input: the phase-1 session plus the conditions the athlete confirmed. */
export interface PipelineArgs {
  original: StructuredWorkout;
  confirmed: ConfirmedCondition[];
  unavailableEquipment: Equipment[];
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}

export interface RefineArgs {
  previous: PipelineResult;
  feedback: string;
  confirmed: ConfirmedCondition[]; // conditions the feedback added, as the athlete confirmed them
  unavailableEquipment: Equipment[]; // equipment the feedback says is missing
  profile: AthleteProfile;
  request: TailorRequest;
  domain: DomainData;
  onProgress?: (stage: ProgressStage) => void;
}
```
Replace `runTailorPipeline` and `runRefinePipeline` with:
```ts
/** Phase 1: the session and today's SUGGESTED conditions; nothing is applied until the athlete confirms. */
export async function analyzeWorkout(provider: LlmProvider, args: AnalyzeArgs): Promise<WorkoutAnalysisResult> {
  const ctx = analyzeContext(args.domain);
  const a = args.input.kind === "paste"
    ? await analyzePaste(provider, args.input.rawText, args.situation, ctx)
    : await analyzeManual(provider, args.input.workout, args.situation, ctx);
  return { original: a.workout, suggested: a.conditions, unavailableEquipment: a.unavailableEquipment, analyzed: a.analyzed };
}

/** Refine phase 1: the conditions and missing equipment the feedback suggests. */
export async function analyzeFeedback(provider: LlmProvider, feedback: string, domain: DomainData): Promise<FeedbackAnalysis> {
  const s = await analyzeSituation(provider, feedback, analyzeContext(domain));
  return { suggested: s.conditions, unavailableEquipment: s.unavailableEquipment };
}

export async function runTailorPipeline(provider: LlmProvider, args: PipelineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  const { active, refs } = activateConditions(
    profileConditionRefs(args.profile.injuries), args.confirmed, args.domain.contraindications,
  );
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.original, active, refs, unavailable: args.unavailableEquipment,
    profile: args.profile, request: args.request, domain: args.domain, previousAttempt: null, progress,
  });
  return {
    original: args.original, conditions: refs, unavailableEquipment: args.unavailableEquipment,
    tailored: result, findings, feedbackHistory: [], model: provider.model,
  };
}

export async function runRefinePipeline(provider: LlmProvider, args: RefineArgs): Promise<PipelineResult> {
  const progress = args.onProgress ?? (() => {});
  // `previous` comes back from the client: the stored profile injuries are always re-applied.
  const { active, refs } = activateConditions(
    [...profileConditionRefs(args.profile.injuries), ...args.previous.conditions],
    args.confirmed,
    args.domain.contraindications,
  );
  const unavailable = [...new Set([...args.previous.unavailableEquipment, ...args.unavailableEquipment])];
  const feedbackHistory = [...args.previous.feedbackHistory, args.feedback];
  const { result, findings } = await tailorAndValidate(provider, {
    original: args.previous.original, active, refs, unavailable, profile: args.profile, request: args.request,
    domain: args.domain, previousAttempt: { result: args.previous.tailored, feedbackHistory }, progress,
  });
  return {
    original: args.previous.original, conditions: refs, unavailableEquipment: unavailable,
    tailored: result, findings, feedbackHistory, model: provider.model,
  };
}
```
`ProgressStage` keeps `"analyzing"`: the client shows it during phase 1.

Run: `pnpm exec vitest run tests/engine` → PASS.

- [ ] **Step 5: Count quota per kind** — failing test first. In `tests/lib/quota.test.ts` change the store's `countSince` and add a test:

```ts
    async countSince(userId, kind, since) { return rows.filter((r) => r.userId === userId && r.kind === kind && r.at >= since).length; },
```
```ts
  it("limits each kind separately, so one adaptation (analyze + tailor) counts once against each", async () => {
    const store = memoryStore();
    expect((await consumeQuota(store, "u1", "analyze", 1)).allowed).toBe(true);
    expect((await consumeQuota(store, "u1", "tailor", 1)).allowed).toBe(true);
    expect((await consumeQuota(store, "u1", "analyze", 1)).allowed).toBe(false);
  });
```
and in the first test replace the second call (`"refine"`) with `"tailor"` so it still exercises one kind up to its limit:
```ts
    expect(await consumeQuota(store, "u1", "tailor", 2)).toEqual({ allowed: true, used: 2, limit: 2 });
```
Run: `pnpm exec vitest run tests/lib/quota.test.ts` → FAIL (type error / count). Then in `src/lib/quota.ts`:
```ts
export type UsageKind = "analyze" | "tailor" | "refine";

export interface QuotaStore {
  countSince(userId: string, kind: UsageKind, since: Date): Promise<number>;
  record(userId: string, kind: UsageKind): Promise<void>;
}
```
```ts
/** Counts runs of this kind in the last 24 h; records this one only when it is allowed. */
export async function consumeQuota(
  store: QuotaStore, userId: string, kind: UsageKind, limit: number, now: Date = new Date(),
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const used = await store.countSince(userId, kind, new Date(now.getTime() - DAY_MS));
```
In `src/lib/quota-store.ts`:
```ts
  countSince: (userId, kind, since) => prisma.llmUsage.count({ where: { userId, kind, createdAt: { gte: since } } }),
```
In `prisma/schema.prisma` update the comment only (no migration): `kind      String // "analyze" | "tailor" | "refine"`.

Run: `pnpm exec vitest run tests/lib/quota.test.ts` → PASS.

- [ ] **Step 6: API bodies** — failing tests first. Replace `tests/lib/api-schemas.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { AnalyzeBodySchema, AnalyzeFeedbackBodySchema, RefineBodySchema, SaveBodySchema, TailorBodySchema } from "@/lib/api-schemas";
import { emptyRequest, type PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};
const shoulder = { key: "shoulder_impingement", side: "right", severity: "mild", evidence: "sore" };

describe("API bodies", () => {
  it("accepts a paste and a manual workout to analyze", () => {
    expect(AnalyzeBodySchema.safeParse({ input: { kind: "paste", rawText: "Fran" }, request: emptyRequest() }).success).toBe(true);
    expect(AnalyzeBodySchema.safeParse({
      input: { kind: "manual", workout: { name: null, blocks: [{ title: null, format: "amrap", scheme: null, timeDomainMinutes: 10, coachingNotes: null, components: [] }] } },
      request: emptyRequest(),
    }).success).toBe(true);
  });

  it("rejects an empty or oversized paste", () => {
    expect(AnalyzeBodySchema.safeParse({ input: { kind: "paste", rawText: "" }, request: emptyRequest() }).success).toBe(false);
    expect(AnalyzeBodySchema.safeParse({ input: { kind: "paste", rawText: "x".repeat(20001) }, request: emptyRequest() }).success).toBe(false);
  });

  it("tailors an analyzed session with the confirmed conditions, including athlete-added ones", () => {
    const body = (confirmed: unknown[]) => ({ analysis: { original: fran(), unavailableEquipment: [] }, confirmed, request: emptyRequest() });
    expect(TailorBodySchema.safeParse(body([shoulder, { key: "no_hanging", side: null, severity: "moderate", evidence: null }])).success).toBe(true);
    expect(TailorBodySchema.safeParse(body([{ ...shoulder, severity: "unbearable" }])).success).toBe(false);
    expect(TailorBodySchema.safeParse(body(Array.from({ length: 21 }, () => shoulder))).success).toBe(false);
  });

  it("requires feedback to analyze or refine", () => {
    expect(AnalyzeFeedbackBodySchema.safeParse({ feedback: "  " }).success).toBe(false);
    expect(AnalyzeFeedbackBodySchema.safeParse({ feedback: "too easy" }).success).toBe(true);
    const refine = (feedback: string) => ({ previous: result, feedback, confirmed: [], unavailableEquipment: [], request: emptyRequest() });
    expect(RefineBodySchema.safeParse(refine("")).success).toBe(false);
    expect(RefineBodySchema.safeParse(refine("too easy")).success).toBe(true);
  });

  it("saves a full pipeline result", () => {
    expect(SaveBodySchema.safeParse({ result, request: emptyRequest() }).success).toBe(true);
    expect(SaveBodySchema.safeParse({ result: { ...result, model: "" }, request: emptyRequest() }).success).toBe(false);
  });
});
```
Run → FAIL. Then in `src/lib/api-schemas.ts` replace the imports and the body schemas (keep the size constants and `WorkoutInputSchema`):
```ts
import { z } from "zod";
import { Equipment } from "@/lib/domain/types";
import {
  ConfirmedConditionSchema, ManualWorkoutSchema, PipelineResultSchema, TailorRequestSchema, WorkoutAnalysisResultSchema,
} from "@/lib/engine/types";
```
```ts
const feedback = z.string().trim().min(1).max(2000);
const confirmed = z.array(ConfirmedConditionSchema).max(20);

export const AnalyzeBodySchema = z.object({ input: WorkoutInputSchema, request: TailorRequestSchema });
export const AnalyzeFeedbackBodySchema = z.object({ feedback });
export const TailorBodySchema = z.object({
  analysis: WorkoutAnalysisResultSchema.pick({ original: true, unavailableEquipment: true }),
  confirmed,
  request: TailorRequestSchema,
});
export const RefineBodySchema = z.object({
  previous: PipelineResultSchema,
  feedback,
  confirmed,
  unavailableEquipment: z.array(Equipment),
  request: TailorRequestSchema,
});
export const SaveBodySchema = z.object({ result: PipelineResultSchema, request: TailorRequestSchema });
```
Run → PASS.

- [ ] **Step 7: Routes** — in `src/lib/engine-route.ts` split the preamble so both phases share it, and add the JSON analyze handler. Replace everything from `interface EngineRoute<T>` to the end of the file with:

```ts
interface RouteCheck<T> {
  schema: z.ZodType<T>;
  maxBodyChars: number;
  kind: UsageKind;
}

type Prepared<T> = { ok: true; userId: string; body: T; provider: LlmProvider } | { ok: false; response: Response };

/** Session, bounded body, validation, provider and quota: shared by every engine endpoint. */
async function prepare<T>(req: Request, check: RouteCheck<T>): Promise<Prepared<T>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, response: jsonError("unauthorized", 401) };
  const raw = await readJsonBody(req, check.maxBodyChars);
  if (!raw.ok) return { ok: false, response: jsonError(raw.code, raw.status) };
  const body = check.schema.safeParse(raw.value);
  if (!body.success) return { ok: false, response: jsonError("invalid_request", 400) };

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return { ok: false, response: jsonError("engine_unavailable", 503) };
  }
  const quota = await consumeQuota(prismaQuotaStore, userId, check.kind, dailyLimit());
  if (!quota.allowed) return { ok: false, response: jsonError("quota_exceeded", 429) };
  return { ok: true, userId, body: body.data, provider };
}

interface EngineRoute<T> extends RouteCheck<T> {
  run: (body: T, ctx: EngineContext) => Promise<PipelineResult>;
}

/** Phase 2 (tailor, refine): the NDJSON stream; unrecognized movements are queued after the result is sent. */
export async function handleEngineRequest<T>(req: Request, route: EngineRoute<T>): Promise<Response> {
  const p = await prepare(req, route);
  if (!p.ok) return p.response;
  const [profile, domain] = await Promise.all([loadProfile(p.userId), getDomainData()]);
  return engineStreamResponse(
    (onProgress) => route.run(p.body, { provider: p.provider, profile, domain, onProgress }),
    (result) => recordUnrecognized(prismaUnrecognizedStore, result),
  );
}

interface AnalyzeRoute<T, R> {
  schema: z.ZodType<T>;
  maxBodyChars: number;
  run: (body: T, ctx: { provider: LlmProvider; domain: DomainData }) => Promise<R>;
}

/** Phase 1 (analyze): one model call, plain JSON; counted as "analyze". Never leaks exception text. */
export async function handleAnalyzeRequest<T, R>(req: Request, route: AnalyzeRoute<T, R>): Promise<Response> {
  const p = await prepare(req, { schema: route.schema, maxBodyChars: route.maxBodyChars, kind: "analyze" });
  if (!p.ok) return p.response;
  try {
    return NextResponse.json(await route.run(p.body, { provider: p.provider, domain: await getDomainData() }));
  } catch (e) {
    console.error("analysis failed", e);
    return jsonError("engine_failed", 502);
  }
}
```
and add `import { NextResponse } from "next/server";` to its imports. Update its doc comment to "The shared shape of the engine endpoints".

Create `src/app/api/tailor/analyze/route.ts`:
```ts
import { AnalyzeBodySchema, MAX_TAILOR_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeWorkout } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeBodySchema,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    run: (body, { provider, domain }) =>
      analyzeWorkout(provider, { input: body.input, situation: body.request.situation, domain }),
  });
}
```
Create `src/app/api/tailor/refine/analyze/route.ts`:
```ts
import { AnalyzeFeedbackBodySchema, MAX_TAILOR_BODY_CHARS } from "@/lib/api-schemas";
import { analyzeFeedback } from "@/lib/engine/pipeline";
import { handleAnalyzeRequest } from "@/lib/engine-route";

export const maxDuration = 60;

export function POST(req: Request) {
  return handleAnalyzeRequest(req, {
    schema: AnalyzeFeedbackBodySchema,
    maxBodyChars: MAX_TAILOR_BODY_CHARS,
    run: (body, { provider, domain }) => analyzeFeedback(provider, body.feedback, domain),
  });
}
```
Replace `src/app/api/tailor/route.ts` (the body now carries the analyzed session, so it gets the larger cap):
```ts
import { MAX_RESULT_BODY_CHARS, TailorBodySchema } from "@/lib/api-schemas";
import { runTailorPipeline } from "@/lib/engine/pipeline";
import { handleEngineRequest } from "@/lib/engine-route";

export const maxDuration = 120;

export function POST(req: Request) {
  return handleEngineRequest(req, {
    schema: TailorBodySchema,
    maxBodyChars: MAX_RESULT_BODY_CHARS,
    kind: "tailor",
    run: (body, { provider, ...ctx }) => runTailorPipeline(provider, {
      original: body.analysis.original, unavailableEquipment: body.analysis.unavailableEquipment,
      confirmed: body.confirmed, request: body.request, ...ctx,
    }),
  });
}
```
In `src/app/api/tailor/refine/route.ts` replace the `run` with:
```ts
    run: (body, { provider, ...ctx }) => runRefinePipeline(provider, {
      previous: body.previous, feedback: body.feedback, confirmed: body.confirmed,
      unavailableEquipment: body.unavailableEquipment, request: body.request, ...ctx,
    }),
```
Run: `pnpm exec tsc --noEmit` → the only errors left are in `scripts/eval.ts`, `src/lib/eval/grade.ts` and `src/app/tailor/*` (next steps).

- [ ] **Step 8: Create `src/app/tailor/ConfirmConditions.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Severity, Side } from "@/lib/domain/types";
import type { ConfirmedCondition } from "@/lib/engine/types";

export interface CatalogEntry {
  key: string;
  label: string;
  kind: string; // "injury" | "limitation" | "condition"
}

interface Props {
  suggested: ConfirmedCondition[];
  catalog: CatalogEntry[];
  busy: boolean;
  onConfirm: (confirmed: ConfirmedCondition[]) => void;
  onCancel: () => void;
}

const SEVERITY_TEXT: Record<Severity, string> = {
  mild: "Mild: a niggle, you can train almost normally",
  moderate: "Moderate: pain that limits some movements",
  acute: "Acute: a recent injury, sharp pain, or told to rest",
};

const field = "rounded border px-2 py-1 text-sm";

/** The athlete confirms what the analyzer read: severity decides what is allowed, so it is never applied unseen. */
export function ConfirmConditions({ suggested, catalog, busy, onConfirm, onCancel }: Props) {
  const [items, setItems] = useState<ConfirmedCondition[]>(suggested);
  const [adding, setAdding] = useState("");
  const entry = (key: string) => catalog.find((c) => c.key === key);
  const update = (i: number, patch: Partial<ConfirmedCondition>) =>
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="flex flex-col gap-3 rounded border border-amber-300 bg-amber-50 p-3" aria-labelledby="confirm-heading">
      <h2 id="confirm-heading" className="font-semibold">Is this right?</h2>
      <p className="text-sm">We read this from what you wrote. Check the side and how bad it is: it decides what you can do today.</p>

      {items.map((c, i) => (
        <div key={c.key} className="flex flex-col gap-2 rounded border bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{entry(c.key)?.label ?? c.key}</span>
            <button type="button" className="text-sm underline" onClick={() => setItems(items.filter((_, j) => j !== i))}>remove</button>
          </div>
          {c.evidence && <p className="text-xs text-neutral-600">&ldquo;{c.evidence}&rdquo;</p>}
          {entry(c.key)?.kind === "injury" ? (
            <>
              <label className="flex items-center gap-2 text-sm">Side
                <select className={field} value={c.side ?? ""} onChange={(e) => update(i, { side: e.target.value === "" ? null : Side.parse(e.target.value) })}>
                  <option value="">not specific</option>
                  {Side.options.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="sr-only">How bad is it?</legend>
                {Severity.options.map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input type="radio" name={`severity-${c.key}`} checked={c.severity === s} onChange={() => update(i, { severity: s })} />
                    {SEVERITY_TEXT[s]}
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <span className="text-sm text-neutral-600">always applies</span>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <select className={field} value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">add something we missed…</option>
          {catalog.filter((c) => !items.some((x) => x.key === c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" className="rounded border px-3 py-1 text-sm" disabled={!adding} onClick={() => {
          setItems([...items, { key: adding, side: null, severity: "moderate", evidence: null }]);
          setAdding("");
        }}>Add</button>
      </div>

      <div className="flex gap-2">
        <button type="button" className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onConfirm(items)}>
          Continue
        </button>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={onCancel}>Back</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Two-phase `TailorClient`**

In `src/app/tailor/page.tsx` pass the catalog instead of the labels:
```tsx
      <TailorClient
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
        catalog={domain.contraindications.map((c) => ({ key: c.key, label: c.label, kind: c.kind }))}
      />
```
In `src/app/tailor/TailorClient.tsx`:

Imports and props:
```tsx
import { useState } from "react";
import type { Equipment } from "@/lib/domain/types";
import type { ProgressStage } from "@/lib/engine/pipeline";
import {
  ManualWorkoutSchema,
  type ConfirmedCondition, type FeedbackAnalysis, type ManualWorkout, type PipelineResult, type TailorRequest,
  type WorkoutAnalysisResult,
} from "@/lib/engine/types";
import { readEngineOutcome } from "@/lib/engine-events";
import { ConfirmConditions, type CatalogEntry } from "./ConfirmConditions";
import { ManualEntryForm, emptyManualWorkout } from "./ManualEntryForm";
import { ResultView } from "./ResultView";

interface Props {
  movementNames: string[];
  equipmentOptions: Equipment[];
  catalog: CatalogEntry[];
}

// What phase 2 needs once the athlete has confirmed today's conditions.
type Pending =
  | { kind: "tailor"; analysis: WorkoutAnalysisResult; request: TailorRequest; suggested: ConfirmedCondition[] }
  | { kind: "refine"; previous: PipelineResult; feedback: string; unavailableEquipment: Equipment[]; request: TailorRequest; suggested: ConfirmedCondition[] };
```
In the component, replace the signature line and add state:
```tsx
export function TailorClient({ movementNames, equipmentOptions, catalog }: Props) {
  const conditionLabels = Object.fromEntries(catalog.map((c) => [c.key, c.label]));
```
```tsx
  const [pending, setPending] = useState<Pending | null>(null);
```
Replace `runEngine`, `submit` and `refine` with:
```tsx
  /** Phase-1 call: JSON or a shown error code. */
  async function postJson<T>(url: string, body: unknown): Promise<T | null> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) return (await res.json()) as T;
      const { error: code } = await res.json().catch(() => ({ error: "engine_failed" }));
      setError(ERROR_TEXT[code] ?? ERROR_TEXT.engine_failed);
    } catch {
      setError(ERROR_TEXT.engine_failed);
    }
    return null;
  }

  // The request is stored only with the result it produced, so Save always persists a matching pair.
  async function runEngine(url: string, body: unknown, req: TailorRequest) {
    setError(null);
    setSaved(false);
    setStage("tailoring");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const { error: code } = await res.json().catch(() => ({ error: "engine_failed" }));
        setError(ERROR_TEXT[code] ?? ERROR_TEXT.engine_failed);
        return;
      }
      const outcome = await readEngineOutcome(res, setStage);
      if (outcome.kind === "result") {
        setResult(outcome.result);
        setRequest(req);
        setFeedback("");
      } else setError(ERROR_TEXT[outcome.error]);
    } catch {
      setError(ERROR_TEXT.engine_failed);
    } finally {
      setStage(null);
    }
  }

  /** Phase 2 with the conditions the athlete confirmed (none when nothing was suggested). */
  async function proceed(p: Pending, confirmed: ConfirmedCondition[]) {
    setPending(null);
    if (p.kind === "tailor") {
      const { original, unavailableEquipment } = p.analysis;
      await runEngine("/api/tailor", { analysis: { original, unavailableEquipment }, confirmed, request: p.request }, p.request);
    } else {
      await runEngine("/api/tailor/refine", {
        previous: p.previous, feedback: p.feedback, confirmed, unavailableEquipment: p.unavailableEquipment, request: p.request,
      }, p.request);
    }
  }

  /** Confirmation only when the analyzer suggested a condition; otherwise phase 2 starts at once. */
  async function confirmOrProceed(p: Pending) {
    if (p.suggested.length > 0) {
      setStage(null);
      setPending(p);
    } else await proceed(p, []);
  }

  async function submit() {
    const req = buildRequest();
    let input;
    if (mode === "paste") {
      if (!rawText.trim()) return setError("Paste a workout first.");
      input = { kind: "paste", rawText };
    } else {
      const parsed = ManualWorkoutSchema.safeParse(manual);
      if (!parsed.success) return setError("Give every movement a name.");
      input = { kind: "manual", workout: parsed.data };
    }
    // A new workout replaces the old result even if it fails: never leave a stale result to save.
    setResult(null);
    setRequest(null);
    setPending(null);
    setError(null);
    setStage("analyzing");
    const analysis = await postJson<WorkoutAnalysisResult>("/api/tailor/analyze", { input, request: req });
    if (!analysis) return setStage(null);
    await confirmOrProceed({ kind: "tailor", analysis, request: req, suggested: analysis.suggested });
  }

  async function refine() {
    if (!result || !feedback.trim()) return;
    // Refine with the form as it is now (a time cap or equipment set after the first run counts).
    const req = buildRequest();
    const text = feedback.trim();
    setError(null);
    setStage("analyzing");
    const a = await postJson<FeedbackAnalysis>("/api/tailor/refine/analyze", { feedback: text });
    if (!a) return setStage(null);
    await confirmOrProceed({
      kind: "refine", previous: result, feedback: text, unavailableEquipment: a.unavailableEquipment, request: req, suggested: a.suggested,
    });
  }
```
Change the two buttons' handlers to `onClick={() => void submit()}` and `onClick={() => void refine()}`, and render the confirmation right after the error line:
```tsx
      {pending && (
        <ConfirmConditions key={pending.kind + pending.suggested.map((s) => s.key).join(",")}
          suggested={pending.suggested} catalog={catalog} busy={busy}
          onConfirm={(confirmed) => void proceed(pending, confirmed)} onCancel={() => setPending(null)} />
      )}
```

Run: `pnpm exec tsc --noEmit`, `pnpm lint` → only the eval errors remain.

- [ ] **Step 10: Eval plays the athlete** — failing test first. Append to `tests/eval/grade.test.ts` inside `describe("eval grading")`:

```ts
  it("grades detection on the suggestions and accepts the conditions a case confirms", () => {
    const c = EvalCaseSchema.parse({
      id: "confirm", description: "x", input: { kind: "paste", rawText: "x" },
      confirm: [{ key: "shoulder_impingement", side: "right", severity: "moderate", evidence: null }],
      expect: { mustDetect: ["shoulder_impingement"] },
    });
    expect(resolveCase(c).confirm).toEqual([{ key: "shoulder_impingement", side: "right", severity: "moderate", evidence: null }]);
    expect(gradeCase(c, { kind: "result", result: result(), suggested: [] }).failures).toEqual(["did not detect shoulder_impingement"]);
    expect(gradeCase(c, { kind: "result", result: result(), suggested: ["shoulder_impingement"] }).passed).toBe(true);
  });
```
and in the defaults test add `expect(resolveCase(c).confirm).toBeNull();`.
Run → FAIL. Then in `src/lib/eval/grade.ts`:
- import `ConfirmedConditionSchema` and `type ConfirmedCondition` from `@/lib/engine/types`;
- add to `EvalCaseSchema` (after `request`):
```ts
  // The conditions the athlete would confirm; null = accept the analyzer's suggestions as read.
  confirm: z.array(ConfirmedConditionSchema).nullable().default(null),
```
- `EvalOutcome`'s result variant becomes `{ kind: "result"; result: PipelineResult; suggested?: string[] }` (the suggested condition keys);
- `resolveCase` returns `confirm: c.confirm` as well (`confirm: ConfirmedCondition[] | null` in its return type);
- in `gradeCase` replace the `detected` line with:
```ts
  // Detection is the analyzer's job: graded on its suggestions, whatever the athlete confirmed.
  const detected = new Set(outcome.suggested ?? r.conditions.map((x) => x.key));
```
In `scripts/eval.ts` import `analyzeWorkout` and replace the `try` body with:
```ts
      const { input, profile, request, confirm } = resolveCase(c);
      const analysis = await analyzeWorkout(provider, { input, situation: request.situation, domain });
      const result = await runTailorPipeline(provider, {
        original: analysis.original, confirmed: confirm ?? analysis.suggested,
        unavailableEquipment: analysis.unavailableEquipment, profile, request, domain,
      });
      outcome = { kind: "result", result, suggested: analysis.suggested.map((s) => s.key) };
```
Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

- [ ] **Step 11: Eval regression and severity pinning**

Run `pnpm eval` → 14/14 as before (the harness confirms the suggestions as read, so behavior is unchanged). Then pin the severity of the two shoulder cases so they grade the tailor, not the analyzer's reading: add to `evals/cases/01-fran-shoulder-today.json` and `evals/cases/13-fran-shoulder-mild-knee-dumbbells.json`
```json
  "confirm": [{ "key": "shoulder_impingement", "side": "right", "severity": "moderate", "evidence": null }],
```
and rerun both → PASS.

- [ ] **Step 12: Manual check** (signed in, `pnpm dev`, 375 px)

1. Paste Fran, situation "sore right shoulder", Tailor → "Is this right?" shows Shoulder impingement with the evidence, side right and a pre-selected severity. Pick **Moderate**, Continue → no Thruster, no overhead press.
2. Same paste, pick **Mild** → a caution badge on any overhead work.
3. Remove the condition and Continue → the result lists no shoulder condition.
4. Add "Unable to hang from a bar or rings" from the select → shows "always applies"; the result has no pull-ups.
5. Empty situation → no confirmation step; the result appears directly.
6. Refine "my left knee hurts too" → a confirmation for knee pain; Continue → the result keeps the shoulder and adds the knee.
7. `LlmUsage` gained one `analyze` and one `tailor` (or `refine`) row per run.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: athlete-confirmed conditions — analyze, confirm, then tailor"
```

---

### Task U5: Manual structured entry

**Files:**
- Modify: `src/app/tailor/ManualEntryForm.tsx` (replace the stub component)

**Interfaces:**
- Consumes: `BlockFormat`, `ComponentDraft`, `ManualBlock`, `ManualWorkout` (E1).
- Produces: the full `ManualEntryForm`; `emptyComponent`, `emptyBlock`, `emptyManualWorkout` keep their U4 signatures.

- [ ] **Step 1: Replace `ManualEntryForm` in `src/app/tailor/ManualEntryForm.tsx`**

Keep the three `empty*` helpers and the `Props` interface from U4; add `BlockFormat` to the import (`import { BlockFormat, type ComponentDraft, type ManualBlock, type ManualWorkout } from "@/lib/engine/types";`) and replace the stub function with:

```tsx
const field = "rounded border px-2 py-1 text-sm";
const textOrNull = (v: string) => (v.trim() === "" ? null : v);
const numberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const repsValue = (v: string): ComponentDraft["reps"] => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

export function ManualEntryForm({ value, onChange, movementNames }: Props) {
  const setBlock = (i: number, patch: Partial<ManualBlock>) =>
    onChange({ ...value, blocks: value.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setComponent = (bi: number, ci: number, patch: Partial<ComponentDraft>) =>
    setBlock(bi, { components: value.blocks[bi].components.map((c, j) => (j === ci ? { ...c, ...patch } : c)) });

  return (
    <div className="flex flex-col gap-3">
      <datalist id="manual-movement-names">{movementNames.map((n) => <option key={n} value={n} />)}</datalist>
      <input className={field} placeholder="Session name (optional)" value={value.name ?? ""}
        onChange={(e) => onChange({ ...value, name: textOrNull(e.target.value) })} />

      {value.blocks.map((b, bi) => (
        <div key={bi} className="flex flex-col gap-2 rounded border p-3">
          <div className="flex flex-wrap gap-2">
            <input className={field} placeholder={`Block ${bi + 1} title`} value={b.title ?? ""}
              onChange={(e) => setBlock(bi, { title: textOrNull(e.target.value) })} />
            <select className={field} value={b.format} onChange={(e) => setBlock(bi, { format: BlockFormat.parse(e.target.value) })}>
              {BlockFormat.options.map((f) => <option key={f} value={f}>{f.replaceAll("_", " ")}</option>)}
            </select>
            <input className={field} placeholder="scheme, e.g. AMRAP 12" value={b.scheme ?? ""}
              onChange={(e) => setBlock(bi, { scheme: textOrNull(e.target.value) })} />
            <input className={`${field} w-24`} type="number" min={0} placeholder="min" value={b.timeDomainMinutes ?? ""}
              onChange={(e) => setBlock(bi, { timeDomainMinutes: numberOrNull(e.target.value) })} />
          </div>

          {b.components.map((c, ci) => (
            <div key={ci} className="flex flex-wrap gap-2">
              <input className={`${field} grow`} list="manual-movement-names" placeholder="movement" value={c.movement}
                onChange={(e) => setComponent(bi, ci, { movement: e.target.value })} />
              <input className={`${field} w-20`} placeholder="reps" value={c.reps ?? ""}
                onChange={(e) => setComponent(bi, ci, { reps: repsValue(e.target.value) })} />
              <input className={`${field} w-28`} placeholder="load" value={c.load ?? ""}
                onChange={(e) => setComponent(bi, ci, { load: textOrNull(e.target.value) })} />
              <input className={`${field} w-20`} type="number" min={0} placeholder="m" value={c.distanceMeters ?? ""}
                onChange={(e) => setComponent(bi, ci, { distanceMeters: numberOrNull(e.target.value) })} />
              <input className={`${field} w-20`} type="number" min={0} placeholder="cal" value={c.calories ?? ""}
                onChange={(e) => setComponent(bi, ci, { calories: numberOrNull(e.target.value) })} />
              <button type="button" className="text-sm underline"
                onClick={() => setBlock(bi, { components: b.components.filter((_, j) => j !== ci) })}>remove</button>
            </div>
          ))}

          <textarea className={field} placeholder="Coaching notes (tempo, intensity, scaling)" value={b.coachingNotes ?? ""}
            onChange={(e) => setBlock(bi, { coachingNotes: textOrNull(e.target.value) })} />
          <div className="flex gap-3 text-sm">
            <button type="button" className="underline" onClick={() => setBlock(bi, { components: [...b.components, emptyComponent()] })}>
              Add movement
            </button>
            {value.blocks.length > 1 && (
              <button type="button" className="underline"
                onClick={() => onChange({ ...value, blocks: value.blocks.filter((_, j) => j !== bi) })}>Remove block</button>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="w-fit rounded border px-3 py-1 text-sm"
        onClick={() => onChange({ ...value, blocks: [...value.blocks, emptyBlock()] })}>Add block</button>
    </div>
  );
}
```

- [ ] **Step 2: Manual check**

`/tailor` → "Enter manually": one strength block (Back Squat, 5x5, 100 kg) and one AMRAP block (T2B 10, Burpee 10). Submit with "no pull-up bar today". Expected: the original shows both blocks with a stimulus chip each; the tailored version has no Toes-to-Bar. Leaving a movement name empty shows "Give every movement a name." without calling the API.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

```bash
git add -A
git commit -m "feat: manual structured workout entry"
```

---

### Task U6: History page

**Files:**
- Create: `src/app/history/page.tsx`

**Interfaces:**
- Consumes: `prisma` (S1), `getUserId` (S2), `WorkoutView` (U4), `StructuredWorkoutSchema`, `TailoringResultSchema` (E1).

- [ ] **Step 1: Implement `src/app/history/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { WorkoutView } from "@/components/WorkoutView";
import { prisma } from "@/lib/db";
import { StructuredWorkoutSchema, TailoringResultSchema } from "@/lib/engine/types";
import { getUserId } from "@/lib/session";

export default async function HistoryPage() {
  const userId = await getUserId();
  if (!userId) redirect("/signin");
  const rows = await prisma.tailoredWorkout.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });

  if (rows.length === 0) {
    return <p>Nothing saved yet. <Link className="underline" href="/tailor">Tailor a workout</Link>.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">History</h1>
      {rows.map((row) => {
        const tailored = TailoringResultSchema.safeParse(row.tailored);
        const original = StructuredWorkoutSchema.safeParse(row.original);
        const feedback = z.array(z.string()).safeParse(row.feedbackHistory);
        const title = (tailored.success && tailored.data.name) || (original.success && original.data.name) || "Workout";
        return (
          <details key={row.id} className="rounded border p-3">
            <summary className="cursor-pointer">
              <span className="font-medium">{title}</span>{" "}
              <span className="text-sm text-neutral-500">{row.createdAt.toLocaleDateString()}</span>
            </summary>
            {tailored.success ? (
              <div className="mt-3 flex flex-col gap-3">
                <WorkoutView heading="Tailored" name={null} blocks={tailored.data.blocks} />
                <p className="text-sm">{tailored.data.rationale}</p>
                {tailored.data.changes.length > 0 && (
                  <ul className="list-disc pl-5 text-sm">
                    {tailored.data.changes.map((c, i) => <li key={i}>{c.original} → {c.modified}: {c.reason}</li>)}
                  </ul>
                )}
                {feedback.success && feedback.data.length > 0 && (
                  <p className="text-xs text-neutral-500">Refined with: {feedback.data.join(" · ")}</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-red-700">This entry could not be read.</p>
            )}
          </details>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Manual check**

After saving a result in U4, `/history` lists it; expanding it shows the tailored blocks, the changes and the refine feedback.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → clean.

```bash
git add -A
git commit -m "feat: history of saved tailored workouts"
```

---

## Phase F — Final

### Task F1: README, deployment notes and full verification

**Files:**
- Modify: `README.md` (replace the create-next-app boilerplate), `docs/plans/training-tailor-engine-v1-plan.md` (Status), `.env.example` (final check)

- [ ] **Step 1: Rewrite `README.md`** with these sections, each short and concrete:
  1. **What it is** — one paragraph from the spec's *Problem*.
  2. **Prerequisites** — Node 20+, pnpm, a Neon project with a `dev` branch for local work, a Gemini API key, a Google OAuth client.
  3. **Setup** — `pnpm install` (runs `prisma generate`), copy `.env.example` to `.env` and fill it (`DATABASE_URL` = pooled and `DIRECT_URL` = direct connection string of the Neon `dev` branch), `pnpm db:migrate`, `pnpm dev`. No seed step: domain data ships in `data/`.
  4. **Commands** — `pnpm test` (deterministic, no network/DB), `pnpm eval [caseId]`, `pnpm coverage`, `pnpm lint`, `pnpm build`, `pnpm db:migrate`, `pnpm db:deploy`, `pnpm db:studio`.
  5. **Architecture** — the pipeline diagram from the spec and the boundary rule.
  6. **Domain data** — where it lives, that it is edited through scripts using `scripts/lib/domain-json.mjs`, and that `tests/domain` guards it.
  7. **Safety** — fail-closed validation; not medical advice.
  8. **Private corpus** — `data/corpus/` and `reports/` are gitignored because the repo is public.
  9. **Deploy (Vercel + Neon)** — use the Neon `production` branch; set every `.env.example` variable in Vercel (with `DATABASE_URL` / `DIRECT_URL` = the `production` branch's pooled / direct connection strings and `BETTER_AUTH_URL` = the production URL); add `https://<domain>/api/auth/callback/google` to the Google client; set the build command to `pnpm db:deploy && pnpm build`.

- [ ] **Step 2: Check `.env.example`** lists exactly: `DATABASE_URL`, `DIRECT_URL`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DAILY_ENGINE_LIMIT` — and no `AUTH_SECRET` or `EMAIL_*` leftovers.

- [ ] **Step 3: Full verification**

```bash
pnpm test
pnpm lint
pnpm build
pnpm eval
```
Expected: tests pass with no DB or key; lint clean; build succeeds with no type errors; eval meets the E9 target (≥ 9/10, no `contraindicated_movement` violation).

- [ ] **Step 4: End-to-end manual smoke (phone viewport)**

Sign in with Google → fill the profile (an injury with side and severity, equipment, a benchmark) → tailor a pasted workout with a pain stated today → confirm contraindicated movements are gone and cautions are badged → refine ("too easy") → save → see it in history. Then: a manual entry, a two-day "missed days" paste with a 60-min cap, and "no rower today".

- [ ] **Step 5: Update this plan's Status section** to "v1 complete" with the final test count, eval pass rate and model.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: README, deployment notes and v1 verification"
```

---

## Self-review (coverage against spec revision 2)

| Spec requirement | Task |
|---|---|
| Enforced safety: deterministic validation, one retry, fail-closed | E7, E8 |
| Movement-name resolution (exact, alias, normalized, singular) | D5, E4 |
| Today's situation activates contraindications; stated pain never ignored | E4 (fallback), E5, E8 |
| Structured per-block stimulus profile | D4, E1, E4, E7 |
| Tiered (`avoid`/`caution`), severity-aware contraindications; limitations/conditions | D1, D2 |
| Laterality (`unilateral`, healthy side only, never axial) | D1, D2 |
| Low-load stresses; grip/abdominals sites; supine/prone positions | D1, D2 |
| Strict vs kipping rows; known-gap movements; corpus-driven coverage ≥ 95 % | D3, E10 |
| Effort and implement-load conversions | D4, E6 |
| Deterministic candidate generator (substitutes → pattern fallback ranking) | E5 |
| Combinable constraints (situation, time cap, target movement, equipment today) | E1, E6, U4 |
| Missed days (`day` on blocks, merge, `sourceBlocks`, `droppedBlocks`) | E1, E4, E6, E7 |
| Refine loop (situation analysis of feedback, feedback history, profile re-applied) | E8, U3, U4 |
| Provider abstraction, validation retry, pinned Gemini model | E2, E3 |
| Two LLM calls per run (parse+classify merged), progress stream, `maxDuration` | E4, E8, U2, U3 |
| Evaluation harness and coverage report | E9 |
| Google OAuth via Better Auth; proxy page protection; API 401s | S2, U1, U3 |
| Prisma migrations; profile document; saved results; quota ledger + 429 | S1, U2, U3 |
| Save exactly what was reviewed | U3 |
| Structured profile (sex, scaling level, injuries with side/severity, benchmarks, equipment, goals, availability) | E1, U1 |
| Phone-first UI; disclaimer; caution badges | S2, U4, U5, U6 |
| Public repo: corpus and reports gitignored | E9, E10 |
| Hosting on Vercel + Neon | F1 |

## Open follow-ups (not blocking v1)

- **Domain data to DB (Phase C):** when coaches edit domain data at runtime, move it behind `repository.ts` into Postgres — nothing else changes.
- **Refine history:** only the saved result's feedback history is kept; persisting every attempt is a follow-up.
- **Quota race:** two simultaneous requests can both pass the count; acceptable at v1 scale (a transaction or advisory lock fixes it).
- **Benchmark-driven loads:** `percent1RM` × 1RM benchmarks could be computed deterministically instead of by the model once eval shows load errors.
