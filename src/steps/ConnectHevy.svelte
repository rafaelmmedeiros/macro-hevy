<script lang="ts">
  import { connect, describeError, type HevyAccount } from '../hevy/account'

  let {
    earliestDate,
    account,
    onconnect,
    onback,
    onnext,
  }: {
    /** The earliest workout date in the CSV; Hevy workouts from then on are loaded. */
    earliestDate: string
    account: HevyAccount | null
    onconnect: (account: HevyAccount | null) => void
    onback: () => void
    onnext: () => void
  } = $props()

  // Held only until the key is accepted. After that, only the Hevy client keeps it.
  let apiKey = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    error = null
    try {
      onconnect(await connect(apiKey, earliestDate))
      apiKey = ''
    } catch (e) {
      error = describeError(e)
    } finally {
      busy = false
    }
  }
</script>

<section>
  <h2>Connect your Hevy account</h2>
  <p>
    Paste your Hevy API key. You can create one at
    <a href="https://hevy.com/settings?developer" target="_blank" rel="noreferrer">hevy.com/settings?developer</a>,
    and it needs Hevy Pro. The key stays in this tab's memory, is only sent to Hevy, and is gone
    when you close the tab.
  </p>

  {#if account}
    <p class="summary">
      Connected as <strong>{account.user.name}</strong> (@{account.user.username}).
      Loaded {account.templates.length} exercises and {account.workouts.length} workouts from around
      {earliestDate} on.
    </p>
    <div class="actions">
      <button class="secondary" onclick={onback}>Back</button>
      <button class="secondary" onclick={() => onconnect(null)}>Use another key</button>
      <button onclick={onnext}>Next</button>
    </div>
  {:else}
    <form {onsubmit}>
      <!-- Not type="password": browsers offer to save a password field once its form goes away,
           and the key must never be saved. CSS masks it instead, and the data attributes tell
           password manager extensions to leave it alone. -->
      <input
        type="text"
        class="masked"
        bind:value={apiKey}
        aria-label="Hevy API key"
        placeholder="1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
        disabled={busy}
      />
      <button type="submit" disabled={busy || apiKey.trim() === ''}>{busy ? 'Checking…' : 'Connect'}</button>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="secondary" onclick={onback}>Back</button>
    </div>
  {/if}
</section>

<style>
  form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  input {
    flex: 1 1 18rem;
    min-width: 0;
    font-family: var(--mono);
  }

  .masked:not(:placeholder-shown) {
    -webkit-text-security: disc;
  }

  .error {
    color: var(--error);
  }
</style>
