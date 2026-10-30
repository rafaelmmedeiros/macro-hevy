<script lang="ts">
  import type { HevyAccount } from './hevy/account'
  import { dateRange } from './pipeline/group'
  import ConnectHevy from './steps/ConnectHevy.svelte'
  import ImportCsv from './steps/ImportCsv.svelte'
  import type { LoadedCsv } from './wizard'

  const STEPS = ['Import CSV', 'Connect Hevy', 'Match exercises', 'Review and import']

  let step = $state(0)
  let csv = $state.raw<LoadedCsv | null>(null)
  let account = $state.raw<HevyAccount | null>(null)

  const earliestDate = $derived(csv ? dateRange(csv.workouts)?.first : undefined)

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
  {:else}
    <section>
      <h2>Match exercises</h2>
      <p>Coming next.</p>
      <div class="actions">
        <button class="secondary" onclick={() => (step = 1)}>Back</button>
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
