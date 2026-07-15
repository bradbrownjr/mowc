<script lang="ts">
  import { healthState } from "$lib/health.svelte";

  const versionLabel = $derived(
    healthState.status === "ready" && healthState.health ? `v${healthState.health.version}` : "offline"
  );
</script>

<footer class="footer">
  <p class="line">Unofficial fan project. Not affiliated with or endorsed by Evil Hat Productions.</p>
  <p class="line">MOWC (c) 2026 Brad Brown - MIT Licensed - {versionLabel}</p>
</footer>

<style>
  .footer {
    margin-top: var(--space-12);
    padding: var(--space-4) var(--space-6) var(--space-8);
    border-top: 1px solid var(--border);
    text-align: center;
  }

  .line {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .line + .line {
    margin-top: var(--space-1);
  }
</style>
