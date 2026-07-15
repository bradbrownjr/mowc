<script lang="ts">
  /**
   * The "Conversion flags" motif (docs/DESIGN.md): renders one
   * conversionNotes string from the admin PDF-conversion pipeline
   * (formatConversionNote, shared/src/schemas/conversion.ts) as a bordered
   * callout. Grammar: "<fieldPath>: <message>", optionally followed by a
   * blank line then a verbatim source excerpt.
   */
  import Icon from "$lib/Icon.svelte";
  import { Flag } from "@lucide/svelte";

  interface Props {
    note: string;
  }

  let { note }: Props = $props();

  let parts = $derived.by(() => {
    const [head, ...rest] = note.split("\n\n");
    const colonIdx = head.indexOf(":");
    const message = colonIdx === -1 ? head : head.slice(colonIdx + 1).trim();
    const excerpt = rest.join("\n\n").trim();
    return { message, excerpt: excerpt.length > 0 ? excerpt : null };
  });
</script>

<div class="conversion-note">
  <Icon icon={Flag} size={16} />
  <div class="body">
    <p class="message">{parts.message}</p>
    {#if parts.excerpt}
      <pre class="excerpt">{parts.excerpt}</pre>
    {/if}
  </div>
</div>

<style>
  .conversion-note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    color: var(--ink);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .message {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .excerpt {
    margin: 0;
    padding: var(--space-2);
    overflow-x: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    color: var(--ink-muted);
    white-space: pre-wrap;
  }
</style>
