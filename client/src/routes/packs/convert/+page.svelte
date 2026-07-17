<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { ContentPack } from "@mowc/shared";
  import { createPack, PackApiError, type PackValidationError } from "$lib/api/contentPacks.js";
  import { conversionState, clearConversionResult } from "$lib/conversion.svelte";
  import { sessionState } from "$lib/session.svelte";
  import {
    notesForBasicMove,
    notesForMove,
    notesForPackFields,
    notesForPlaybookGeneral,
    unclaimedNotes
  } from "$lib/conversion-notes.js";
  import PlaybookEditor from "$lib/pack-editor/PlaybookEditor.svelte";
  import MovesEditor from "$lib/pack-editor/MovesEditor.svelte";
  import ConversionNote from "$lib/pack-editor/ConversionNote.svelte";
  import Icon from "$lib/Icon.svelte";
  import { Check, Trash2 } from "@lucide/svelte";

  let drafts = $state<ContentPack[]>([]);
  let documentNotes = $state<string[]>([]);
  let savedIds = $state<string[]>([]);
  let draftErrors = $state<Record<string, PackValidationError[]>>({});
  let saving = $state<Record<string, boolean>>({});

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user?.isAdmin || !conversionState.result) {
      void goto(resolve("/packs"));
      return;
    }
    drafts = conversionState.result.drafts;
    documentNotes = conversionState.result.notes;
  });

  function discard(id: string): void {
    drafts = drafts.filter((d) => d.id !== id);
  }

  async function save(draft: ContentPack): Promise<void> {
    saving = { ...saving, [draft.id]: true };
    draftErrors = { ...draftErrors, [draft.id]: [] };
    try {
      await createPack(draft);
      savedIds = [...savedIds, draft.id];
    } catch (err) {
      draftErrors = {
        ...draftErrors,
        [draft.id]: err instanceof PackApiError ? err.errors : [{ path: "", message: "Could not save the pack." }]
      };
    } finally {
      saving = { ...saving, [draft.id]: false };
    }
  }

  function finish(): void {
    clearConversionResult();
    void goto(resolve("/packs"));
  }
</script>

<main class="page">
  <h1 class="title">Review converted packs</h1>
  <p class="meta">
    {drafts.length} draft{drafts.length === 1 ? "" : "s"} from the PDF. Nothing is saved until you save each draft below.
  </p>

  {#each documentNotes as note (note)}
    <ConversionNote {note} />
  {/each}

  {#each drafts as draft (draft.id)}
    {@const notes = draft.conversionNotes ?? []}
    {@const saved = savedIds.includes(draft.id)}
    <div class="draft-card">
      <div class="draft-header">
        <h2 class="section-title">{draft.name || "Untitled draft"}</h2>
        <div class="draft-actions">
          {#if saved}
            <span class="saved-tag"><Icon icon={Check} size={16} /> Saved</span>
          {:else}
            <button type="button" class="icon-button" onclick={() => discard(draft.id)} aria-label="Discard draft">
              <Icon icon={Trash2} size={18} />
            </button>
          {/if}
        </div>
      </div>

      {#if !saved}
        <label class="field">
          <span class="field-label">Pack name</span>
          <input type="text" bind:value={draft.name} />
        </label>

        <div class="row">
          <label class="field grow">
            <span class="field-label">Author</span>
            <input type="text" bind:value={draft.author} />
          </label>
          <label class="field small">
            <span class="field-label">Version</span>
            <input type="text" bind:value={draft.version} />
          </label>
        </div>

        <label class="field">
          <span class="field-label">License</span>
          <input type="text" bind:value={draft.license} />
        </label>

        {#each notesForPackFields(notes) as note (note)}
          <ConversionNote {note} />
        {/each}

        {#if draft.playbooks.length > 0}
          <PlaybookEditor
            bind:playbook={draft.playbooks[0]}
            generalNotes={notesForPlaybookGeneral(notes)}
            notesForMove={(index) => notesForMove(notes, index)}
          />
        {:else}
          {#if draft.basicMoves.length > 0}
            <section>
              <h3 class="section-title">Basic moves</h3>
              <MovesEditor bind:moves={draft.basicMoves} notesForIndex={(index) => notesForBasicMove(notes, index)} />
            </section>
          {/if}
          {#if draft.hunterAgenda && draft.hunterAgenda.length > 0}
            <section>
              <h3 class="section-title">Hunter agenda (read-only)</h3>
              <ul class="readonly-list">
                {#each draft.hunterAgenda as item (item)}
                  <li>{item}</li>
                {/each}
              </ul>
            </section>
          {/if}
          {#if draft.keeperAgenda && draft.keeperAgenda.length > 0}
            <section>
              <h3 class="section-title">Keeper agenda (read-only)</h3>
              <ul class="readonly-list">
                {#each draft.keeperAgenda as item (item)}
                  <li>{item}</li>
                {/each}
              </ul>
            </section>
          {/if}
        {/if}

        {#each unclaimedNotes(notes, draft.playbooks[0]?.moves.length ?? 0, draft.basicMoves.length) as note (note)}
          <ConversionNote {note} />
        {/each}

        {#if draftErrors[draft.id]?.length}
          <div class="errors">
            {#each draftErrors[draft.id] as error, index (index)}
              <p class="error">{error.path ? `${error.path}: ` : ""}{error.message}</p>
            {/each}
          </div>
        {/if}

        <button type="button" class="save-button" disabled={saving[draft.id]} onclick={() => save(draft)}>
          {saving[draft.id] ? "Saving..." : "Save pack"}
        </button>
      {/if}
    </div>
  {/each}

  {#if drafts.length === 0}
    <p class="meta">All drafts handled.</p>
  {/if}

  <button type="button" class="finish-button" onclick={finish}>Done</button>
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

  .meta {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .draft-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .draft-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .draft-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .saved-tag {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--ok);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
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

  .grow {
    flex: 1;
    min-width: 10rem;
  }

  .small {
    width: 8rem;
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input {
    min-height: var(--tap-min);
    padding: var(--space-2);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .readonly-list {
    margin: 0;
    padding-left: var(--space-4);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .icon-button,
  .save-button,
  .finish-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .icon-button {
    align-self: flex-start;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
  }

  .save-button,
  .finish-button {
    background: var(--accent);
    color: var(--bg);
    border: none;
    align-self: flex-start;
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .icon-button:focus-visible,
  .save-button:focus-visible,
  .finish-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .errors {
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--danger);
    border-radius: var(--radius-md);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }
</style>
