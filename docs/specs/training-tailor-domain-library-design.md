# Training Tailor — Domain Library in the Database (Design)

> As built (2026-10-27). Describes the domain library as it works today: stored in the database
> as versioned snapshots, edited and published from `/admin/library`. Supersedes the "Domain
> data" row of `training-tailor-engine-v1-design.md`, which kept the library as JSON in `data/`.

## Problem

The engine reasons over a domain library: movements (patterns, positions, site stresses,
equipment, substitutes, aliases), contraindications (injuries, limitations and conditions with
their stress and position rules), the stimulus taxonomy and the effort and load conversions.

While the library lived in JSON files in the repository, every change to a movement or an injury
was a hand edit, a commit and a deploy. The library is curated continuously, so it should be
edited from the admin panel and reach the engine without a deploy, while the engine keeps
seeing only a complete, checked library.

The split is **code in the repository, content in the database**. The repository holds the
engine, the validator, the generic integrity rules and a small demo library that makes a clone
run on its own. The library, the expectations it must meet and its eval cases live in the
database and move together.

## Goals

- The library is edited from `/admin/library`; a publish reaches every instance on the next
  request.
- The engine only ever sees a complete, validated library.
- A publish never leaves stored athlete data pointing at something that no longer exists.
- Every published library is kept, with author, date and note; any of them can be restored.
- A publish is checked against the library's own expectations, not only its structure.
- A clone runs with the demo library: `pnpm dev`, `pnpm test`, CI and `pnpm eval`.

## Non-goals

- Editing the vocabulary (sites, mechanisms, equipment, stimulus enums): it stays in code, in
  `src/lib/domain/types.ts` and `src/lib/engine/types.ts`.
- Several admins, roles or per-coach libraries.
- Translating library content.
- Structured forms for every field (see "Follow-ups").

## Storage

```prisma
model DomainLibraryVersion {
  id                String    @id @default(cuid())
  number            Int       @unique
  basedOnVersionId  String?
  revision          Int       @default(0)
  movements         Json
  contraindications Json
  taxonomy          Json
  conversions       Json
  expectations      Json
  evalCases         Json
  renames           Json      @default("[]")
  note              String?
  createdByUserId   String?
  publishedByUserId String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  publishedAt       DateTime?
}

/// Single row (id = 1): which version is live and which one is being edited.
model DomainLibraryState {
  id                 Int       @id @default(1)
  publishedVersionId String?
  draftVersionId     String?
  lastExportedAt     DateTime?
}
```

A version is a complete snapshot. The library is heavily cross-referenced (substitutes,
`avoidMovements`, conversion movements, expectations), integrity is checked on the whole of it,
publishing has to be atomic, and snapshots give history and rollback for free. With one admin,
rewriting the draft on every save is cheap; `revision` catches edits from two tabs.

A pointer row instead of a `status` column makes "at most one draft, exactly one published"
structural, and the per-request read a primary-key lookup. A version's state is derived: live,
draft or archived.

Rules (`src/lib/training/services/library.ts`, `library-publish.ts`):

- **Edit:** the first edit copies the live version into a new draft (`basedOnVersionId` set).
  Every save sends the `revision` it read; a mismatch is refused.
- **Publish** runs in one transaction that locks the state row:
  1. the draft is still based on the live version;
  2. the validator and the reference checks run inside the transaction;
  3. pending renames are applied to stored references;
  4. the pointer moves, the draft pointer clears and an audit row is written.
- **Restore** and **Import** create a new draft; history only moves forward. Versions are never
  deleted.
- The first publish on an empty database takes the same path with no base version.

## Reading path

`getDomainData()` in `src/lib/domain/repository.ts` is the only entry point for the engine,
the athlete pages, the training services and the scripts.

1. It reads `DomainLibraryState.publishedVersionId`, wrapped in React `cache()` so a request
   reads it once however many callers it has.
2. `createLibraryReader` (`library-reader.ts`) keeps the latest library in memory by version id.
   It caches the promise, so concurrent requests share one load; a failed load is dropped and
   retried on the next call.
3. With no published version it throws `LibraryUnavailableError`. There is no fallback to the
   demo library and no "sample mode" switch: such a switch is one misconfiguration away from
   production.

`TailoredWorkout.libraryVersion` stores the version number that produced each saved result.

## Validation on publish

`validateLibrary(library)` (`src/lib/domain/validate-library.ts`) returns findings. An **error**
blocks the publish; a **warning** needs an explicit "publish anyway".

Errors:

- duplicate movement names or aliases (case-insensitive), duplicate contraindication keys,
  duplicate eval case ids;
- substitutes, `avoidMovements` and conversion movements that name no movement;
- taxonomy keys that differ from the stimulus enums;
- a site annotated on a movement that no contraindication blocks;
- a site carrying a mid-range mechanism together with its end-range grade;
- expectations that name an unknown movement or contraindication, or that fail.

Warnings: a movement without substitutes, a hanging movement without grip stress, a
contraindication that leaves fewer than five movements available.

### Expectations

Expectations are content: they belong to the library version and are edited with it. Each one
pins a result the curated library must keep, and the validator evaluates them on every publish:

| Kind | Checks |
|------|--------|
| `verdict` | the verdict (`ok`, `caution`, `avoid`, `not_avoid`) of movements under a contraindication, severity and side |
| `substitutes` | a movement's substitute list starts with or includes given names |
| `stress` | a movement does or does not stress a site (optionally with a mechanism) |
| `field` | a movement's equipment, patterns or positions equal or include values |
| `resolves` | a piece of workout text resolves to a movement |
| `candidates` | the substitute candidates under conditions and equipment: first, included, excluded |

Tests pin mechanics on invented fixtures (`tests/helpers/library-builders.ts`); a result that
depends on the library's content is an expectation, not a test.

### Eval cases

Eval cases call the LLM, so they are not run at publish. `pnpm eval` reads them from the
published version of the database in `DATABASE_URL`.

## References from stored data

| Stored reference | Where |
|------------------|-------|
| Contraindication keys | `AthleteProfile.data.injuries` |
| Movement names | `PersonalRecord.movement`; barbell `Block.movement`; `AthleteProfile.data.benchmarks[]`, `goals[]` |
| Lift status | records and barbell blocks only accept barbell movements (`isLiftMovement`) |

`referenceFindings` refuses a publish, listing the counts, when the draft:

- removes a contraindication key used by an athlete profile;
- removes a movement name used by a record, a barbell block or a profile benchmark or goal,
  unless a rename covers it;
- takes `barbell` out of a movement that records or blocks use.

**Renames.** Name lookups are exact, so an alias does not carry stored references. A rename is an
explicit draft operation: it renames the movement, keeps the old name as an alias so pasted
workouts still resolve, updates every mention in the draft (substitutes, contraindications,
conversions, expectations) and queues `{ from, to }` in `renames`. The publish
transaction rewrites `PersonalRecord.movement`, barbell `Block.movement` and the profiles'
benchmarks and goals.

History (`TailoredWorkout`, `UnrecognizedMovement.resolvedTo`) never blocks a publish. An
unknown contraindication key reaching the engine is ignored and logged as an error; the
reference checks make it unreachable in practice.

## Admin panel

`/admin/library`, built like the other admin pages (server actions behind `requireAdmin`,
`src/components/ui`, es/en messages):

- **Overview:** live version (number, date, author, note), draft status, Publish, Discard,
  Import, Export. A notice stays up while the latest export is older than the latest publish.
- **Movements** and **Contraindications:** searchable lists with a per-entry JSON editor,
  validated with `MovementSchema` / `ContraindicationSchema` on save; add, delete, rename.
- **Taxonomy, Conversions, Expectations, Eval cases:** a JSON editor per document.
- **Versions:** every version with its note; restore as draft; export.
- **Publish:** shows the findings next to their entry and requires a note.

Import and Export use one file format (`LibraryExportSchema`: `format`, `number`, `exportedAt`,
`library`). Publish, discard, import, restore and rename write an `AdminAuditLog` row
(`library.*`, target type `library`).

## Demo library

`data/sample/library.json` is a small library in the export format: 15 movements, 3
contraindications, a few expectations and one eval case. It is a demo, not a subset of a real
library; its rules may be simplified.

- `pnpm domain:import <file>` imports a library file as a draft and publishes it through the
  same publish function. It refuses to run unless the host in `DATABASE_URL` is
  `DOMAIN_IMPORT_HOST` from the local `.env`, read with the parser `pg` connects with.
- `pnpm check:content` (also in CI) fails when a JSON file under `data/` is not the demo
  library, or when the demo library grows past its caps.
- Service tests publish a fixture library through the real publish path after each reset
  (`tests/helpers/db.ts`).

## Follow-ups

- Structured forms for movements and contraindications, and a diff between draft and live.
- From the unrecognized-movements queue, create a movement in the draft with its name filled in.
