# Marcas: one place for every athlete record

## Intent

Today an athlete's best marks live in two places:
- The "RMs" tab (`PersonalRecord`): barbell 1RMs in kg, with history.
- The "Marcas" section of the profile (`AthleteProfile.data.benchmarks`): max reps and times, with no history. A time has no distance.

So the concept "my best mark" is split in two, and a time with no distance is useless to the AI.

This change:
- moves every record into the RMs tab, renamed "Marcas";
- supports three kinds of record, all with history;
- removes the profile section.

## Goals

- One screen for every record, split into three sub-tabs so it stays short.
- Records the AI and the athlete can both read without guessing: a lift has its reps, a cardio time has its distance,
  and a gymnastic set has its added load.
- The 1RM used for percentage blocks can also come from multi-rep sets, estimated with Epley and labelled as an estimate.
- Only records that say something about the athlete's fitness and are common benchmarks, chosen in the library.

## Non-goals

- Benchmark WODs (Fran, Murph…). They are a later phase.
- Free distances, calories or rep counts for lifts and cardio: they come from fixed lists.
- Metres or calories covered in a set time as cardio records, and max-time holds as gymnastic records.
- Coach-side views of records. These stay unchanged: the admin still only counts them.
- Renaming the route, the `prs` i18n namespace or `pr-actions`. Only the labels change.

## Anti-goals

- An estimate shown or used as if it were a real 1RM.
- Comparing marks that are not comparable: a 3RM with a 1RM, 18 strict pull-ups with 8 at +20 kg, or a 2 km row with a 5 km row.

## The records catalog

Not every movement deserves a record. A record is worth keeping when it tells something about the athlete's fitness
and is a common benchmark: nobody chases a max of air squats or a 1RM of a lunge. So the movements that accept a record
are chosen by hand, not derived from equipment and patterns.

The choice lives in a new library document, `records`, edited in `/admin/library/documents/records` and published with
the rest of the library. It is the only source of truth: no list in code, tests or docs (tests use `Test …` fixtures,
examples use the demo library in `data/sample/library.json`).

```ts
type RecordsCatalog = {
  lift: RecordGroup<{ movement: string }>[];
  gymnastics: RecordGroup<{ movement: string; measure: "reps"; weighted: boolean } | { movement: string; measure: "distance" }>[];
  cardio: RecordGroup<{ movement: string; targets: ({ distanceM: number } | { calories: number })[] }>[];
};
type RecordGroup<E> = { label: { en: string; es: string }; entries: E[] };
```

- Each sub-tab shows its groups and entries in catalog order. A group's label is shown only when the sub-tab has more
  than one group.
- Every entry names a movement of the same library. Renames apply to the catalog at publish, as they do to goals.
- Validation (a publish error, like the other reference checks):
  - every movement exists;
  - a movement appears at most once in the whole catalog;
  - a `lift` entry is a barbell movement;
  - a cardio entry has at least one target, targets are positive integers and none repeats.
- The athlete never chooses the kind: the entry decides it.

### Record kinds

| Sub-tab | Catalog entry | Row kind | Fields | Better is |
|---|---|---|---|---|
| Levantamientos | `lift` | `lift` | `kg` + `reps`; `reps` ∈ `REP_OPTIONS`; `0 < kg ≤ 500` | heavier at the same reps |
| Gimnásticos | `measure: "reps"` | `reps` | `reps` (1–500); `kg` (0–200] only when the entry is `weighted`, else null | more reps at the same added load |
| Gimnásticos | `measure: "distance"` | `distance` | `distanceM` (1–1000), unbroken | longer |
| Cardio | `targets` | `time` | `seconds` (1–86400) + exactly one of `distanceM` / `calories`, which must be one of the entry's targets | lower time for the same target |

- `REP_OPTIONS = [1, 2, 3, 5, 8, 10]` stays in code: it is a mechanic (Epley stays reasonable up to 10), not library
  content. `DISTANCE_OPTIONS` and the `recordKind` classifier are removed.
- Assisted (negative) load is out of scope.
- The targets are checked on the server only, so editing the catalog needs no migration.

### Records always match the catalog

The app is in development, so records that no longer fit are deleted rather than kept around:

- At publish, inside the publish transaction, every record is deleted when its movement is not in the new catalog, its
  kind is not the entry's kind, or its fields don't fit the entry (a target the entry no longer lists, a load on an
  entry that is not `weighted`). Renames are applied first, so a renamed movement keeps its records.
- Before publishing, the draft's findings include a warning with how many records that publish would delete, per
  movement.
- So every stored record matches the published catalog, and the list, the movement page and the engine read records
  with no filtering or fallbacks. `/prs/[movement]` is a 404 for a movement outside the catalog.
- The log's PR offer only appears for a lift in the catalog.
- My call: a coach can still program percentage sets on any barbell movement. When it's outside the catalog the athlete
  has no 1RM for it, so the load shows as a percentage only, as it does today for an athlete with no 1RM.

### Initial content

The first catalog goes into a library draft on the dev database; the admin reviews it and publishes it. The movements it
names that the library lacks are added in the same draft, with their stresses, substitutes and contraindication data:
Sumo Deadlift, Hang Squat Snatch, Muscle Snatch, Muscle Clean, Power Clean & Jerk, Strict Bar Muscle-up, Strict Ring
Muscle-up and Dip. The entries themselves were agreed in conversation and go straight into that draft; per
AGENTS.md they are not copied into this document.

My calls on the draft:
- Group labels: Sentadilla / Squats, Peso muerto / Deadlifts, Presses, Snatch, Clean & Jerk; Con lastre / Weighted,
  Máximas repeticiones / Max reps, Distancia / Distance. Cardio is a single unlabelled group.
- The new movements' stresses, substitutes and contraindication data are written by the builder, modelled on their
  closest existing movements (Deadlift, Hang Power Snatch, Push Press, Bar Muscle-up, Ring Dip…), for the admin to
  review before publishing.
- The draft is written with a one-off script kept out of the repo, through the same service the admin editor uses. If
  an unpublished draft already exists, the catalog is added to it and the admin is told what else it holds.

Until a version with a catalog is published, every sub-tab is empty. Deploying before that publish is acceptable in the
closed beta.

## Data model (approach A)

`PersonalRecord` has typed columns:

- `kind`, an enum `lift | reps | distance | time`, always the kind of the movement's catalog entry.
- `kg Float?`, `reps Int?`, `distanceM Int?`, `calories Int?`, `seconds Int?`.
- A database check constraint, by kind (each wrapped so a NULL fails it):
  - `lift`: `kg` and `reps` set; the rest null.
  - `reps`: `reps` set; `distanceM`, `calories`, `seconds` null.
  - `distance`: `distanceM` set; the rest null.
  - `time`: `seconds` set and exactly one of `distanceM` / `calories`; `kg` and `reps` null.
  - Every value that is set is greater than 0.
- The index `[athleteId, movement]` stays.

On insert, the server finds the movement's catalog entry, checks the row's kind and fields against it and the bounds
above. This replaces `assertRecordKind`.

`DomainLibraryVersion` gains `records Json` with an empty catalog as default; `DomainLibrarySchema`, the export format
and `emptyLibrary()` include it.

The publish's `lift_in_use` check now only covers barbell blocks: records follow the catalog, and a `lift` entry must
be a barbell movement.

### Approaches considered

Which movements accept a record:
- **Catalog document in the library** (chosen): hand-picked, grouped and ordered by the admin, published and
  versioned with the rest of the library.
- **Derived from equipment and patterns** (the first version): no upkeep, but it let in every bodyweight and barbell
  movement, meaningful or not, and grouped them by pattern.
- **Record fields on each movement**: no new document, but groups and order would be scattered across movements.

How a row is stored:
- **A. Typed columns per kind** (chosen): every value has its real type, and the 1RM code keeps reading `kg` with
  `kind = lift`. The cost is nullable columns.
- **B. Generic `value` + `unit`**: more compact, but every reader has to interpret units, and the 1RM code would depend on `unit = kg`.
- **C. One table per kind**: a clean separation, but it triplicates services, actions and history screens that are nearly identical.

## Current 1RM

For a lift, the "current 1RM" is the highest of:
- every real 1RM (`reps = 1`);
- every Epley estimate `kg × (1 + reps / 30)` from rows with `reps > 1`, rounded **down** to 0.5 kg, to stay conservative.

On a tie, the real 1RM wins. If two rows tie on value, the later `achievedOn` wins. When the winner is an estimate, it
carries `estimated: true`, and its date is the date of the row it came from.

`oneRmMap` returns `Map<string, { kg: number; estimated: boolean }>`. Every caller is updated: home, the log page,
`adaptations.ts` (`applyAthleteLoads` uses `kg`) and `results.ts`.

The "estimado" label (en: "estimated") appears wherever a 1RM value or a load derived from it is shown:
- the current 1RM on `/prs` and `/prs/[movement]`;
- the percentage → kg lines on the home and log pages (`describeSets`), as a short "est." marker;
- the "from" value in the log's PR offer.

The current 1RM comes from `currentOneRm(rows)` in `src/lib/training/prs.ts`. `oneRmMap` computes it in code from the
lift rows, not with a `groupBy` `_max`.

### The log's PR offer

Today `singleAbove` only offers to record a single. It becomes `bestSetAbove(sets, rows)`:
- It considers the sets whose reps are in `REP_OPTIONS` and whose kg beats the athlete's best at that rep count, or
  that are the first record at that rep count.
- Among those, it offers **one** set: the one with the highest Epley estimate (a single counts as itself). On a tie,
  the fewer reps wins.
- The prompt becomes `{ movement, reps, from: number | null, to }`, where `from` is the previous best at that rep count.
- `addPrAction` takes `reps`.

## Screens

- Bottom nav and page title: "Marcas" (en: "Records"). Only the labels change.
- `/prs` has three sub-tabs: Levantamientos, Gimnásticos, Cardio.
  - It opens on Levantamientos, and the sub-tab lives in `?tab=lift|gymnastics|cardio`, so going back and links keep it.
  - Search filters the open sub-tab only.
  - Every sub-tab follows the catalog's groups and order.
  - Levantamientos: each row shows the current 1RM, labelled when estimated.
  - Gimnásticos: a reps entry shows the best bodyweight reps, or the best set with load if there is none at bodyweight;
    a distance entry shows the longest distance.
  - Cardio: each row shows the best time for the entry's first target that has a record, with that target (for example
    "2 km · 7:12" or "50 cal · 2:41").
- `/prs/[movement]` adapts to the kind:
  - lift: the current or estimated 1RM, the best per rep count (1RM, 2RM, 3RM…), the add form (kg + reps select +
    date) and the full history.
  - reps: the best per added load, bodyweight first; the add form (reps, kg only when the entry is weighted, date);
    the history.
  - distance: the longest distance; the add form (metres + date); the history.
  - time: the best per target; the add form (target select from the entry + time as `m:ss` or `h:mm:ss` + date); the
    history.
- The links to a movement's page from the log page keep working as they do today.
- Profile: the "Marcas" section, its hint and `prsLink` are removed.

## What the AI receives

`loadEngineProfile` builds `AthleteProfile.benchmarks` from the records. It sends only the best of each:
- lift: the current 1RM per movement, as `{ kind: "1rm", value, unit: "kg", estimated, recordedAt }`.
- reps: the best per movement and added load, as `{ kind: "max_reps", value, unit: "reps", addedKg: number | null, recordedAt }`.
  `null` means bodyweight.
- distance: the longest per movement, as `{ kind: "max_distance", value, unit: "meters", recordedAt }`.
- time: the best per movement and target, as `{ kind: "time", value, unit: "seconds", distanceM | calories, recordedAt }`.

Only rows of movements in the published catalog are sent.

There is no count cap; the closed-beta volumes are small.

`BenchmarkSchema` gains optional `estimated`, `addedKg`, `distanceM` and `calories`, and the kind `max_distance`. The
tailor prompt's benchmark sentence adds four points:
- an estimated 1RM is a conservative guide;
- max reps are unbroken reps at the stated added load;
- a time is for the stated distance or calories;
- a max distance is unbroken.

## Profile schema

`benchmarks` stops being part of what is stored:
- `AthleteProfileSchema` (the engine input) keeps `benchmarks`.
- A new `StoredProfileSchema = AthleteProfileSchema.omit({ benchmarks: true })` is what is read and written in
  `AthleteProfile.data`. Unknown keys are stripped, so a profile JSON that still has `benchmarks` parses fine and loses it.
- `normalizeProfile` returns a stored profile.
- `/api/profile` validates the PUT body with the stored schema, so a `benchmarks` field is ignored.
- `ProfileForm` edits a stored profile.
- `library-publish`'s `storedProfiles` and its renames handle goals only. Record renames and "in use" counts already
  cover `PersonalRecord`.
- `loadEngineProfile` returns `{ ...storedProfile, benchmarks: fromRecords }`.

## Migration

The first records migration has not reached production, so it is rewritten instead of adding a second one. The dev
database is reset from production before applying it. Old data is dropped rather than converted:

1. Create the `RecordKind` enum (`lift | reps | distance | time`), add the columns and make `kg` nullable. Backfill
   existing rows as `kind = lift, reps = 1`. Add the check constraint.
2. Remove the `benchmarks` key from every profile's JSON. Max reps and times stored there are dropped, not converted.
3. Add `records Json` to `DomainLibraryVersion`, defaulting to an empty catalog
   (`{"lift":[],"gymnastics":[],"cardio":[]}`), so every existing version parses.

The existing 1RMs survive until the first publish with a catalog, which deletes those outside it.

## Left to the builder

- The time input widget.
- Empty states.
- Copy beyond the names above.
- Visual layout of the sub-tabs, following the existing tab components if there are any.
