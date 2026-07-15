<script lang="ts">
  import { RatingSchema, type MoveDef } from "@mowc/shared";
  import Icon from "$lib/Icon.svelte";
  import { Plus, Trash2 } from "@lucide/svelte";
  import { generateUuid } from "$lib/uuid.js";
  import ConversionNote from "./ConversionNote.svelte";

  interface Props {
    moves: MoveDef[];
    /** Conversion notes for the move at this index (packs/convert review only). */
    notesForIndex?: (index: number) => string[];
  }

  let { moves = $bindable(), notesForIndex }: Props = $props();

  function addMove(): void {
    moves.push({ id: generateUuid(), name: "", trigger: "", rating: null, outcomes: null, tags: [] });
  }

  function removeMove(index: number): void {
    moves.splice(index, 1);
  }

  function onRatingChange(move: MoveDef, value: string): void {
    move.rating = value === "" ? null : (value as MoveDef["rating"]);
    if (move.rating === null) {
      move.outcomes = null;
    } else if (move.outcomes === null) {
      move.outcomes = { full: "", mixed: "", miss: "" };
    }
  }

  function tagsToText(tags: string[]): string {
    return tags.join(", ");
  }

  function onTagsChange(move: MoveDef, value: string): void {
    move.tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
</script>

<div class="moves">
  {#each moves as move, index (move.id)}
    <div class="move">
      <div class="row">
        <label class="field grow">
          <span class="field-label">Move name</span>
          <input type="text" bind:value={move.name} />
        </label>
        <button type="button" class="icon-button" onclick={() => removeMove(index)} aria-label="Remove move">
          <Icon icon={Trash2} size={18} />
        </button>
      </div>

      <label class="field">
        <span class="field-label">Trigger</span>
        <textarea bind:value={move.trigger} rows="2"></textarea>
      </label>

      <label class="field">
        <span class="field-label">Rating</span>
        <select value={move.rating ?? ""} onchange={(e) => onRatingChange(move, e.currentTarget.value)}>
          <option value="">No roll</option>
          {#each RatingSchema.options as rating (rating)}
            <option value={rating}>{rating}</option>
          {/each}
        </select>
      </label>

      {#if move.outcomes}
        <label class="field">
          <span class="field-label">10+ (full success)</span>
          <textarea bind:value={move.outcomes.full} rows="2"></textarea>
        </label>
        <label class="field">
          <span class="field-label">7-9 (mixed success)</span>
          <textarea bind:value={move.outcomes.mixed} rows="2"></textarea>
        </label>
        <label class="field">
          <span class="field-label">Miss</span>
          <textarea bind:value={move.outcomes.miss} rows="2"></textarea>
        </label>
      {/if}

      <label class="field">
        <span class="field-label">Tags (comma separated)</span>
        <input type="text" value={tagsToText(move.tags)} onchange={(e) => onTagsChange(move, e.currentTarget.value)} />
      </label>

      {#if notesForIndex}
        {#each notesForIndex(index) as note (note)}
          <ConversionNote {note} />
        {/each}
      {/if}
    </div>
  {/each}
  <button type="button" class="add-button" onclick={addMove}>
    <Icon icon={Plus} size={18} />
    Add move
  </button>
</div>

<style>
  .moves {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .move {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .grow {
    flex: 1;
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input[type="text"],
  select,
  textarea {
    min-height: var(--tap-min);
    padding: var(--space-2);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  textarea {
    resize: vertical;
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
