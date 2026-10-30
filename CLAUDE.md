# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

The maintainer talks in Portuguese. Everything that lands in the repository is in English: code,
identifiers, comments, docs, UI text, commit messages, issue and PR text. Answer in Portuguese in
chat, but write English in files.

## What this is

An open-source tool that imports MacroFactor workout exports (CSV) into Hevy through the
Hevy public API. A user drops the CSV, pastes their Hevy API key, reviews a preview, and
imports. Nobody has to install anything, and there is no backend and no database. The key is
never stored anywhere.

## Status

Early development. The four wizard steps work end to end (`src/steps/`, wired in
`src/App.svelte`) on top of the pure pipeline stages in `src/pipeline/` and the Hevy modules in
`src/hevy/` (client, account connection, importer). Not built yet: creating a custom exercise
from the matching step, and the planned ways for the mapping to grow. The first real import ran
on 2026-10-30 (one workout), and what Hevy stored matched the built payload field by field.

## Commands

- `npm install`: needs Node 22.12 or newer (Vite 8).
- `npm run dev`: dev server at `http://localhost:5173/macro-hevy/`. On Windows, `dev.bat`
  installs dependencies when `node_modules` is missing, starts it, and opens the browser.
  `.bat` files are kept with CRLF line endings (`.gitattributes`).
- `npm test`: runs every test once with Vitest. `npm run test:watch` keeps them running. One
  file: `npx vitest run src/pipeline/parse.test.ts`. One test: add `-t "<test name>"`.
- `npm run check`: type-checks Svelte and TypeScript (`svelte-check`, then `tsc` for the config).
- `npm run build`: production build in `dist/`, with the base path `/macro-hevy/` for GitHub Pages.

There is no linter or formatter yet.

## Architecture

- **Static browser app on GitHub Pages, built with Vite, TypeScript and Svelte.** This was checked on
  2026-10-30: the Hevy API answers CORS preflights with `Access-Control-Allow-Origin: *` and
  allows the `api-key` header, so the browser can call `api.hevyapp.com` directly with no proxy.
  If Hevy ever tightens CORS, this decision has to be revisited. Don't add a server to work
  around it without asking first.
- **The API key lives in memory only.** Never write it to `localStorage`, URLs or logs, and
  never send it anywhere except `api.hevyapp.com`.
- **The pipeline is made of pure stages:** parse CSV → group into workouts → resolve exercises
  → build Hevy payloads → diff against what is already in Hevy → execute. Every stage before
  execute is pure and can be tested offline against fixture CSVs. All network access goes
  through a single Hevy client module, `src/hevy/client.ts`, whose tests use a fake `fetch`.
- **Stages live in `src/pipeline/`**, each with its `*.test.ts` next to it. They report problems
  as `Issue`s (`src/pipeline/issue.ts`) instead of throwing, so the preview can show them.
- **There is no undo.** The API has no `DELETE` for workouts, so a bad import can only be fixed
  by hand in the Hevy app. `PUT /v1/workouts/{workoutId}` can overwrite a workout, but nothing
  can remove one. Every write must come after a preview the user has confirmed.

## MacroFactor export format

Columns: `Date, Workout Duration, Workout, Exercise, Exercise Base Weight (kg), Set Type,
Weight (kg), Reps, RIR, Duration, Distance short (m), Distance long (km)`.

- **One row per set.** There is no workout ID and no start time. A workout is a run of
  consecutive rows that share `(Date, Workout Duration, Workout)`. Exercises are ordered by
  first appearance and sets by row order.
- **The file is double-encoded UTF-8 (mojibake).** The BOM shows up as `ï»¿` inside a quoted
  header cell (`"ï»¿""Date"""`), and `°` becomes `Â°` (`45Â° Leg Press`). To repair it, encode
  the decoded text back to Latin-1/CP-1252 bytes and decode those as UTF-8. Only do this when
  the pattern is detected, so a correctly encoded export still works. Read columns by
  normalized header name, never by position.
- **Lines end in CRLF and the last row has no line break after it.** Only the header has quoted
  cells.
- `Workout Duration` is in seconds. `Workout` is `Program (Day)`, for example
  `Push/Pull/Legs/Upper/Lower (Push)`.
- **Units are part of the header names.** Only kg appears in the sample. An account set to
  imperial units probably exports different headers, so parse the unit from each header and
  convert to kg.
- **Set types seen so far:** `Standard Set` and `Warm-Up Set`. Other values exist but haven't
  been observed. `RIR` is empty on warm-up sets.
- **Exercise names come from MacroFactor's own catalog** and are very specific
  (`Neutral Grip Plate-Loaded Machine Row`). They almost never match Hevy titles as written.

All `*.csv` files are gitignored because exports contain personal training data.
`MacroFactor-20261030170536.csv` at the root is the maintainer's local reference export and
exists on their machine only. Tests must use small synthetic CSV content defined in the test
code, and that content has to reproduce the encoding quirks above.

## Conversion rules

- **`weight_kg` = `Weight` + `Exercise Base Weight`**, with an empty base counting as 0.
  MacroFactor logs the base weight of a machine or sled separately (45° Leg Press: 53.5 kg).
  Hevy has no base-weight concept, so the total goes in. It's rounded to the gram to clear
  floating-point noise.
- **Two-dumbbell exercises are exported as the total of both dumbbells** (Seated Dumbbell
  Overhead Press at 28 kg means 2 × 14 kg). Hevy follows the same convention, so the number
  goes in as it is, with no doubling or halving.
- **Title and description:** the title is the day name in parentheses at the end of `Workout`
  (`Push/Pull/Legs/Upper/Lower (Push)` → `Push`). If there are no parentheses, the title is
  the whole name. The description has the program name (`Push/Pull/Legs/Upper/Lower`), when
  there is one, followed by a line that starts with `Imported from MacroFactor`. That line also
  carries the import marker (see Deduplication). People read it in the Hevy app, so keep it
  readable.
- **Exercise notes:** every exercise in an imported workout gets `MacroFactor: <exercise name>`
  in its `notes`, always, so the precise MacroFactor name survives even when several MacroFactor
  exercises share one Hevy template. Two MacroFactor exercises that resolve to the same template
  in one workout stay separate entries.
- **RIR → RPE:** `rpe = 10 − RIR`. Hevy only accepts `6, 7, 7.5, 8, 8.5, 9, 9.5, 10`. Any
  other result, including RIR ≥ 5, becomes `null`. Don't round to the nearest allowed value.
- **Set types:** `Standard Set` → `normal`, `Warm-Up Set` → `warmup`. An unknown type becomes
  `normal` and shows a warning in the preview. Don't infer `failure` from RIR 0.
- **Distance and time:** `Duration` → `duration_seconds`. `Distance short (m)` or
  `Distance long (km)` × 1000 → `distance_meters`, both integers. If a set has both distances,
  the short one is used and the preview shows a warning.
- **Privacy:** `is_private` is the user's choice in the review step. Backfilled workouts can
  flood followers' feeds, so don't hard-code it.
- **Start time:** the CSV only has a date. During import the user sets one time of day for
  all workouts, or a time for each workout. The time is read in the browser's timezone, and
  `end_time` is `start_time + Workout Duration`. Since the time is the user's choice and can
  differ between imports, deduplication must never rely on timestamps.

## User flow

A step-by-step wizard:

1. **Import CSV.** The user drops the file. It is parsed, and a summary shows the number of
   workouts, the date range, and any warnings.
2. **API key.** The user pastes the key. It is checked with `GET /v1/user/info`, and the
   account is shown.
3. **Match exercises.** Exercises that resolve automatically are listed. Each unresolved one
   needs a pick or a new custom exercise.
4. **Review.** Each workout is marked as new, already imported, or conflict. The user chooses
   which workouts to import, sets the start time (one for all or one per workout), and chooses
   whether the imported workouts are private.
5. **Import.** Each workout has its own import button, and there is one to import every selected
   workout at once. A progress view, then a result for each workout. Importing a single workout
   first is the safe way to try the tool: if it looks wrong in Hevy, delete it in the app and
   import it again, since a deleted workout takes its marker with it and shows up as new.
   Reload the workouts from Hevy before every write, so statuses reflect deletions and earlier
   imports.

Step 2 has to come before steps 3 and 4: matching needs the account's custom templates, and
the review step needs the workouts already in Hevy.

## Deduplication without a database

Users will re-import overlapping exports, and that must never create duplicates.

- **Each workout gets a stable import key** built from date, workout name, and that name's
  ordinal on that date. The key must not depend on set content, so editing a workout in
  MacroFactor later doesn't turn it into a "new" one. The key goes in the description's marker
  line, `Imported from MacroFactor · 2026-10-19 · e76e6e49 · 1`: date, 32-bit FNV-1a of the
  UTF-8 workout name as 8 hex digits, ordinal (`src/pipeline/marker.ts`). **Never change this
  format once workouts have been imported with it**, or earlier imports stop being recognized.
  If someone deletes that line in Hevy, the workout counts as unmarked, and the conflict rule
  below still catches it.
- **Before any write, collect existing markers.** Page through `GET /v1/workouts` (at most 10
  per page). It sorts by `created_at`, newest first, **not** by `start_time`: on 2026-10-30 a
  workout imported that day for 2026-10-19 came back at the top of page 1. So stop once a whole
  page was created more than a day before the earliest CSV date; a workout is created after it
  starts, so nothing further down can be newer. Stopping on `start_time` would miss markers
  behind a batch of backfilled old workouts. Workouts whose marker is already there are skipped.
- **An unmarked same-day workout is a conflict only if it shares an exercise template** with
  the workout being imported. That one was probably logged by hand, so show it as a conflict in
  the preview instead of skipping or importing silently. Other unmarked workouts on that date
  (a separate cardio session, say) are listed for information and don't block anything. Many
  users log cardio as its own Hevy workout on strength days, so flagging every same-day workout
  would turn most of an import into conflicts.
- **Same date means the same calendar date in the browser's time zone.** Hevy's `start_time` is
  UTC, and a workout at 22:30 in São Paulo is already the next day in UTC, so convert before
  comparing with CSV dates (`src/pipeline/diff.ts`).

## Exercise matching

Resolution order (`src/pipeline/resolve.ts`):

1. The template the user picked in the UI for that exercise.
2. The curated mapping, `src/data/exercise-mapping.json`: MacroFactor name → `{ id, title }` of
   a Hevy built-in template, sorted by name. The community extends it through PRs. An entry is
   used only when the account has that template ID. When the account's title differs from the
   entry's, the entry is still used and the preview shows a warning, since titles could be
   renamed or localized.
3. The user's custom templates, matched by exact title to the MacroFactor name.
4. Otherwise the exercise is unresolved. The user picks a template, or the tool creates a custom
   template with `POST /v1/exercise_templates`. That request needs `exercise_type`,
   `equipment_category` and `muscle_group`.

**Mapping entries centralize.** People who import into Hevy mostly use it for its social side
and leaderboards, which group by template, so MacroFactor's fine-grained variants collapse onto
the common Hevy template for the movement: `Reverse V-Squat` and `V-Squat` both go to Squat
(Machine), and grips or cable attachments don't get templates of their own. The MacroFactor name
is kept in the exercise notes. Many-to-one entries are expected.

**How the mapping grows (planned, not built).** The maintainer uses the tool first, so the
mapping starts with their exercises. Anyone else's unmapped exercises fall through to the
matching step, so nobody is blocked. Later, all still in the browser with no backend: rank Hevy
templates by keywords (equipment, movement) so a pick is one click; remember the user's picks in
`localStorage` (MacroFactor name → template ID only, never the API key) so re-imports don't ask
again; and offer a "suggest these mappings" link that opens a prefilled GitHub issue with the
JSON entries for the maintainer to review.

To choose a mapping entry, look at the movement, not the name. Each template's `thumbnail_url`
ends in a file name that describes the exact movement (`Lever-Neutral-Grip-Seated-Row-(plate-loaded)`
is Iso-Lateral Row (Machine)), which settles most ambiguous cases.

Creating a custom template has to be idempotent: check by title first. Accounts have a cap on
custom exercises (`403 exceeds-custom-exercise-limit`).

`GET /v1/exercise_templates` lists built-in and custom templates together (about 450, at most
100 per page) and flags custom ones with `is_custom`. Built-in IDs are 8-character codes such
as `79D0BB3A`. Custom IDs are UUIDs.

The set fields that are valid depend on the template's `type`. Build each set to fit its target
template (the table is in `src/pipeline/payload.ts`). Values the template doesn't record are left
out with a warning. A type the tool doesn't know gets every value, also with a warning. `GET` returns `weight_reps`, `reps_only`, `bodyweight_weighted`, `bodyweight_assisted`,
`duration`, `distance_duration`, `short_distance_weight`, `floors_duration` and
`steps_duration`. `POST` uses other names for some of them (`CustomExerciseType` in the spec:
`bodyweight_reps`, `bodyweight_assisted_reps`, `weight_duration`, …), so don't send a type read
from `GET` back to `POST` without mapping it.

## Hevy API

- **Base URL and auth:** base URL `https://api.hevyapp.com`, with an `api-key` header (UUID).
  The API is for Hevy Pro accounts only. Users get a key at `https://hevy.com/settings?developer`.
  `GET /v1/user/info` is a cheap way to check that a key works.
- **The spec has no standalone JSON file.** The OpenAPI document is embedded as `swaggerDoc` in
  `https://api.hevyapp.com/docs/swagger-ui-init.js`. Hevy labels the API v0.0.1 and warns that
  it may change without notice. Check the spec before relying on behavior that isn't listed
  here.

## Open questions

Don't treat these as settled:

- **Are built-in template IDs the same across all accounts?** The curated mapping depends on it.
  Very likely yes, but nobody has compared two accounts yet. What was found on 2026-10-30:
  built-in IDs are short codes and some look hand-typed (`32HKJ34K`, `9373FSD1`), so they don't
  seem to be generated per account. Hevy's own spec uses `D04AC939` as an example, and in the
  maintainer's account that is Squat (Barbell). A third-party Hevy CLI uses `79D0BB3A` for the
  bench press in its "Push Day" example, and in the maintainer's account that is Bench Press
  (Barbell). If this turns out wrong, resolution still fails visibly: an ID the account lacks
  leaves the exercise unresolved, and an ID that names another exercise there triggers the
  title-mismatch warning in the preview.
- **What type is the ID that `POST /v1/exercise_templates` returns?** The spec says integer, but
  custom template IDs are UUIDs. The client accepts both. Check on the first real creation.