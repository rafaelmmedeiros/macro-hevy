<script lang="ts">
  import mapping from './data/exercise-mapping.json'
  import type { HevyAccount } from './hevy/account'
  import { dateRange, exerciseNames } from './pipeline/group'
  import { resolveExercises } from './pipeline/resolve'
  import ConnectHevy from './steps/ConnectHevy.svelte'
  import ImportCsv from './steps/ImportCsv.svelte'
  import MatchExercises from './steps/MatchExercises.svelte'
  import ReviewImport from './steps/ReviewImport.svelte'
  import type { LoadedCsv } from './wizard'

  const STEPS = ['Import CSV', 'Connect Hevy', 'Match exercises', 'Review and import']

  let step = $state(0)
  let csv = $state.raw<LoadedCsv | null>(null)
  let account = $state.raw<HevyAccount | null>(null)
  // MacroFactor exercise name → Hevy template ID the user picked. Kept across CSVs.
  let choices = $state.raw(new Map<string, string>())

  const earliestDate = $derived(csv ? dateRange(csv.workouts)?.first : undefined)
  const names = $derived(csv ? exerciseNames(csv.workouts) : [])
  const resolved = $derived(account ? resolveExercises(names, account.templates, mapping, choices) : null)

  function choose(name: string, templateId: string | null) {
    const next = new Map(choices)
    if (templateId === null) next.delete(name)
    else next.set(name, templateId)
    choices = next
  }

  function loadCsv(loaded: LoadedCsv) {
    csv = loaded
    // The Hevy workouts were loaded for the old file's dates.
    account = null
  }
</script>

<main>
  <header>
    <h1>MacroFactor to Hevy</h1>
    <ol class="steps">
      {#each STEPS as label, i (label)}
        <li class:current={i === step} class:done={i < step}>{label}</li>
      {/each}
    </ol>
  </header>

  {#if step === 0}
    <ImportCsv {csv} onload={loadCsv} onnext={() => (step = 1)} />
  {:else if step === 1 && earliestDate}
    <ConnectHevy
      {earliestDate}
      {account}
      onconnect={(a) => (account = a)}
      onback={() => (step = 0)}
      onnext={() => (step = 2)}
    />
  {:else if step === 2 && account && resolved}
    <MatchExercises
      {names}
      resolutions={resolved.resolutions}
      issues={resolved.issues}
      templates={account.templates}
      onchoose={choose}
      onback={() => (step = 1)}
      onnext={() => (step = 3)}
    />
  {:else if step === 3 && csv && account && resolved && earliestDate}
    <ReviewImport
      workouts={csv.workouts}
      resolutions={resolved.resolutions}
      {account}
      {earliestDate}
      onback={() => (step = 2)}
    />
  {:else}
    <section>
      <p>Something is missing for this step.</p>
      <div class="actions">
        <button onclick={() => (step = 0)}>Start over</button>
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 44rem;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 1rem;
    font-size: 1.5rem;
  }

  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .steps li {
    counter-increment: step;
  }

  .steps li::before {
    content: counter(step) '. ';
  }

  .steps li.current {
    color: var(--text);
    font-weight: 600;
  }

  .steps li.done {
    color: var(--accent);
  }
</style>
