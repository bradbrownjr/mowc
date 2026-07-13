<script lang="ts">
  import { HealthzResponseSchema, type HealthzResponse } from "@mowc/shared";
  import { resolve } from "$app/paths";

  let health = $state<HealthzResponse | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    fetch("/healthz")
      .then((res) => res.json())
      .then((data) => {
        health = HealthzResponseSchema.parse(data);
      })
      .catch(() => {
        error = "Offline. Could not reach the server.";
      });
  });
</script>

<main>
  <h1 class="title">MOWC</h1>
  {#if health}
    <p class="meta">Status: {health.status} / Version: {health.version}</p>
  {:else if error}
    <p class="meta">{error}</p>
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
