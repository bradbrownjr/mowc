<script lang="ts">
  import type { Snippet } from "svelte";

  // Guidance-copy pattern (docs/DESIGN.md "Guidance copy"): a short helper
  // note that reads like a margin annotation in the case file. Placed
  // directly under the heading or label it explains; the copy is passed as
  // children so callers can include inline markup (e.g. a glossary term).
  let { children }: { children: Snippet } = $props();
</script>

<p class="field-note">{@render children()}</p>

<style>
  .field-note {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-style: italic;
    line-height: 1.4;
  }
</style>
