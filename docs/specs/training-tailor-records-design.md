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

## Non-goals

- Benchmark WODs (Fran, Murph…). They are a later phase.
- Free distances or free rep counts for lifts and cardio: both come from fixed lists.
- Calories, or metres covered in a set time, as cardio records.
- Coach-side views of records. These stay unchanged: the admin still only counts them.
- Renaming the route, the `prs` i18n namespace or `pr-actions`. Only the labels change.

## Anti-goals

- An estimate shown or used as if it were a real 1RM.
- Comparing marks that are not comparable: a 3RM with a 1RM, 18 strict pull-ups with 8 at +20 kg, or a 2 km row with a 5 km row.

## Record kinds

The published library decides which kind of record a movement accepts. The athlete never chooses it. One shared
classifier, `recordKind(movement): "lift" | "reps" | "time" | null`, lives in `src/lib/training/records.ts`. The sub-tabs,
validation, the detail page and the engine input all use it.

The rules are applied in this order:
1. Equipment includes `barbell` → `lift`. This is today's `isLift`.
2. Equipment includes `jump_rope` → `reps`. Single-unders and double-unders are counted as unbroken reps, though the
   library files them as `monostructural`.
3. Any pattern is `monostructural` → `time`.
4. Equipment includes none of `dumbbell`, `kettlebell`, `sandbag`, `d_ball`, `wall_ball` (`LOAD_EQUIPMENT`) → `reps`.
   Every other equipment (`pullup_bar`, `rings`, `box`, `ghd`, `band`, `rope`, `jump_rope`, `bench`, `ramp`, and the
   ergs when the movement is not monostructural) is bodyweight equipment.
5. Otherwise `null`: the movement accepts no record.

| Sub-tab | Kind | Fields | Bounds | Better is |
|---|---|---|---|---|
| Levantamientos | `lift` | `kg` + `reps`, both required | `reps` ∈ `REP_OPTIONS`; `0 < kg ≤ 500` | heavier at the same reps |
| Gimnásticos | `reps` | `reps` required, `kg` optional (added load; null = bodyweight) | `1 ≤ reps ≤ 500`; `0 < kg ≤ 200` | more reps at the same added load |
| Cardio | `time` | `distanceM` + `seconds` | `distanceM` ∈ `DISTANCE_OPTIONS`; `1 ≤ seconds ≤ 86400` | lower time at the same distance |

- `REP_OPTIONS = [1, 2, 3, 5, 8, 10]`. My call: the usual xRM counts, and Epley stays reasonable up to 10.
- `DISTANCE_OPTIONS = [500, 1000, 2000, 5000, 10000]` metres, the same for every cardio movement. My call.
- Assisted (negative) load is out of scope. A banded pull-up is a different library movement.
- The fixed lists are checked on the server only. The database check constraint enforces the field shape per kind and
  that values are positive. That way, changing a list needs no migration.

## Data model (approach A)

`PersonalRecord` gains typed columns:

- `kind`, an enum `lift | reps | time`. It is stored on the row, so re-categorising a movement in the library doesn't
  change what its history means.
- `kg Float?`, `reps Int?`, `distanceM Int?`, `seconds Int?`.
- A database check constraint, by kind:
  - `lift`: `kg` and `reps` are set; `distanceM` and `seconds` are null.
  - `reps`: `reps` is set; `distanceM` and `seconds` are null.
  - `time`: `distanceM` and `seconds` are set; `kg` and `reps` are null.
  - Every value that is set is greater than 0.
- The index `[athleteId, movement]` stays.

On insert, the server checks that the row's kind equals `recordKind` of the movement in the published library, and that
the bounds above hold. This replaces `assertLiftMovement`.

### When the library changes a movement's kind

A publish is allowed, and the rows keep their stored kind. Everything below reads the stored kind of the rows, not the
library:
- A movement shows in the sub-tab of its library kind. It also shows in the sub-tab of any kind it has rows of.
- `/prs/[movement]` opens if the movement has a library kind or has rows. It shows the rows grouped by their stored
  kind, and every row can be deleted. The add form only offers the library's current kind; there is no form if that kind is null.
- The engine input includes rows by their stored kind.

The publish's existing `lift_in_use` check stays as it is. No new publish checks.

### Approaches considered

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
  - It opens on Levantamientos, and the sub-tab lives in `?tab=lift|reps|time`, so going back and links keep it.
  - Search filters the open sub-tab only.
  - Levantamientos is grouped by pattern, as now. Each row shows the current 1RM, labelled when estimated.
  - Gimnásticos: each row shows the best bodyweight reps, or the best set with load if there is none at bodyweight.
  - Cardio: each row shows the best time at the shortest distance recorded, with that distance (for example "2 km · 7:12").
- `/prs/[movement]` adapts to the kind:
  - lift: the current or estimated 1RM, the best per rep count (1RM, 2RM, 3RM…), the add form (kg + reps select +
    date) and the full history.
  - reps: the best per added load, bodyweight first; the add form (reps + optional kg + date); the history.
  - time: the best per distance; the add form (distance select + time as `m:ss` or `h:mm:ss` + date); the history.
- The links to a movement's page from the log page keep working as they do today.
- Profile: the "Marcas" section, its hint and `prsLink` are removed.

## What the AI receives

`loadEngineProfile` builds `AthleteProfile.benchmarks` from the records. It sends only the best of each:
- lift: the current 1RM per movement, as `{ kind: "1rm", value, unit: "kg", estimated, recordedAt }`.
- reps: the best per movement and added load, as `{ kind: "max_reps", value, unit: "reps", addedKg: number | null, recordedAt }`.
  `null` means bodyweight.
- time: the best per movement and distance, as `{ kind: "time", value, unit: "seconds", distanceM, recordedAt }`.

There is no count cap; the closed-beta volumes are small.

`BenchmarkSchema` gains optional `estimated`, `addedKg` and `distanceM`. The tailor prompt's benchmark sentence adds
three points:
- an estimated 1RM is a conservative guide;
- max reps are unbroken reps at the stated added load;
- a time is for the stated distance.

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

One Prisma migration in SQL, run on deploy. It needs no library:

1. Add the enum and the columns. Backfill existing rows as `kind = lift, reps = 1`. Add the check constraint.
2. For every `AthleteProfile` whose user has an `AthleteAccount`, insert one `PersonalRecord` per `max_reps` benchmark:
   - `kind = reps`, `reps = floor(value)`, `kg = null`;
   - `achievedOn = recordedAt`, or the migration date when `recordedAt` is missing;
   - skip entries where `floor(value) < 1`;
   - copy duplicates as they are, since they become history.

   Every `max_reps` entry is copied whatever its movement. A row on a movement that isn't gymnastic in the library falls
   under "When the library changes a movement's kind": it stays visible on its movement page and can be deleted.
3. Drop `time` benchmarks (they have no distance; dropping them was agreed for the closed beta) and stored `1rm`
   benchmarks (already ignored). Drop the benchmarks of profiles with no `AthleteAccount`: those users have no records
   page and already get no PR-based benchmarks.
4. Remove the `benchmarks` key from every profile's JSON.

## Left to the builder

- The time input widget.
- Empty states.
- Copy beyond the names above.
- Visual layout of the sub-tabs, following the existing tab components if there are any.
