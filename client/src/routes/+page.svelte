<script lang="ts">
  import { resolve } from "$app/paths";
  import { healthState } from "$lib/health.svelte";
  import { sessionState } from "$lib/session.svelte";
</script>

<main class="page">
  <h1 class="title">MOWC</h1>
  <p class="tagline">A field notebook for your Monster of the Week campaign.</p>

  {#if healthState.status === "offline"}
    <p class="offline-notice">Offline. Could not reach the server.</p>
  {/if}

  <div class="cta-row">
    {#if sessionState.user}
      <a class="cta cta-primary" href={resolve("/campaigns")}>My campaigns</a>
      <a class="cta" href={resolve("/packs")}>Content packs</a>
    {:else if sessionState.status === "ready"}
      <a class="cta cta-primary" href={resolve("/login")}>Log in</a>
      <a class="cta" href={resolve("/register")}>Register</a>
    {/if}
  </div>
</main>

<style>
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .tagline {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .offline-notice {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .cta {
    min-height: var(--tap-min);
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .cta-primary {
    border-color: var(--accent);
    color: var(--accent);
  }

  .cta:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
