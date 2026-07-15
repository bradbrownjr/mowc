<script lang="ts">
  import { resolve } from "$app/paths";
  import { healthState } from "$lib/health.svelte";
</script>

<main>
  <h1 class="title">MOWC</h1>
  {#if healthState.status === "ready" && healthState.health}
    <p class="meta">Status: {healthState.health.status} / Version: {healthState.health.version}</p>
  {:else if healthState.status === "offline"}
    <p class="meta">Offline. Could not reach the server.</p>
  {:else}
    <p class="meta">Checking server...</p>
  {/if}
  <a class="nav-link" href={resolve("/packs")}>Content packs</a>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-6);
  }

  .nav-link {
    color: var(--accent);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .title {
    margin: 0 0 var(--space-4);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .meta {
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
</style>
