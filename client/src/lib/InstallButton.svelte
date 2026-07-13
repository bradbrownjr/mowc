<script lang="ts">
  import { installState, promptInstall } from "$lib/pwa.svelte";
</script>

{#if installState.available}
  <button class="install" type="button" onclick={promptInstall}>Install</button>
{/if}

<style>
  .install {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    color: var(--ink);
    border: 2px solid var(--accent);
    border-radius: var(--radius-md);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .install:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
