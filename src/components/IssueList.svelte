<script lang="ts">
  import type { Issue } from '../pipeline/issue'

  let { issues }: { issues: readonly Issue[] } = $props()
</script>

{#if issues.length > 0}
  <ul class="issues">
    {#each issues as issue, i (i)}
      <li class={issue.severity}>
        {#if issue.line !== undefined}<span class="line">Line {issue.line}</span>{/if}
        {issue.message}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .issues {
    list-style: none;
    margin: 1rem 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }

  li {
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--warning);
    background: var(--surface);
    font-size: 0.9rem;
  }

  li.error {
    border-left-color: var(--error);
  }

  .line {
    font-family: var(--mono);
    color: var(--muted);
    margin-right: 0.5rem;
  }
</style>
