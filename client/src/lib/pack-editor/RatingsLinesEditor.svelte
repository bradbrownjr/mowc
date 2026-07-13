<script lang="ts">
  import { RatingSchema, type RatingsLine } from "@mowc/shared";
  import Icon from "$lib/Icon.svelte";
  import { Plus, Trash2 } from "@lucide/svelte";

  interface Props {
    lines: RatingsLine[];
  }

  let { lines = $bindable() }: Props = $props();

  function addLine(): void {
    lines.push({ charm: 0, cool: 0, sharp: 0, tough: 0, weird: 0 });
  }

  function removeLine(index: number): void {
    lines.splice(index, 1);
  }
</script>

<div class="lines">
  {#each lines as line, index (index)}
    <div class="line">
      {#each RatingSchema.options as rating (rating)}
        <label class="rating-field">
          <span class="rating-label">{rating}</span>
          <input type="number" bind:value={line[rating]} />
        </label>
      {/each}
      <button type="button" class="icon-button" onclick={() => removeLine(index)} aria-label="Remove ratings line">
        <Icon icon={Trash2} size={18} />
      </button>
    </div>
  {/each}
  <button type="button" class="add-button" onclick={addLine}>
    <Icon icon={Plus} size={18} />
    Add ratings line
  </button>
</div>

<style>
  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .line {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .rating-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 4.5rem;
  }

  .rating-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input[type="number"] {
    min-height: var(--tap-min);
    padding: var(--space-2);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .icon-button,
  .add-button {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .add-button {
    align-self: flex-start;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .icon-button:focus-visible,
  .add-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
