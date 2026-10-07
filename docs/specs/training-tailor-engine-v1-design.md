# Training Tailor — v1 Design (Engine + Athlete Self-Serve)

> Revision 2 (2026-10-02). Supersedes revision 1. Changes: the domain layer now
> **enforces** safety (deterministic validation of the LLM output, fail-closed),
> movement-name resolution is core, today's situation activates contraindications,
> stimulus is a structured per-block profile, contraindications are tiered
> (`avoid` / `caution`) and severity-aware, constraints combine, the domain catalog
> gains laterality, low-load stresses, new sites/positions, strict variants and
> effort/load conversions, an evaluation harness is part of v1, auth is Google
> OAuth via Better Auth, and hosting is decided.
>
> Amendment U4c (2026-10-07): today's pain and limits are read as **restrictions** in the
> athlete's own scope (named movements, named kinds of load, or a painful site), not as
> severity-graded catalog injuries. Only a site with nothing named, or a replacement that
> loads the painful site the same way, asks the athlete one question; everything else
> tailors at once. This replaces the confirmation of today's conditions (U4b).
>
> Amendment (2026-10-07): structured manual entry is dropped. Coaches publish workouts as
> free text, so the paste is the only ingestion path (task U5 cancelled).

## Problem

Amateur and competitive functional fitness athletes follow standardized, non-individualized
training templates (e.g., Mayhem, Training Think Tank). When an athlete faces a
physical limitation (injury/pain), a time constraint, a missed training day, missing
equipment, or wants to bias work toward a specific weakness, they often don't know how
to scale or modify the workout correctly — risking loss of the intended **training
stimulus** or further injury.

Training Tailor provides **deep individualization**: given a workout and the athlete's
current context, it produces a modified version that honors the original training
intent — and that is **verifiably** safe against the athlete's stated injuries and
limitations.

## Scope

The full product vision has three sub-systems:

- **A. Modification engine** — workout + athlete profile + today's situation →
  tailored workout with rationale. The novel, hard, valuable core. LLM-driven,
  domain-enforced.
- **B. Athlete-side essentials** — profile management + ingestion (free-text paste, as
  coaches publish it). Needed to run the engine end-to-end.
- **C. Coach/program side** — coaches author programs, schedule daily workouts,
  athletes link to a program and fetch "today's workout." Standard multi-user SaaS.
  **Not** where the individualization magic lives.

**v1 scope = A + B** (athlete self-serve). **C is a later phase** that plugs into the
same engine.

### v1 must handle (any combination, in one request)
- Physical limitation (injury/pain, stated in the profile or today) — modify around it,
  preserve stimulus, never prescribe a contraindicated movement
- Time constraint — condense while keeping each block's key stimulus
- Missed days — the paste may span several days; merge/prioritize into one session
  that fits today
- Missing equipment today — substitute while preserving stimulus
- Movement-improvement goal — bias the workout toward a chosen weakness
- Nothing special — pass-through or light personalization to benchmarks/scaling level

## Decisions (locked)

| Area | Decision |
|------|----------|
| Platform | Responsive web app, **phone-first** (gym use on phone via browser) |
| Stack | **Next.js 16 + TypeScript** (App Router), Tailwind 4, pnpm, Vitest, Zod 4 |
| Engine approach | **LLM + domain layer that grounds the prompt AND validates the output.** The LLM proposes; deterministic code decides what is allowed. |
| AI provider | **Gemini** via `@google/genai`, behind a provider-agnostic `LlmProvider` interface (server-side only). Model **pinned** through `GEMINI_MODEL` (default `gemini-3.8-flash`); never a `-latest` alias, so behavior changes only on an explicit upgrade. |
| Auth | **Google OAuth** via **Better Auth** (`better-auth`, Prisma adapter, database sessions). Route protection in Next 16 `src/proxy.ts` (Node runtime) for pages; API routes check the session themselves and return 401. |
| User data | **Postgres via Prisma 7** (driver adapter `@prisma/adapter-pg`), schema evolved with **`prisma migrate`** (no `db push` once v2 lands). |
| Domain data | **Versioned JSON in the repo** (`data/`), Zod-validated at load, accessed only through `src/lib/domain/repository.ts`. Moves to the DB in Phase C behind the same interface. |
| Ingestion (v1) | Free-text paste (LLM analysis) only: coaches publish workouts as free text. |
| Hosting | **Vercel** (Fluid compute; engine routes declare `maxDuration = 120`) + **Neon** Postgres. |
| Cost control | Per-user daily quota on engine calls (`DAILY_ENGINE_LIMIT`, default 30, counted per kind: analyze, tailor, refine), enforced server-side. |
| Repo visibility | The GitHub repo is **public**: real (often paid) programming used for coverage/evaluation lives in a **gitignored** `data/corpus/`; committed eval cases are synthetic or public benchmarks. |

## Architecture

```
Browser (phone)
  │  pasted workout + today's situation
  ▼
Next.js route handlers (auth check, quota)
  POST /api/tailor/analyze   → JSON analysis + restrictions + clarifying questions
  (only when there are questions: the athlete answers them)
  POST /api/tailor           → NDJSON progress stream → result
  ▼
tailor-service ── repository (domain JSON) ── profile (Postgres)
  ▼
Engine pipeline (server-side, provider-agnostic)
  1. analyze      LLM  raw text + situation → blocks (+stimulus per block) + restrictions + conditions
  2. resolve      code movement names → canonical library rows
  2b. clarify     code questions for a painful site with nothing named, and for a best
                       replacement that loads the painful site the same way
     ── pause only when there is a question (phase 2 starts here) ──
  3. conditions   code profile injuries ⊕ today's conditions ⊕ answered restrictions → active
  4. plan         code assess every movement (ok / caution / avoid, equipment) + candidate substitutes
  5. tailor       LLM  modified session, grounded by the plan, conversions, benchmarks
  6. validate     code contraindications, equipment, time cap, stimulus drift, block accounting
       └─ violations → one retry with the violations fed back → still unsafe → fail closed
  7. refine       feedback → analyze feedback (LLM) → clarify → tailor → validate
```

- **AI abstraction:** `LlmProvider.generateStructured(schema)`; a decorator retries once
  when the model's output fails schema validation, feeding the validation error back.
  Only `gemini-provider.ts` imports the SDK.
- **Engine** depends only on `LlmProvider` and plain domain data — never on Prisma, Next,
  or a concrete SDK — so it runs identically in tests, in the eval script and in routes.
- **Two phases (restrictions in the athlete's own scope).** Mapping "me duele el hombro,
  no puedo hacer snatch" to a catalog injury with a severity bans far more than the athlete
  said (a shoulder impingement also bans toes-to-bar). Today's pain and limits are read
  instead as **restrictions** that ban exactly what the athlete named:
  - movement and site named ("me duele el hombro, no puedo hacer snatch"): only the named
    movements change; tailored at once, unless the best replacement loads that site the
    same way (a Push Press for a snatch with a bad shoulder): then the athlete picks the
    replacement, the safe one preselected;
  - movement only ("no puedo hacer snatch"): only that movement changes, to the best
    replacement by stimulus; the athlete corrects it with refine if needed;
  - a kind of load ("nada por encima de la cabeza"): every movement with that load;
  - site only ("me duele el hombro"): the athlete is asked which kinds of load bother
    them, each option listing the session's movements it covers; the answer bans exactly
    those. "Something else" is re-analyzed once; "I can do everything" keeps the pain as
    context only.
  Phase 1 (`/api/tailor/analyze`, JSON) analyzes the workout and the situation and builds
  the questions deterministically (no extra LLM call). With no question, phase 2
  (`/api/tailor`, NDJSON stream) starts at once. Non-pain catalog conditions (pregnancy)
  read today apply directly and show on the result. Profile injuries keep their catalog
  entry and severity. The client sends the phase-1 analysis back to phase 2 (as refine
  already sends the previous result): it can only alter the athlete's own session, the
  stored profile injuries are always re-applied, and the validator enforces every
  restriction.
- **Progress:** phase 2 streams NDJSON events (`progress` stages, then `result` or
  `error`); the UI shows "analyzing" during phase 1 and the streamed stage after. Typical
  cost is 2 LLM calls (3 with a retry), as before.

## Engine pipeline (core)

1. **Analyze (one LLM call).** Input: the verbatim paste, today's situation text, the
   canonical movement names (with aliases) and the contraindication catalog (keys,
   labels, kinds). Output:
   - the session split into ordered **blocks** (format, scheme, time domain, components,
     coaching notes, optional `day` for multi-day pastes) with a **stimulus profile per
     block**;
   - **restrictions** from the situation text, each `{ site?, side?, movements[],
     mechanisms[], positions[], evidence }`: the session (or library) movements the athlete
     says they cannot do, the kinds of load (stress mechanisms) and positions they name in
     general terms, and where it hurts. Nothing the athlete did not name is added: pain
     alone gives empty lists. "No puedo hacer snatch" covers every snatch variant in the
     session. Movement names resolve to the library; unknown ones are dropped;
   - **conditions**: non-pain catalog conditions only (`kind: condition`, e.g. pregnancy);
   - **equipment unavailable today** mentioned in the situation ("no rower today").

   The verbatim invariant holds: session
   `rawText` is the input; a block slice that is not a substring of the input falls
   back to the session text. If analysis fails, the session degrades to one raw block
   (no stimulus) **and** a situation-only analysis still runs; if that also fails while
   the situation is non-empty, the request fails — stated pain is never ignored.
2. **Resolve.** Each component's movement name is resolved deterministically to a
   library row (exact name → alias → normalized name/alias → singularized → **word key**),
   producing `canonical` or `null` ("unrecognized"). The word key makes the last step
   independent of the LLM's formatting: words in any order, word-level shorthand expanded
   (KB, DB, BB, HS, HSPU, MU, OHS, RDL, T2B/TTB, C2B/CTB, T2R/TTR, K2E, DU), each word
   singularized, so "Goblet Squat KB" resolves to Kettlebell Goblet Squat. It never matches
   a subset of the words, and a test guarantees no two movements share a word key.
   Resolution is only as honest as the analysis:
   the analyzer may use a library name only for the **same** movement (spelling,
   abbreviation, translation); a related variant keeps its own name (a snatch pull is not
   a hang power snatch), so a gap surfaces as "unrecognized" instead of borrowing another
   movement's stresses. Mobility drills, stretches and technique drills (the Sots press,
   anything done with a PVC pipe) are not components. Movements that let the athlete pick
   the method (shoulder-to-overhead, ground-to-overhead) are their own rows carrying the
   most restrictive stresses of the methods they allow.
2b. **Clarify (deterministic, phase 1).** Questions, only when needed:
   - **site** — a restriction with a site and nothing named: the session's resolved
     movements that stress that site, grouped by identical movement sets, each option
     labelled with its mechanisms in plain words ("Arms overhead or explosive: Power
     Snatch"; "Hanging from a bar or kipping: Toes-to-Bar"), plus "everything that loads
     it", "something else" (free text, re-analyzed once; a site still unnamed after that
     bans every load on it) and "I can do everything" (context only). No session movement
     loads the site → no question.
   - **replacement** — a restriction with a site whose best candidate for a banned
     movement shares a mechanism at that site with it: the candidates, each marked with
     the loads it shares, the first sharing nothing preselected.
   Answers turn into restrictions (the chosen mechanisms) and **replacements**
   (`{ blockIndex, componentIndex, replacement }`, which become that component's only
   candidate).
3. **Active conditions.** Profile injuries (persisting) ⊕ previous conditions (refine) ⊕
   today's conditions; for the same key, today's side/severity win. Unknown keys are
   dropped and logged. Each restriction becomes a synthetic `limitation`
   (`today_<n>`): `avoidMovements` = its movements, an `avoid` stress rule for its
   mechanisms at its site (every site when none was named), an `avoid` position rule per
   position, its side for laterality. A restriction with nothing to ban (context only)
   activates nothing.
4. **Plan (deterministic).** For every resolved component: an **assessment**
   (`ok | caution | avoid` with reasons, see *Assessment*), the equipment it needs that
   is missing today, and — when it must change or is cautioned — ranked **candidate
   substitutes**: the movement's `substitutes[]` first (in order, excluding `avoid` and
   missing equipment, `ok` before `caution`, top 5), then, for **every pattern of the
   original that no surviving substitute covers**, movements sharing that pattern, ranked
   by shared annotations (patterns ×10, shared site+mechanism pairs ×2, same skill +1):
   top 5 for the primary pattern when no substitute survives, otherwise top 3 per
   uncovered pattern. A combined movement whose press is blocked (a Thruster with a bad
   shoulder) thus still gets squats, so its stimulus survives. Only when nothing at all
   survives do **related patterns** step in (vertical ↔ horizontal pull, vertical ↔
   horizontal push, squat ↔ lunge, carry ↔ hold), marked "related pattern" in the prompt:
   a Pull-up without a bar or rings becomes a Dumbbell Row instead of an improvised push.
   The final list puts first the candidates **no riskier than the original** (only `ok` when
   the original must change for safety; `ok` or `caution` when it was already `caution`),
   then those covering **more of its patterns**, then `ok` before `caution`. A Thruster with
   no barbell and a mild knee thus leads with Dumbbell Thruster (same movement, same
   caution) instead of a half-movement such as a press. Implement variants stay separate
   rows: their stresses, laterality and skill differ (no front-rack wrist load with
   dumbbells, single-arm options), and loads convert per implement. Each reason in the plan
   carries its own verdict (`= avoid` / `= caution`): severity is already applied, so a
   mild condition does not read as a ban. A movement goal adds the target movement's
   family (itself + its substitutes, filtered the same way).
5. **Tailor (one LLM call).** The prompt carries the original session with per-block
   stimulus, the athlete (sex, scaling level, benchmarks, goals, time budget), today's
   request, the active conditions, the component plan with candidates (fully annotated),
   the names of the whole library, the available equipment, and the effort/load
   conversions. Output: the modified session (each block lists its `sourceBlocks`),
   `droppedBlocks` with reasons, per-change list, rationale and safety note. The output
   schema restricts every component's `movement` to an enum of the library names plus the
   original's unrecognized names (which may be kept as written): the model cannot prescribe
   a movement the validator cannot assess. Each change's `modified` is restricted to the
   same names or `"(removed)"`, so the change summary the athlete reads cannot name a
   movement that does not exist. The prompt asks a combined movement to keep every part
   that is still allowed (never drop a whole pattern while an `ok` candidate exists). Its freedom is in choosing among candidates,
   loads, reps, scheme and block structure; a missing movement is a catalog gap, surfaced
   by the unrecognized-movement queue.
6. **Validate (deterministic).** Findings (`violation` or `warning`):
   - `contraindicated_movement` (violation): a tailored component assessed `avoid`;
   - `equipment_unavailable` (violation): needs equipment the athlete lacks today;
   - `unrecognized_movement`: violation if newly introduced (defense in depth: the schema
     already prevents it); warning if it was already in
     the original (it could not be verified);
   - `caution_movement` (warning): assessed `caution` — shown to the athlete;
   - `time_cap_exceeded` (violation): total block time > cap × 1.1;
   - `stimulus_drift`: block-level quality changed (violation), energy system changed or
     load intensity raised (warning); only for 1:1 block mappings;
   - `unaccounted_block` (violation): an original block neither mapped nor dropped;
   - `change_mismatch` (violation): a change's `modified` names a movement its block (or,
     with no block index, the session) does not prescribe.

   Any violation triggers **one** tailor retry with the findings in the prompt. If a
   `contraindicated_movement` violation survives the retry, the engine **fails closed**
   (`engine_unsafe`); other surviving violations are returned as findings.
7. **Refine.** The athlete reacts ("still hurts", "too easy", "no rower today"): a
   situation-only analysis of the feedback (`/api/tailor/refine/analyze`, given the
   session's movement names) may add restrictions — clarified exactly as in phase 1 — or
   remove equipment, then
   tailor + validate re-run (`/api/tailor/refine`) against the **original** session with
   the rejected attempt and the feedback history in the prompt. No re-parse.

## Domain-grounding assets

All in `data/`, validated by Zod schemas and by integrity tests.

### Movement (`data/movements.json`)

`name`, `aliases[]`, `patterns[]` (primary first), `positions[]`, `stresses[]`,
`equipment[]`, `skill`, `substitutes[]`, `unilateral`.

- **patterns** (`squat | hinge | lunge | vertical_push | horizontal_push | vertical_pull |
  horizontal_pull | core | carry | hold | olympic | jump | monostructural`) drive
  substitution and balance. `carry` = locomotion holding a loaded position; `hold` =
  isometric maintenance of one; `olympic` is reserved for barbell lifts.
- **positions** (`hanging | inverted | partial_inversion | supine | prone`) are
  whole-body positional demands an athlete can be categorically unable to adopt.
  `inverted` = bodyweight fully on the hands; `partial_inversion` = load shared with the
  feet on a surface; `supine` = lying on the back under load or effort (bench, sit-up);
  `prone` = chest/belly to the floor (burpee family, wall walk start).
- **stresses** `{ site, mechanisms[], load }`:
  - sites: joints/spine `shoulder | elbow | wrist | neck | lumbar | hip | knee | ankle`,
    muscle groups `quads | hamstrings | calves | hip_flexors | chest | biceps | lats |
    triceps | abdominals`, and `grip` (hands/forearms: hanging traction, kipping friction,
    heavy carries). A site is admitted only when some contraindication needs it, and an
    integrity test keeps every annotated site blocked by some `avoid` rule.
  - mechanisms: `compression | flexion | deep_flexion | extension | deep_extension |
    overhead | ballistic | impact | traction | kipping | eccentric`. A mid-range mechanism
    and its end-range grade are mutually exclusive on one site.
  - `load`: `high` (default — clinically significant: loaded or forceful) or `low` (the
    same mechanism at bodyweight/unloaded, e.g. the Air Squat's deep knee flexion).
    Low-load stresses matter only at higher severities (see *Assessment*).
  - For muscle sites, list only primary movers under substantial load.
- **equipment** — AND-set from `barbell | dumbbell | kettlebell | pullup_bar | rings | box
  | ramp | bench | ghd | band | rope | jump_rope | rower | ski_erg | bike | air_bike |
  wall_ball | sandbag | d_ball`, matched by subset against the athlete's equipment.
  Missing equipment is not a contraindication: it flags the movement unavailable and
  filters candidates. Count is not modeled (one dumbbell vs two is a rep-scheme
  adjustment). Interchangeable implements are **one row per implement** (twins carry
  identical stresses and list each other as substitutes).
- **strict vs kipping** are separate rows whenever both are programmed (`Pull-up` /
  `Strict Pull-up`, `Chest-to-Bar` / `Strict Chest-to-Bar`, `Toes-to-Bar` /
  `Strict Toes-to-Bar`, `Handstand Push-up` / `Strict Handstand Push-up`). The plain
  name is the kipping-allowed default as programmed.
- **unilateral** (`upper | lower | null`): a standard single-limb variant exists that keeps
  the movement's stresses on the working side only (single-arm dumbbell work, pistol).
  Lets a one-sided injury train the healthy side.
- **substitutes** are stimulus-preserving alternatives (not scaling progressions; may be
  harder); primary source of candidates. **aliases** are ingestion shorthand (`T2B`,
  `DB Snatch`), unique and never colliding with a canonical name, also after
  normalization.

### Contraindication (`data/contraindications.json`)

`key`, `label`, `kind` (`injury | limitation | condition`), `rules[]`
(`{ site, mechanisms[], tier }`), `positionRules[]` (`{ position, tier }`),
`avoidMovements[]` (explicit-name escape hatch; empty for every seeded entry, enforced by
a test), `notes`.

- `tier` is `avoid` (do not prescribe) or `caution` (allowed with reduced load/range,
  flagged to the athlete).
- `injury` entries are severity-scaled; `limitation` entries (`no_hanging`,
  `no_inversion`) and `condition` entries (`pregnancy`) apply their tiers as written.
- Catalog: 16 joint/muscle injuries + `hand_tear` + `abdominal_strain` (injuries),
  `no_hanging` + `no_inversion` (limitations), `pregnancy` (condition) — 21 entries.
  Pregnancy rules are deliberately conservative and always carry "consult your
  healthcare provider".

### Assessment (deterministic)

A movement is assessed against each active condition `{ contraindication, side,
severity }`; the movement's verdict is the worst across reasons.

- A **stress rule** matches a stress entry when the site is equal and they share a
  mechanism. Effective tier for `injury` kinds:

  | rule tier · stress load | mild | moderate | acute |
  |---|---|---|---|
  | avoid · high | caution | avoid | avoid |
  | avoid · low | ok | caution | avoid |
  | caution · high | caution | caution | avoid |
  | caution · low | ok | ok | caution |

  `limitation`/`condition` kinds use the `moderate` column.
- A **position rule** matches when the movement requires that position; its tier applies
  as written. An `avoidMovements` entry is `avoid`.
- **Laterality:** when the condition has `side: left | right` and the movement is
  `unilateral` for the limb group of the matched site (upper: shoulder, elbow, wrist, grip,
  chest, biceps, lats, triceps; lower: hip, knee, ankle, quads, hamstrings, calves,
  hip_flexors), an `avoid` from that rule becomes `caution` marked *healthy side only*.
  Axial sites (neck, lumbar, abdominals) never get this exemption.
- `matchesContraindication(movement, c)` remains as the shorthand "assessed `avoid` at
  moderate severity, no side" used by integrity tests.

### Stimulus taxonomy (`data/stimulus-taxonomy.json`)

Three vocabularies with label + description each, used by the analyze prompt and pinned
to the engine's Zod enums by a sync test:

- `qualities`: `strength | power | skill | conditioning | muscular_endurance | preparation`
- `energySystems`: `phosphagen | glycolytic | oxidative`
- `loadIntensities`: `light | moderate | heavy`

### Conversions (`data/conversions.json`)

- **Effort equivalences** — groups of interchangeable monostructural/rope efforts with
  M/F amounts (e.g. 400 m run ≈ 500 m row ≈ 25/20 cal row ≈ 500 m ski ≈ 1000 m bike erg ≈
  20/15 cal air bike; 1 double-under ≈ 3 single-unders). `convertEffort` converts
  deterministically (meters rounded to 10, calories/reps to integers).
- **Implement load** — per-hand fraction range when replacing a two-handed barbell lift
  with two dumbbells/kettlebells (0.30–0.40).

All values are approximate coaching conventions, stated as such in the prompt.

## Data model

Domain entities are JSON (above). User data in Postgres:

- **Better Auth core**: `user`, `session`, `account`, `verification` (Google accounts link
  through `account`).
- **AthleteProfile** (`data Json`, validated by `AthleteProfileSchema`, incremental):
  - `sex` (`male | female | null`) — selects M/F prescribed loads and conversions;
  - `scalingLevel` (`scaled | intermediate | rx | rx_plus | null`) — selects the tier when
    the programming offers several;
  - `injuries[]` `{ key, side (left|right|both|null), severity (mild|moderate|acute),
    notes, since }`;
  - `benchmarks[]` `{ movement (canonical), kind (1rm|max_reps|time), value, unit
    (kg|lb|reps|seconds), recordedAt }`;
  - `equipment` (`Equipment[] | null`; `null` = not specified → assume a full box);
  - `goals[]` `{ movement (canonical | null), description }`;
  - `availability` `{ minutesPerDay, daysPerWeek, days[] (mon…sun) }`.
- **TailoredWorkout**: `original`, `request`, `conditions`, `restrictions` (today's,
  answered; absent in older rows = none), `tailored` (session +
  droppedBlocks + changes + rationale + safetyNote), `findings`, `feedbackHistory[]`,
  `model`, `createdAt`; indexed by `(userId, createdAt)`.
- **LlmUsage**: `userId`, `kind` (`analyze | tailor | refine`), `createdAt` — the quota
  ledger. Each kind has its own daily limit, so one adaptation (analyze + tailor) counts
  once against each and neither endpoint can be called unbounded.
- **UnrecognizedMovement**: `key` (normalized name, unique), `example` (as written, ≤ 80
  chars), `count`, `status` (`pending | resolved | ignored`), `resolvedTo`, `firstSeenAt`,
  `lastSeenAt` — the catalog-growth queue. Names only, never workout text, and no user id.

### Workout (structured)

A training **session**, stored as JSON. Raw text is the durable source of truth; the
structure is a derived extraction.

- **session**: `name?`, `rawText`, `source` (`paste`), `blocks[]`
- **block**: `title?`, `rawText` (verbatim slice), `day?` (1-based, multi-day pastes),
  `format` (`amrap | for_time | emom | intervals | strength | skill | partner | rest |
  other`), `scheme?`, `timeDomainMinutes?`, `components[]`, `coachingNotes?` (intensity,
  tempo, scaling tiers as prose), `stimulus?`
- **stimulus profile** (per block): `quality`, `energySystem?`, `loadIntensity?`,
  `rationale`
- **component**: `movement` (as named), `canonical` (resolved; set by code, never by the
  model), `reps?`, `load?` (raw string incl. tiers "61/43 kg"), `loadKg?` `{ male,
  female }`, `percent1RM?`, `distanceMeters?`, `calories?`, `durationSeconds?`, `notes?`
- **tailored block** additionally: `sourceBlocks[]` (indices of the original blocks it
  derives from; several when merging missed days)

### Today's request

`situation` (free text in the athlete's words), `timeCapMinutes?`, `targetMovement?`
(canonical), `equipmentToday?` (overrides the profile for today). Constraints combine;
an empty request means "nothing special". Missed days are detected from blocks carrying
more than one distinct `day`.

## Athlete-facing flow

1. **Sign in with Google.**
2. **Onboard** profile (incremental): sex & scaling level, injuries/limitations (catalog
   pick + side + severity + notes), equipment, benchmarks, goals, availability.
3. **Tailor:** paste the workout + describe today's situation, optionally a time
   cap, a target movement, today's equipment.
4. **Clarify** only when phase 1 has a question (see *Clarify*): which loads bother a
   painful site, or which replacement to use when the best one loads that site too.
5. **Progress** shows the engine stage (analyzing → tailoring → validating).
6. **Result:** original vs tailored side by side per block, caution badges, unverified
   movements, what changed and why, dropped blocks, rationale, safety note + disclaimer.
7. **Refine** with feedback (new restrictions are clarified the same way), or **save** exactly what was reviewed (no re-run) to history.

## Quality strategy

- **Unit tests** (Vitest, deterministic, no network/DB): domain integrity, assessment,
  resolver, conversions, candidates, validator, engine steps with a `FakeProvider`, quota,
  stream helper.
- **Evaluation harness** (`pnpm eval`, needs `GEMINI_API_KEY`): synthetic/public cases in
  `evals/cases/*.json` run through the real pipeline and graded by the deterministic
  validator plus per-case expectations. The harness plays the athlete: a site question is
  answered "everything that loads it" (the conservative answer) and a replacement question
  takes the preselected option. Expectations: (`mustAvoid`, `mustKeep` (original movements
  that must survive: a snatch ban keeps toes-to-bar), `mustDetect` (today's catalog
  conditions), `mustRestrict` (sites today's restrictions must name), `maxTotalMinutes`,
  `expectFailClosed`, `originalMustContain` / `originalMustNotContain`, which pin how
  the original was recognized, and `mustKeepPatterns`, the movement patterns some tailored
  movement must still train).
  Run before changing prompts, model or domain data.
- **Coverage** (`pnpm coverage`): runs analysis over the private corpus and reports the
  share of component mentions that resolve to the library and the most frequent
  unrecognized names. v1 target: **≥ 95 %** resolved. The percentage alone is not trusted:
  a coverage pass also reviews what each name resolved to, since a wrong match inflates it.
- **Catalog growth from usage**: every tailor/refine run queues the movement names (of the
  original and of the tailored session) that resolved to no library row; recording never
  fails the athlete's request. `pnpm review:movements` lists the pending queue by frequency,
  closes entries the library has since learned, and marks non-movements as ignored.
  Movements are **never added automatically**: their stress, position and laterality
  annotations decide safety, so each addition is a reviewed data change with a test.

## Safety

- Contraindicated movements are **never** returned: validated deterministically,
  fail-closed after one retry.
- Prominent **"not medical advice"** disclaimer; `caution` items are visible on the
  result; conservative defaults ("when unsure, choose the lower-risk option and say
  consult a professional"); pregnancy always defers to the healthcare provider.
- Errors never leak exception text to the client.

## Explicitly out of scope for v1 (YAGNI)

- Coach/program authoring, scheduling, athlete↔program linking (Phase C)
- Photo/OCR ingestion; native app / offline
- Persisting every refine attempt (only the feedback history of the saved result is kept)
- Runtime-editable domain data (Phase C)

## Next steps

1. ~~Revise spec (revision 2).~~
2. Revise the implementation plan — `docs/plans/training-tailor-engine-v1-plan.md`.
3. Execute it.
