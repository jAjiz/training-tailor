# Training Tailor

A web app for functional fitness training. Coaches write and publish programs; athletes
follow them day by day from their phone. An AI engine adapts a workout to the athlete's
situation (pain or injury, limited time, missing equipment) while keeping its intended
stimulus, with safety rules enforced by the domain layer.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL (Neon) with Prisma ·
Better Auth (Google OAuth) · Gemini · Vitest

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm db:migrate
pnpm dev
```

The app runs at http://localhost:3000.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm eval` | Evaluation harness for the tailoring engine |

## Deploy

Vercel deploys every push to `main` to production. The build command in
[`vercel.json`](vercel.json) applies pending Prisma migrations to the production database
(`pnpm db:deploy`, using `DIRECT_URL`) before `pnpm build`; preview builds skip migrations.

## Documentation

Design specs and implementation plans live in [`docs/`](docs/).
