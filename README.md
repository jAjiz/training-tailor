# Training Tailor

A web app for functional fitness training. Coaches publish programs; athletes follow them
from their phone, log results and compare them on leaderboards. An AI engine adapts a workout
to the athlete's situation (pain, limited time, missing equipment) while keeping its intended
stimulus. The LLM proposes; code decides what is safe.

In closed beta at [training-tailor.vercel.app](https://training-tailor.vercel.app), by
invitation. Spanish and English.

## Features

- **Athletes:** daily sessions, results, leaderboards, personal records, workout tailoring and
  push notifications. Installable as a PWA.
- **Coaches:** programs, a weekly planner, invitation links, results and announcements.
- **Admin:** coach approval, accounts, audit log and the domain library editor.

## Stack

Next.js · TypeScript · Tailwind CSS · PostgreSQL (Neon) with Prisma · Better Auth ·
Gemini · Vitest

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm db:migrate
pnpm dev
```

The app runs at http://localhost:3000. Sign in once, then make yourself an admin and load the
demo library:

```bash
pnpm admin:grant <your-email>
pnpm domain:import data/sample/library.json
```

The domain library lives in the database and is edited from `/admin/library`; the repository
only carries a small demo.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests |
| `pnpm eval` | Runs the eval cases through the tailoring engine |

## License

[FSL-1.1-ALv2](LICENSE.md): any use except a competing one; each version becomes Apache 2.0
two years after its release.
