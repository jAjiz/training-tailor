# Training Tailor — v1 Design (Engine + Athlete Self-Serve)

## Problem

Amateur and competitive functional fitness athletes follow standardized, non-individualized
training templates (e.g., Mayhem, Training Think Tank). When an athlete faces a
physical limitation (injury/pain), a time constraint, a missed training day, or
wants to bias work toward a specific weakness, they often don't know how to scale
or modify the workout correctly — risking loss of the intended **training stimulus**
or further injury.

Training Tailor provides **deep individualization**: given a workout and the athlete's
current context, it produces a modified version that honors the original training
intent.

## Scope

The full product vision has three sub-systems:

- **A. Modification engine** — structured workout + athlete profile + constraint →
  tailored workout with rationale. The novel, hard, valuable core. LLM-driven.
- **B. Athlete-side essentials** — profile management + ingestion (free-text parse →
  structured workout; manual entry). Needed to run the engine end-to-end.
- **C. Coach/program side** — coaches author programs, schedule daily workouts, athletes
  link to a program and fetch "today's workout." Substantial, fairly standard multi-user
  SaaS. **Not** where the individualization magic lives.

**v1 scope = A + B** (athlete self-serve). The engine proves out end-to-end without
the coach portal. **C is a later phase** that plugs into the same engine.

### v1 must handle (general engine — any impediment or priority)
- Physical limitation (injury/pain) — modify around it, preserve stimulus, avoid aggravation
- Time constraint — condense while keeping the key stimulus
- Missed days — help prioritize/merge when rejoining (the paste may span several
  missed days; the engine merges them into one session that fits today)
- Movement-improvement goal — bias the workout toward a chosen weakness
- "No constraint" — pass-through or light personalization

## Decisions (locked)

| Area | Decision |
|------|----------|
| Platform | Responsive web app, **phone-first** (gym use on phone via browser) |
| Stack | **Next.js + TypeScript** (full-stack; App Router) |
| Engine approach | **LLM + domain-grounding layer** (the AI service reasons, grounded by owned domain data) |
| AI provider | **Gemini (Google) API** for v1, accessed only through an internal **AI service abstraction layer** (provider-agnostic interface) so other providers (e.g., Claude, OpenAI) can be added without touching engine code. Server-side only. |
| Auth / storage | **Simple accounts** (e.g., NextAuth email magic link) + **Postgres via Prisma** for user data (accounts, profiles, saved tailored workouts) |
| Domain data storage | **Versioned JSON in the repo**, validated with schemas and loaded through a small repository interface. Moves into the DB later, when it becomes runtime-editable (coach-facing, Phase C) — a contained change behind the same interface. |
| Ingestion (v1) | Free-text paste (LLM parse) + structured manual entry. Program-based ingestion deferred to Phase C. |

## Architecture

- **Client:** Next.js App Router, responsive/phone-first React UI.
- **Server:** route handlers / server actions that invoke the engine server-side
  (API key never reaches the browser).
- **AI service abstraction layer:** a provider-agnostic interface (e.g., a
  `LlmProvider` contract with methods like `parseWorkout`, `classifyStimulus`, `tailor`)
  that the engine depends on. v1 ships a **Gemini** implementation; adding Claude/
  OpenAI later means writing a new adapter, not changing the engine. Provider is
  chosen via config/env.
- **Engine module:** server-side domain-grounded pipeline (below), depends only on
  the AI service abstraction — never on a concrete provider SDK.
- **Domain data:** owned assets — movement library, injury→contraindication map,
  stimulus taxonomy — shipped as **versioned JSON in the repo**, schema-validated at
  load time, and accessed only through a repository module. Nothing outside that
  module knows where the data lives, so a later move to the DB is contained.
- **Database:** Postgres (Prisma) — athlete profiles + saved tailored workouts.

## Engine pipeline (core)

1. **Ingest → normalize:** free-text or manual entry → structured workout. The raw text
   is preserved **verbatim** as the source of truth; the LLM splits it into ordered
   **blocks** (each tagged with a format) and extracts the thin structured layer
   (movements, scheme, time domain, loads) the engine reasons over. The structure is a
   *derived cache* over the raw text, not a replacement for it.
2. **Classify stimulus:** tag the workout's training intent(s) from the stimulus
   taxonomy (e.g., aerobic capacity, heavy strength, gymnastics skill, mixed-modal
   conditioning).
3. **Resolve constraints:** combine athlete profile + today's request; pull relevant
   contraindications and substitution candidates from the domain data.
4. **Tailor:** the AI service generates the modified workout, instructed to *preserve the
   classified stimulus*, respect contraindications, scale to benchmarks, fit
   equipment and time budget. Structured JSON output (validated against a schema).
5. **Rationale:** plain-language "what changed and why the stimulus is preserved,"
   plus a safety note.
6. **Refine loop:** athlete reacts ("still hurts," "too easy," "no rower today") →
   re-run with the added constraint.

## Domain-grounding assets (seed lean, grow over time)

- **Movement library:** each movement tagged with functional movement pattern(s),
  per-site stress mechanisms (sites cover joints and muscle groups), load type,
  skill level, and substitution candidates.
- **Injury → contraindication map:** site + mechanism rules covering both joint
  injuries ("shoulder impingement → avoid shoulder: overhead / ballistic /
  kipping") and muscle strains ("hamstring strain → avoid hamstrings:
  eccentric / ballistic").
- **Stimulus taxonomy:** the set of training-intent tags used to classify and
  preserve stimulus.

## Data model (core entities)

Persistence note: **AthleteProfile** and **TailoredWorkout** are DB entities
(Postgres/Prisma). **Movement**, **InjuryContraindication**, and **StimulusTag**
are versioned JSON in the repo (see Domain data above) — same shapes, no tables.

- **AthleteProfile:** injuries[], benchmarks{} (1RMs, skills, benchmark scores),
  equipment[], goals[], availability{} (hours per day, days per week, which specific
  days are trainable)
- **Movement:** name, patterns[] (functional movement pattern enum, primary first:
  `squat | hinge | lunge | vertical_push | horizontal_push | vertical_pull |
  horizontal_pull | core | carry | olympic | jump | monostructural`), stresses[]
  (per-site stress: `{ site, mechanisms[] }` where site is an anatomical-site enum
  covering joints/spine — `shoulder | elbow | wrist | neck | lumbar | hip | knee |
  ankle` — and muscle groups, added as the injury catalog needs them — `quads |
  hamstrings | calves | hip_flexors | chest | biceps` — and mechanisms is an enum of
  `compression | flexion | deep_flexion | extension | overhead | ballistic |
  impact | traction | kipping | eccentric`), loadType, skill, substitutes[].
  Patterns drive substitution and programming balance; stresses drive safety
  filtering — two independent axes. Mechanisms mean *clinically significant*
  (loaded or forceful) stress, so load is implied and names don't repeat it; a site
  merely participating is not listed — for muscle sites, list only primary movers
  under substantial load. `flexion` (mid-range) and `deep_flexion` (end-range) are
  mutually exclusive on a site; `eccentric` covers forceful lengthening and loading
  at long muscle length.
- **InjuryContraindication:** injuryKey, label, avoidStresses[] (same
  `{ site, mechanisms[] }` shape — a movement is contraindicated when one of its
  stress entries matches an avoided rule on the site AND at least one mechanism),
  avoidMovements[] (explicit-name override for cases the stress vocabulary can't
  capture; each use signals a possibly missing mechanism), notes
- **StimulusTag:** taxonomy of training intents
- **Workout (structured):** a training **session**, not a single block — one day routinely
  contains several blocks with different formats (a strength piece + a conditioning AMRAP +
  a partner WOD). The verbatim **rawText** is preserved as the durable source of truth (at
  session and per-block level); the structured fields are a *derived, regenerable extraction*
  layered on top — only what the engine must reason over programmatically:
  - **session:** name?, rawText (verbatim paste), blocks[], source (adhoc in v1)
  - **block:** title?, rawText (verbatim slice), format (`amrap | for_time | emom | intervals
    | strength | skill | partner | rest | other`), scheme?, timeDomainMinutes?, components[]
    (extracted movements, resolvable to the Movement library), coachingNotes? (intensity cues,
    tempo/pause prescriptions, and scaling tiers like Rx+/Rx/Int and M/F loads — kept as prose,
    **not** modeled into columns)
  - **component:** movement (canonical name), reps?, load? (raw string incl. tiers such as
    "61/43 kg"), distanceMeters?, calories?, durationSeconds?, notes?

  Stored in a Prisma **`Json`** column — deliberately **no** relational table per block format
  (that would be over-engineering against open-ended programming, and the structure would keep
  breaking on the next format). A parse failure **degrades gracefully**: fall back to the
  block's rawText handed to the LLM.
- **TailoredWorkout:** original session, the request/constraint, modified session (same
  structured shape), per-change list, rationale, safety note, stimulus classification,
  timestamp, link to athlete

## Athlete-facing flow

1. **Onboard** profile (incremental — can start minimal and fill in over time):
   injuries/limitations, strength & benchmarks, equipment/environment, goals,
   weekly availability (hours/day, days/week, which days).
2. **Tailor a workout:** choose source (paste text / manual entry) + state today's
   situation (injury / time cap / missed days / movement goal / none).
3. **Result view:** original vs tailored **side-by-side**, rationale, what-changed
   summary, safety disclaimer.
4. **Refine** with feedback, or **save** to history.

## Safety

- Prominent **"not medical advice"** disclaimer on injury-aware output.
- Engine instructed toward **conservative defaults**: when uncertain about an injury,
  prefer the lower-risk substitution and flag "consult a professional."

## Explicitly out of scope for v1 (YAGNI)

- Coach/program authoring, scheduling, athlete↔program linking (Phase C)
- Photo/OCR ingestion
- Native mobile app / offline

## Open items — resolved at planning time

- **Gemini model id / SDK:** `@google/genai`, model configurable via `GEMINI_MODEL`
  (default `gemini-flash-latest`).
- **Domain data authoring:** manually authored, enforced by schema-validation and
  referential-integrity tests (every substitute / avoided movement must exist in
  the movement library).
- **Minimum viable seed size:** ~35 movements, 7 injury contraindications,
  7 stimulus tags.

## Next steps

1. ~~User reviews this spec.~~ Done.
2. ~~Produce the implementation plan.~~ Done — `docs/plans/training-tailor-engine-v1-plan.md`.
3. Execute the plan (Phases 0–1 are already committed).
