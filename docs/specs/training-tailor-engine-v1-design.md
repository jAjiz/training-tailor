# Training Tailor — v1 Design (Engine + Athlete Self-Serve)

## Problem

Amateur and competitive CrossFit athletes follow standardized, non-individualized
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

- **A. Modification engine** — structured WOD + athlete profile + constraint →
  tailored WOD with rationale. The novel, hard, valuable core. LLM-driven.
- **B. Athlete-side essentials** — profile management + ingestion (free-text parse →
  structured WOD; manual entry). Needed to run the engine end-to-end.
- **C. Coach/program side** — coaches author programs, schedule daily WODs, athletes
  link to a program and fetch "today's WOD." Substantial, fairly standard multi-user
  SaaS. **Not** where the individualization magic lives.

**v1 scope = A + B** (athlete self-serve). The engine proves out end-to-end without
the coach portal. **C is a later phase** that plugs into the same engine.

### v1 must handle (general engine — any impediment or priority)
- Physical limitation (injury/pain) — modify around it, preserve stimulus, avoid aggravation
- Time constraint — condense while keeping the key stimulus
- Missed days — help prioritize/merge when rejoining
- Movement-improvement goal — bias the workout toward a chosen weakness
- "No constraint" — pass-through or light personalization

## Decisions (locked)

| Area | Decision |
|------|----------|
| Platform | Responsive web app, **phone-first** (gym use on phone via browser) |
| Stack | **Next.js + TypeScript** (full-stack; App Router) |
| Engine approach | **LLM + domain-grounding layer** (the AI service reasons, grounded by owned domain data) |
| AI provider | **Gemini (Google) API** for v1, accessed only through an internal **AI service abstraction layer** (provider-agnostic interface) so other providers (e.g., Claude, OpenAI) can be added without touching engine code. Server-side only. |
| Auth / storage | **Simple accounts** (e.g., NextAuth email magic link) + **Postgres via Prisma** |
| Ingestion (v1) | Free-text paste (LLM parse) + structured manual entry. Program-based ingestion deferred to Phase C. |

## Architecture

- **Client:** Next.js App Router, responsive/phone-first React UI.
- **Server:** route handlers / server actions that invoke the engine server-side
  (API key never reaches the browser).
- **AI service abstraction layer:** a provider-agnostic interface (e.g., a
  `LlmProvider` contract with methods like `parseWod`, `classifyStimulus`, `tailor`)
  that the engine depends on. v1 ships a **Gemini** implementation; adding Claude/
  OpenAI later means writing a new adapter, not changing the engine. Provider is
  chosen via config/env.
- **Engine module:** server-side domain-grounded pipeline (below), depends only on
  the AI service abstraction — never on a concrete provider SDK.
- **Domain data:** seeded assets the product owns — movement library,
  injury→contraindication map, stimulus taxonomy — stored in DB, seeded from
  versioned JSON in the repo.
- **Database:** Postgres (Prisma) — athlete profiles + saved tailored workouts +
  domain data.

## Engine pipeline (core)

1. **Ingest → normalize:** free-text or manual entry → structured WOD (movements,
   rep scheme, time domain, loads). LLM-powered parse for free text.
2. **Classify stimulus:** tag the WOD's training intent(s) from the stimulus
   taxonomy (e.g., aerobic capacity, heavy strength, gymnastics skill, mixed-modal
   conditioning).
3. **Resolve constraints:** combine athlete profile + today's request; pull relevant
   contraindications and substitution candidates from the domain data.
4. **Tailor:** the AI service generates the modified WOD, instructed to *preserve the
   classified stimulus*, respect contraindications, scale to benchmarks, fit
   equipment and time budget. Structured JSON output (validated against a schema).
5. **Rationale:** plain-language "what changed and why the stimulus is preserved,"
   plus a safety note.
6. **Refine loop:** athlete reacts ("still hurts," "too easy," "no rower today") →
   re-run with the added constraint.

## Domain-grounding assets (seed lean, grow over time)

- **Movement library:** each movement tagged with plane, joint stress, load type,
  skill level, and substitution candidates.
- **Injury → contraindication map:** e.g., "shoulder impingement → avoid overhead /
  ballistic pressing."
- **Stimulus taxonomy:** the set of training-intent tags used to classify and
  preserve stimulus.

## Data model (core entities)

- **AthleteProfile:** injuries[], benchmarks{} (1RMs, skills, benchmark scores),
  equipment[], goals[], availability{} (hours per day, days per week, which specific
  days are trainable)
- **Movement:** name, plane, jointStress, loadType, skill, substitutes[]
- **InjuryContraindication:** injury → avoided patterns/movements
- **StimulusTag:** taxonomy of training intents
- **WOD (structured):** movements[], scheme, timeDomain, loads, source (adhoc in v1)
- **TailoredWorkout:** original WOD, the request/constraint, modified WOD, rationale,
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

## Open items to confirm at planning time

- Exact Gemini model id and SDK for the v1 provider adapter.
- Whether to seed domain data manually vs. LLM-assisted generation + human review.
- Minimum viable size of the seed movement library / injury map for a credible demo.

## Next steps

1. User reviews this spec.
2. On approval → invoke the `writing-plans` skill to produce the implementation plan.
