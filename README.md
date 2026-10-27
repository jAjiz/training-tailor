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

Design specs and implementation plans live in [`docs/`](docs/).
