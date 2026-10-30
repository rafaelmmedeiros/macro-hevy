<script lang="ts">
  import IssueList from '../components/IssueList.svelte'
  import { dateRange, groupWorkouts } from '../pipeline/group'
  import { parseExport } from '../pipeline/parse'
  import type { LoadedCsv } from '../wizard'

  let {
    csv,
    onload,
    onnext,
  }: {
    csv: LoadedCsv | null
    onload: (csv: LoadedCsv) => void
    onnext: () => void
  } = $props()

  let dragging = $state(false)

  const range = $derived(csv ? dateRange(csv.workouts) : null)
  const setCount = $derived(
    csv?.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0) ?? 0,
  )

  async function load(file: File) {
    const { rows, issues } = parseExport(await file.text())
    onload({ fileName: file.name, workouts: groupWorkouts(rows), issues })
  }

  function onchange(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0]
    if (file) void load(file)
  }

  function ondrop(event: DragEvent) {
    event.preventDefault()
    dragging = false
    const file = event.dataTransfer?.files[0]
    if (file) void load(file)
  }

  function ondragover(event: DragEvent) {
    event.preventDefault()
    dragging = true
  }
</script>

<section>
  <h2>Import your MacroFactor export</h2>
  <ol class="how">
    <li>In MacroFactor, go to <strong>Data Export → Granular Export</strong>.</li>
    <li>Scroll down to <strong>Logs</strong>, choose how many days to include, and tap <strong>Export Workout Log</strong>.</li>
    <li>Drop that CSV here. Other MacroFactor exports won't work.</li>
  </ol>
  <p class="note">The file is read in your browser and never uploaded anywhere.</p>

  <label class="drop" class:dragging {ondragover} ondragleave={() => (dragging = false)} {ondrop}>
    <input type="file" accept=".csv,text/csv" {onchange} />
    {#if csv}
      <span><strong>{csv.fileName}</strong> · choose another file</span>
    {:else}
      <span>Drop the CSV here, or click to choose it</span>
    {/if}
  </label>

  {#if csv}
    {#if range}
      <p class="summary">
        <strong>{csv.workouts.length}</strong> workouts and {setCount} sets, from {range.first} to {range.last}.
      </p>
    {/if}
    <IssueList issues={csv.issues} />
    {#if csv.workouts.length === 0}
      <p class="note">
        No workouts found. Make sure this is the file from <strong>Export Workout Log</strong>, as described above.
      </p>
    {/if}
    <div class="actions">
      <button disabled={csv.workouts.length === 0} onclick={onnext}>Next</button>
    </div>
  {/if}
</section>

<style>
  .how {
    padding-left: 1.25rem;
  }

  .note {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .drop {
    position: relative;
    display: block;
    padding: 2rem 1rem;
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    text-align: center;
    color: var(--muted);
    cursor: pointer;
  }

  .drop:hover,
  .drop.dragging,
  .drop:focus-within {
    border-color: var(--accent);
    color: var(--text);
  }

  .drop input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
</style>
