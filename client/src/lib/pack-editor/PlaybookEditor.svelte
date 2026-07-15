<script lang="ts">
  import type { PlaybookDef } from "@mowc/shared";
  import RatingsLinesEditor from "./RatingsLinesEditor.svelte";
  import MovesEditor from "./MovesEditor.svelte";
  import GearChoicesEditor from "./GearChoicesEditor.svelte";
  import ConversionNote from "./ConversionNote.svelte";

  interface Props {
    playbook: PlaybookDef;
    /** Playbook-general conversion notes (packs/convert review only). */
    generalNotes?: string[];
    /** Conversion notes for the move at this index (packs/convert review only). */
    notesForMove?: (index: number) => string[];
  }

  let { playbook = $bindable(), generalNotes, notesForMove }: Props = $props();
</script>

<div class="playbook">
  <label class="field">
    <span class="field-label">Playbook name</span>
    <input type="text" bind:value={playbook.name} />
  </label>

  <label class="field">
    <span class="field-label">Blurb</span>
    <textarea bind:value={playbook.blurb} rows="2"></textarea>
  </label>

  {#if generalNotes}
    {#each generalNotes as note (note)}
      <ConversionNote {note} />
    {/each}
  {/if}

  <div class="row">
    <label class="field small">
      <span class="field-label">Luck max</span>
      <input type="number" min="0" bind:value={playbook.luckMax} />
    </label>
    <label class="field small">
      <span class="field-label">Harm max</span>
      <input type="number" min="1" bind:value={playbook.harmTrack.max} />
    </label>
    <label class="field small">
      <span class="field-label">Unstable at</span>
      <input type="number" min="1" bind:value={playbook.harmTrack.unstableAt} />
    </label>
    <label class="field small">
      <span class="field-label">Moves to pick</span>
      <input type="number" min="0" bind:value={playbook.movesToPick} />
    </label>
  </div>

  <section>
    <h3 class="section-title">Ratings lines</h3>
    <RatingsLinesEditor bind:lines={playbook.ratingsLines} />
  </section>

  <section>
    <h3 class="section-title">Moves</h3>
    <MovesEditor bind:moves={playbook.moves} notesForIndex={notesForMove} />
  </section>

  <section>
    <h3 class="section-title">Gear</h3>
    <GearChoicesEditor bind:gearChoices={playbook.gearChoices} />
  </section>
</div>

<style>
  .playbook {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .row {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .small {
    width: 7rem;
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input,
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

  .section-title {
    margin: 0 0 var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }
</style>
