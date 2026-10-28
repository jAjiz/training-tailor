# Training Tailor

A web app for functional fitness training. Coaches write and publish programs; athletes
follow them day by day from their phone. An AI engine adapts a workout to the athlete's
situation (pain or injury, limited time, missing equipment) while keeping its intended
stimulus, with safety rules enforced by the domain layer.

Running in a closed beta at [training-tailor.vercel.app](https://training-tailor.vercel.app):
sign-up is by invitation from a coach. The interface is in Spanish and English.

## Features

**Athletes** (phone-first, installable as a PWA)
- Today's session and a calendar of the programs they joined through a coach's link.
- Result logging, leaderboards by division (Rx / Scaled) with fist bumps.
- Personal records (1RM) per lift, used to turn "% of 1RM" sets into kilos.
- **Tailor:** paste a workout, describe today's situation ("me duele el hombro, no puedo hacer
  snatch", 30 minutes, no rower) and get a version that respects it while keeping the
  intended stimulus.
- Push notifications when a new week is published or the coach posts on the program board.

**Coaches** (desktop-first, under `/coach`)
- Continuous programs (dated, published week by week) and closed programs (N weeks that start
  when each athlete joins).
- A weekly planner with drag-and-drop blocks: free-text workouts with a scoring type, and
  barbell sets (sets × reps × % of 1RM or kg).
- Invitation links, enrolled athletes, results per block and a board for announcements.
- Notifications when an athlete joins or next week is still unpublished.

**Admin** (`/admin`)
- Coach approval, account blocking, program overview and an audit log.
- The domain library editor: movements, contraindications, stimulus taxonomy, conversions,
  expectations and eval cases, versioned and published without a deploy.

## How tailoring works

The LLM proposes; deterministic code decides what is allowed.

1. **Analyze** (LLM): the pasted text becomes blocks with their intended stimulus, and the
   athlete's situation becomes restrictions and conditions.
2. **Resolve** (code): movement names map to the domain library's canonical movements.
3. **Clarify** (code): when the situation is ambiguous ("my shoulder hurts", with no movement
   named) the athlete answers a question built from the session's own movements.
4. **Plan** (code): every movement is assessed (`ok` / `caution` / `avoid`, equipment) against
   the active contraindications, with ranked substitutes.
5. **Tailor** (LLM): the modified session, grounded by the plan, the conversions and the
   athlete's benchmarks. The output schema only admits library movements.
6. **Validate** (code): contraindications, equipment, time cap, stimulus drift and block
   accounting. A violation gets one retry with the violations fed back; if the result is
   still unsafe, the request fails closed.

The engine depends only on an `LlmProvider` interface and plain domain data, so the same code
runs in routes, unit tests and the eval script. The domain library lives in the database
([design](docs/specs/training-tailor-domain-library-design.md)); every publish is checked
against the library's own expectations.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL (Neon) with Prisma ·
Better Auth (Google OAuth) · Gemini · Vitest

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in the values, DOMAIN_IMPORT_HOST included
pnpm db:migrate
pnpm dev
```

The app runs at http://localhost:3000. Sign in once, then make yourself an admin and publish
the demo library:

```bash
pnpm admin:grant <your-email>
pnpm domain:import data/sample/library.json
```

## Domain library

The movements, contraindications, stimulus taxonomy, conversions, library expectations and
eval cases live in the database as versioned snapshots, edited and published from
`/admin/library`. Nothing is served until a version is published. The repository carries only
a small demo library, [`data/sample/library.json`](data/sample/library.json), which
`pnpm domain:import` publishes on the development database (it refuses any host other than
`DOMAIN_IMPORT_HOST`).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:cov` | Unit tests with the coverage threshold |
| `pnpm eval` | Runs the published library's eval cases through the tailoring engine |
| `pnpm domain:import <file>` | Imports and publishes a library file on the development database |
| `pnpm check:content` | Fails if library data is duplicated in the repository outside the sample |

## Deploy

Vercel deploys every push to `main` to production. The build command in
[`vercel.json`](vercel.json) applies pending Prisma migrations to the production database
(`pnpm db:deploy`, using `DIRECT_URL`) before `pnpm build`; preview builds skip migrations.

## Documentation

Design specs live in [`docs/specs/`](docs/specs/) and implementation plans in
[`docs/plans/`](docs/plans/):

- [Tailoring engine](docs/specs/training-tailor-engine-v1-design.md)
- [Domain library](docs/specs/training-tailor-domain-library-design.md)
- [Coaching: programs, results, leaderboards](docs/specs/training-tailor-coaching-design.md)
- [Admin panel](docs/specs/training-tailor-admin-design.md)
- [Notifications](docs/specs/training-tailor-notifications-design.md)
- [UI restyle](docs/specs/training-tailor-ui-restyle-design.md)

## License

[Functional Source License 1.1, Apache 2.0 future license](LICENSE.md) (FSL-1.1-ALv2): any
use except a competing one, and each version becomes Apache 2.0 two years after its release.
