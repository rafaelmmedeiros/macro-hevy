<script lang="ts">
  import type { HevyExerciseTemplate } from '../hevy/types'

  let {
    templates,
    onpick,
    oncancel,
  }: {
    templates: readonly HevyExerciseTemplate[]
    onpick: (templateId: string) => void
    oncancel: () => void
  } = $props()

  let query = $state('')

  const sorted = $derived([...templates].sort((a, b) => a.title.localeCompare(b.title)))
  const matches = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return sorted.filter((t) => words.every((w) => t.title.toLowerCase().includes(w))).slice(0, 60)
  })
</script>

<div class="picker">
  <input
    type="search"
    bind:value={query}
    placeholder="Search Hevy exercises, like “leg press” or “curl cable”"
    aria-label="Search Hevy exercises"
    {@attach (node) => node.focus()}
  />
  <ul>
    {#each matches as template (template.id)}
      <li>
        <button type="button" class="option" onclick={() => onpick(template.id)}>
          {template.title}
          <span class="meta">{template.equipment}{template.is_custom ? ' · your custom exercise' : ''}</span>
        </button>
      </li>
    {:else}
      <li class="empty">No Hevy exercise matches “{query}”.</li>
    {/each}
  </ul>
  <div class="actions">
    <button type="button" class="secondary" onclick={oncancel}>Cancel</button>
  </div>
</div>

<style>
  .picker {
    margin-top: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  input {
    width: 100%;
    box-sizing: border-box;
  }

  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
  }

  .option {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.4rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
  }

  .option:hover,
  .option:focus-visible {
    background: var(--surface);
  }

  .meta,
  .empty {
    color: var(--muted);
    font-size: 0.875rem;
  }

  .empty {
    padding: 0.4rem 0.5rem;
  }

  .actions {
    margin-top: 0.5rem;
  }
</style>
