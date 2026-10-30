<script lang="ts">
  import IssueList from '../components/IssueList.svelte'
  import TemplatePicker from '../components/TemplatePicker.svelte'
  import type { HevyExerciseTemplate } from '../hevy/types'
  import type { Issue } from '../pipeline/issue'
  import type { Resolution } from '../pipeline/resolve'

  let {
    names,
    resolutions,
    issues,
    templates,
    onchoose,
    onback,
    onnext,
  }: {
    names: readonly string[]
    resolutions: ReadonlyMap<string, Resolution>
    issues: readonly Issue[]
    templates: readonly HevyExerciseTemplate[]
    /** A template ID, or null to drop the user's pick and go back to the automatic match. */
    onchoose: (name: string, templateId: string | null) => void
    onback: () => void
    onnext: () => void
  } = $props()

  const SOURCE_LABELS = { mapping: 'automatic', custom: 'your custom exercise', choice: 'your choice' }

  let picking = $state<string | null>(null)

  const unresolved = $derived(names.filter((name) => resolutions.get(name)?.status !== 'resolved'))
</script>

<section>
  <h2>Match exercises</h2>
  <p>
    Each MacroFactor exercise goes to a Hevy exercise. Most are matched automatically, and you can
    change any of them. The MacroFactor name is kept in the exercise notes in Hevy.
  </p>

  {#if unresolved.length > 0}
    <p class="summary">
      {unresolved.length} of {names.length} exercises still need a Hevy exercise. Choose one for each to continue.
    </p>
  {:else}
    <p class="summary">All {names.length} exercises are matched.</p>
  {/if}

  <IssueList {issues} />

  <ul class="matches">
    {#each names as name (name)}
      {@const resolution = resolutions.get(name)}
      <li class:unresolved={resolution?.status !== 'resolved'}>
        <div class="row">
          <div class="names">
            <span class="macrofactor">{name}</span>
            {#if resolution?.status === 'resolved'}
              <span class="hevy">
                → {resolution.template.title}
                <span class="source">
                  {SOURCE_LABELS[resolution.source]}{resolution.source === 'mapping' && resolution.template.is_custom ? ' · your custom exercise' : ''}
                </span>
              </span>
            {:else}
              <span class="hevy missing">→ no Hevy exercise yet</span>
            {/if}
          </div>
          <div class="row-actions">
            {#if resolution?.status === 'resolved' && resolution.source === 'choice'}
              <button class="secondary" onclick={() => onchoose(name, null)}>Undo</button>
            {/if}
            <button class="secondary" onclick={() => (picking = picking === name ? null : name)}>
              {resolution?.status === 'resolved' ? 'Change' : 'Choose'}
            </button>
          </div>
        </div>
        {#if picking === name}
          <TemplatePicker
            {templates}
            onpick={(id) => {
              onchoose(name, id)
              picking = null
            }}
            oncancel={() => (picking = null)}
          />
        {/if}
      </li>
    {/each}
  </ul>

  <div class="actions">
    <button class="secondary" onclick={onback}>Back</button>
    <button disabled={unresolved.length > 0} onclick={onnext}>Next</button>
  </div>
</section>

<style>
  .matches {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
  }

  .matches > li {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }

  .matches > li.unresolved {
    border-left: 3px solid var(--warning);
    padding-left: 0.75rem;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .names {
    display: grid;
    min-width: 0;
  }

  .macrofactor {
    font-weight: 600;
  }

  .hevy {
    color: var(--muted);
  }

  .hevy.missing {
    color: var(--warning);
  }

  .source {
    margin-left: 0.25rem;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .row-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .row-actions button {
    padding: 0.25rem 0.75rem;
  }
</style>
