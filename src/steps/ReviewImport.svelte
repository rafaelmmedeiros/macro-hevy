<script lang="ts">
  import IssueList from '../components/IssueList.svelte'
  import { describeError, type HevyAccount } from '../hevy/account'
  import { importWorkouts, planImport, type ImportOutcome } from '../hevy/importer'
  import type { HevyWorkout } from '../hevy/types'
  import { diffWorkouts, type WorkoutDiff } from '../pipeline/diff'
  import type { Workout } from '../pipeline/group'
  import { buildWorkout, localStartTime, splitWorkoutName } from '../pipeline/payload'
  import type { Resolution } from '../pipeline/resolve'

  let {
    workouts,
    resolutions,
    account,
    earliestDate,
    onback,
  }: {
    workouts: readonly Workout[]
    resolutions: ReadonlyMap<string, Resolution>
    account: HevyAccount
    earliestDate: string
    onback: () => void
  } = $props()

  type RowOutcome = ImportOutcome | { status: 'importing' }

  const STATUS_LABELS = { new: 'New', imported: 'Already in Hevy', conflict: 'Possible duplicate' }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

  // Workouts reloaded from Hevy before and after every import. Until then, what step 2 loaded.
  let reloaded = $state.raw<HevyWorkout[] | null>(null)
  let defaultTime = $state('18:00')
  let timePerWorkout = $state(false)
  let times = $state<Record<string, string>>({})
  let isPrivate = $state(false)
  // Only the user's own ticks; untouched rows follow their status.
  let picks = $state<Record<string, boolean>>({})
  let outcomes = $state<Record<string, RowOutcome>>({})
  let busy = $state(false)
  let error = $state<string | null>(null)

  const diffs = $derived(diffWorkouts(workouts, resolutions, reloaded ?? account.workouts, timeZone))

  const timeFor = (key: string) => (timePerWorkout ? (times[key] ?? defaultTime) : defaultTime)

  // The POST body per workout, or null while its start time is invalid.
  const payloads = $derived(
    new Map(
      diffs.map((d) => {
        const startTime = localStartTime(d.workout.date, timeFor(d.key))
        return [d.key, startTime ? buildWorkout(d.workout, resolutions, { startTime, isPrivate }) : null]
      }),
    ),
  )

  const isPicked = (d: WorkoutDiff) => d.status.kind !== 'imported' && (picks[d.key] ?? d.status.kind === 'new')
  const pickedKeys = $derived(diffs.filter(isPicked).map((d) => d.key))
  const canImport = (key: string) => payloads.get(key)?.workout != null
  const count = (kind: WorkoutDiff['status']['kind']) => diffs.filter((d) => d.status.kind === kind).length

  function describeWorkouts(hevyWorkouts: readonly HevyWorkout[]): string {
    return hevyWorkouts.map((w) => `“${w.title}” at ${clock.format(new Date(w.start_time))}`).join(', ')
  }

  function describeOutcome(outcome: RowOutcome): string {
    switch (outcome.status) {
      case 'importing': return 'Importing…'
      case 'imported': return 'Imported into Hevy.'
      case 'failed': return `Failed: ${outcome.error}`
      case 'skipped': return `Not imported: ${outcome.reason}`
    }
  }

  async function reload() {
    busy = true
    error = null
    try {
      reloaded = await account.client.workoutsSince(earliestDate)
      outcomes = {}
    } catch (e) {
      error = describeError(e)
    } finally {
      busy = false
    }
  }

  async function run(keys: readonly string[]) {
    const ready = keys.filter(canImport)
    if (ready.length === 0) return
    const what = ready.length === 1 ? 'this workout' : `these ${ready.length} workouts`
    const visibility = isPrivate ? 'private' : 'public'
    const question = `Import ${what} into Hevy as ${visibility}?\n\nThere is no undo here. To remove an imported workout, delete it in the Hevy app.`
    if (!confirm(question)) return

    // Conflicts the user saw and chose anyway; one that appears only after the reload is held back.
    const acceptedConflicts = new Set(diffs.filter((d) => d.status.kind === 'conflict' && ready.includes(d.key)).map((d) => d.key))
    busy = true
    error = null
    try {
      reloaded = await account.client.workoutsSince(earliestDate)
      const plan = planImport(diffWorkouts(workouts, resolutions, reloaded, timeZone), new Set(ready), acceptedConflicts)
      for (const [key, reason] of plan.skipped) outcomes[key] = { status: 'skipped', reason }
      for (const key of plan.keys) outcomes[key] = { status: 'importing' }
      const items = plan.keys.map((key) => ({ key, workout: payloads.get(key)!.workout! }))
      await importWorkouts(account.client, items, (key, outcome) => (outcomes[key] = outcome))
      reloaded = await account.client.workoutsSince(earliestDate)
    } catch (e) {
      error = describeError(e)
    } finally {
      busy = false
    }
  }
</script>

<section>
  <h2>Review and import</h2>
  <p class="summary">
    {count('new')} new, {count('imported')} already in Hevy, {count('conflict')} possible duplicates.
    Try one workout first: if it looks wrong in Hevy, delete it in the app, press “Reload from Hevy”,
    and import it again.
  </p>

  <fieldset class="options" disabled={busy}>
    <label>Start time <input type="time" bind:value={defaultTime} /></label>
    <label><input type="checkbox" bind:checked={timePerWorkout} /> Set a start time for each workout</label>
    <label><input type="checkbox" bind:checked={isPrivate} /> Import as private workouts</label>
    <p class="hint">
      Times are in your time zone ({timeZone}). Each workout ends after its MacroFactor duration.
      Public workouts show up in your followers' feeds.
    </p>
  </fieldset>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <ul class="workouts">
    {#each diffs as d (d.key)}
      {@const payload = payloads.get(d.key)}
      {@const outcome = outcomes[d.key]}
      {@const name = splitWorkoutName(d.workout.name)}
      {@const sets = d.workout.exercises.reduce((n, e) => n + e.sets.length, 0)}
      <li class={d.status.kind}>
        <div class="row">
          <label class="pick">
            <input
              type="checkbox"
              checked={isPicked(d)}
              disabled={busy || d.status.kind === 'imported'}
              onchange={(e) => (picks[d.key] = e.currentTarget.checked)}
            />
            <span><strong>{d.workout.date}</strong> · {name.title}</span>
          </label>
          <span class="badge {d.status.kind}">{STATUS_LABELS[d.status.kind]}</span>
        </div>
        <p class="details">
          {d.workout.exercises.length} exercises · {sets} sets · {Math.round(d.workout.durationSeconds / 60)} min{name.program ? ` · ${name.program}` : ''}
        </p>

        {#if d.status.kind === 'imported'}
          <p class="details">In Hevy as {describeWorkouts([d.status.existing])}.</p>
        {:else}
          {#if d.status.kind === 'conflict'}
            <p class="conflict">
              Hevy already has {describeWorkouts(d.status.conflicts)} on this date, with some of the same
              exercises. It may be this workout logged by hand, so this one isn't selected. Select it only
              if it's a different workout.
            </p>
          {/if}
          {#if d.status.others.length > 0}
            <p class="details">Also in Hevy that day: {describeWorkouts(d.status.others)}.</p>
          {/if}
          <div class="row-actions">
            {#if timePerWorkout}
              <input
                type="time"
                value={timeFor(d.key)}
                oninput={(e) => (times[d.key] = e.currentTarget.value)}
                aria-label="Start time for {d.workout.date} {name.title}"
                disabled={busy}
              />
            {/if}
            <button class="secondary" disabled={busy || !payload?.workout} onclick={() => run([d.key])}>Import this one</button>
          </div>
          {#if payload}
            <IssueList issues={payload.issues} />
          {:else}
            <p class="error">Set a valid start time.</p>
          {/if}
        {/if}

        {#if outcome}<p class="outcome {outcome.status}">{describeOutcome(outcome)}</p>{/if}
      </li>
    {/each}
  </ul>

  <div class="actions">
    <button class="secondary" disabled={busy} onclick={onback}>Back</button>
    <button class="secondary" disabled={busy} onclick={reload}>Reload from Hevy</button>
    <button disabled={busy || !pickedKeys.some(canImport)} onclick={() => run(pickedKeys)}>
      Import selected ({pickedKeys.filter(canImport).length})
    </button>
  </div>
</section>

<style>
  .options {
    display: grid;
    gap: 0.5rem;
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .options label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hint,
  .details {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .workouts {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .workouts > li {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.8rem;
    border: 1px solid var(--border);
  }

  .badge.new {
    border-color: var(--accent);
    color: var(--accent);
  }

  .badge.conflict {
    border-color: var(--warning);
    color: var(--warning);
  }

  .badge.imported {
    color: var(--muted);
  }

  .conflict {
    margin: 0.5rem 0 0;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--warning);
    background: var(--surface);
    font-size: 0.875rem;
  }

  .row-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .row-actions button {
    padding: 0.25rem 0.75rem;
  }

  .outcome {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
  }

  .outcome.imported {
    color: var(--accent);
  }

  .outcome.failed,
  .error {
    color: var(--error);
  }

  .outcome.skipped {
    color: var(--warning);
  }
</style>
