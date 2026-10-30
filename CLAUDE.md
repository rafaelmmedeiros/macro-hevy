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

Discovery. There is no code and no tooling yet, so there are no build, lint or test commands.
Don't make them up. Add them here when they exist.

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
  through a single Hevy client module.
- **There is no undo.** The API has no `DELETE` for workouts, so a bad import can only be fixed
  by hand in the Hevy app. Every write must come after a preview the user has confirmed.

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
  Hevy has no base-weight concept, so the total goes in.
- **Two-dumbbell exercises are exported as the total of both dumbbells** (Seated Dumbbell
  Overhead Press at 28 kg means 2 × 14 kg). Hevy follows the same convention, so the number
  goes in as it is, with no doubling or halving.
- **Title and description:** the title is the day name in parentheses at the end of `Workout`
  (`Push/Pull/Legs/Upper/Lower (Push)` → `Push`). If there are no parentheses, the title is
  the whole name. The program name (`Push/Pull/Legs/Upper/Lower`) goes in the description,
  next to the import marker.
- **RIR → RPE:** `rpe = 10 − RIR`. Hevy only accepts `6, 7, 7.5, 8, 8.5, 9, 9.5, 10`. Any
  other result, including RIR ≥ 5, becomes `null`. Don't round to the nearest allowed value.
- **Set types:** `Standard Set` → `normal`, `Warm-Up Set` → `warmup`. An unknown type becomes
  `normal` and shows a warning in the preview. Don't infer `failure` from RIR 0.
- **Distance and time:** `Duration` → `duration_seconds`. `Distance short (m)` and
  `Distance long (km)` × 1000 → `distance_meters`, which is an integer.
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
   which workouts to import and sets the start time, either one for all or one per workout.
5. **Import.** A progress view, then a result for each workout.

Step 2 has to come before steps 3 and 4: matching needs the account's custom templates, and
the review step needs the workouts already in Hevy.

## Deduplication without a database

Users will re-import overlapping exports, and that must never create duplicates.

- **Each workout gets a stable import key** built from date, workout name, and that name's
  ordinal on that date. The key must not depend on set content, so editing a workout in
  MacroFactor later doesn't turn it into a "new" one. The key is written as a marker line in
  the Hevy workout description.
- **Before any write, collect existing markers.** Page through `GET /v1/workouts`, which
  returns newest first with at most 10 per page, until `start_time` is older than the
  earliest date in the CSV. Workouts whose marker is already there are skipped.
- **Unmarked same-day workouts are conflicts.** A Hevy workout on the same date without a
  marker was probably logged by hand. Show it as a conflict in the preview instead of skipping
  or importing silently.

## Exercise matching

Resolution order:

1. A curated mapping file in the repo (MacroFactor name → Hevy built-in template ID). The
   community can extend it through PRs.
2. The user's existing custom templates, matched by exact title.
3. The user picks a template in the UI, or the tool creates a custom template with
   `POST /v1/exercise_templates`. That request needs `exercise_type`, `equipment_category`
   and `muscle_group`.

Creating a custom template has to be idempotent: check by title first. Accounts have a cap on
custom exercises (`403 exceeds-custom-exercise-limit`).

The set fields that are valid depend on the template's `type` (`weight_reps`, `reps_only`,
`bodyweight_reps`, `duration`, `distance_duration`, …). Build each set to fit its target
template.

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

- Are built-in template IDs the same across all accounts? The curated mapping depends on it.
