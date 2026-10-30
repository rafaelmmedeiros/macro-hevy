# MacroFactor to Hevy

Import your MacroFactor workout history into Hevy, straight from your browser.

Drop the CSV that MacroFactor exports, paste your Hevy API key, check how each exercise is
matched, review the workouts, and import them. There is nothing to install, no account to
create, and no server in between.

## Privacy

- The CSV is read in your browser and never uploaded anywhere.
- Your Hevy API key stays in the page's memory and is sent only to `api.hevyapp.com`. It is
  never saved, and it is gone when you close the tab.
- There is no backend. The app is a static page that talks to the Hevy API directly.

## What you need

- MacroFactor's workout log export, a CSV file. In MacroFactor, go to **Data Export → Granular
  Export**, scroll down to **Logs**, choose how many days to include, and tap **Export Workout
  Log**. Other MacroFactor exports won't work.
- Hevy Pro, which the Hevy API requires, and an API key from
  [hevy.com/settings?developer](https://hevy.com/settings?developer).

## How it works

1. **Import CSV.** Drop the file from **Export Workout Log** (Data Export → Granular Export →
   Logs). You see how many workouts and sets it has, their dates, and any rows that couldn't be
   read.
2. **Connect Hevy.** Paste your API key. The app checks it and loads your exercises and recent
   workouts.
3. **Match exercises.** Each MacroFactor exercise goes to a Hevy exercise. Most are matched
   automatically, and you can change any of them.
4. **Review and import.** Each workout shows as new, already in Hevy, or a possible duplicate.
   Choose a start time and whether the workouts are private, then import one workout or all the
   selected ones.

**Try one workout first.** The app can't undo an import: to remove a workout, delete it in Hevy.
After you delete it, press "Reload from Hevy" and it shows up as new again.

## What gets imported

- **Title and description.** The day in parentheses becomes the title
  (`Push/Pull/Legs/Upper/Lower (Push)` → `Push`), and the program name goes in the description.
- **An import line in the description,** like `Imported from MacroFactor · 2026-10-19 · e76e6e49 · 1`:
  the date, a code for the workout name, and the workout's number on that day. That line is how
  the app recognizes workouts it already imported, so importing an overlapping export again never
  creates duplicates. Leave it in place.
- **The MacroFactor exercise name** in each exercise's notes, like `MacroFactor: 45° Leg Press`.
- **Weights** include the machine or sled base weight that MacroFactor logs separately. Dumbbell
  weights go in as exported.
- **RPE** is 10 − RIR when Hevy accepts the result (6 to 10, in half steps). Otherwise it's left
  empty.
- **Warm-up sets** stay warm-up sets.
- **Times.** The export only has dates, so you choose the start time. Each workout ends after its
  MacroFactor duration.

Workouts that are already in Hevy are never changed.

## Exercise matching

MacroFactor's exercise names are very specific (`Neutral Grip Plate-Loaded Machine Row`) and rarely
match Hevy's. [`src/data/exercise-mapping.json`](src/data/exercise-mapping.json) maps them to Hevy's
built-in exercises. Variants collapse onto the common Hevy exercise, since Hevy's stats and
leaderboards group by exercise, and the precise MacroFactor name stays in the notes.

An entry can also name a custom exercise. If your Hevy account has a custom exercise with exactly
that title, it is used instead of the built-in one.

The mapping only covers the exercises seen so far. If some of yours are missing, pick them in
step 3, and consider adding them to the mapping (see Contributing).

## Limitations

- Only exports in kilograms have been seen. Exports in pounds are handled based on a guess at their
  column names.
- Only the `Standard Set` and `Warm-Up Set` types have been seen. Other set types are imported as
  normal sets, with a warning.
- The app can't create a Hevy custom exercise yet. Create it in Hevy, connect again, and pick it in
  step 3.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev      # http://localhost:5173/macro-hevy/ (on Windows, dev.bat also opens the browser)
npm test
npm run check    # type-check
npm run build
```

The import pipeline is plain TypeScript in [`src/pipeline/`](src/pipeline): parse the CSV, group sets
into workouts, match exercises, build the Hevy requests, and compare with what's already in Hevy.
Every stage is pure and tested offline. All network access goes through
[`src/hevy/client.ts`](src/hevy/client.ts). [`CLAUDE.md`](CLAUDE.md) has the detailed rules and the
reasoning behind them.

## Contributing

Mapping entries are the most useful contribution. Each one maps a MacroFactor name to a Hevy
built-in exercise:

```json
"Neutral Grip Plate-Loaded Machine Row": { "id": "AA1EB7D8", "title": "Iso-Lateral Row (Machine)" }
```

- Get IDs and titles from `GET /v1/exercise_templates` in the
  [Hevy API](https://api.hevyapp.com/docs/).
- Choose by movement, not by name. The file name at the end of each template's `thumbnail_url`
  describes the exact movement.
- Keep the entries sorted by name. `npm test` checks the file's format.
- Never commit a MacroFactor export, since it contains personal training data. Tests use small
  synthetic CSVs written in the test code.

## License

[MIT](LICENSE). This project is not affiliated with MacroFactor or Hevy.
