<script lang="ts">
  import type { ContentPack, PlaybookDef } from "@mowc/shared";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { createPack, PackApiError, type PackValidationError } from "$lib/api/contentPacks.js";
  import { generateUuid } from "$lib/uuid.js";
  import { sessionState } from "$lib/session.svelte";
  import PlaybookEditor from "$lib/pack-editor/PlaybookEditor.svelte";
  import Icon from "$lib/Icon.svelte";
  import { Plus, Trash2 } from "@lucide/svelte";

  function newPlaybook(): PlaybookDef {
    return {
      id: generateUuid(),
      name: "",
      blurb: "",
      ratingsLines: [],
      luckMax: 7,
      harmTrack: { max: 7, unstableAt: 4 },
      looks: [],
      moves: [],
      movesToPick: 0,
      gearChoices: [],
      improvements: [],
      advancedImprovements: [],
      extras: []
    };
  }

  let pack = $state<ContentPack>({
    id: generateUuid(),
    name: "",
    author: "",
    version: "1.0.0",
    playbooks: [newPlaybook()],
    basicMoves: [],
    monsterTypes: [],
    bystanderTypes: [],
    minionTypes: [],
    locationTypes: [],
    gear: []
  });

  let errors = $state<PackValidationError[]>([]);
  let saving = $state(false);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
    }
  });

  function addPlaybook(): void {
    pack.playbooks.push(newPlaybook());
  }

  function removePlaybook(index: number): void {
    pack.playbooks.splice(index, 1);
  }

  async function save(): Promise<void> {
    saving = true;
    errors = [];
    try {
      const summary = await createPack(pack);
      await goto(resolve("/packs/[id]", { id: summary.id }));
    } catch (err) {
      errors = err instanceof PackApiError ? err.errors : [{ path: "", message: "Could not save the pack." }];
    } finally {
      saving = false;
    }
  }
</script>

<main>
  <h1 class="title">New content pack</h1>

  <label class="field">
    <span class="field-label">Pack name</span>
    <input type="text" bind:value={pack.name} />
  </label>

  <div class="row">
    <label class="field grow">
      <span class="field-label">Author</span>
      <input type="text" bind:value={pack.author} />
    </label>
    <label class="field small">
      <span class="field-label">Version</span>
      <input type="text" bind:value={pack.version} />
    </label>
  </div>

  {#each pack.playbooks as playbook, index (playbook.id)}
    <div class="playbook-card">
      <div class="playbook-header">
        <h2 class="section-title">Playbook {index + 1}</h2>
        {#if pack.playbooks.length > 1}
          <button
            type="button"
            class="icon-button"
            onclick={() => removePlaybook(index)}
            aria-label="Remove playbook"
          >
            <Icon icon={Trash2} size={18} />
          </button>
        {/if}
      </div>
      <PlaybookEditor bind:playbook={pack.playbooks[index]} />
    </div>
  {/each}

  <button type="button" class="add-button" onclick={addPlaybook}>
    <Icon icon={Plus} size={18} />
    Add playbook
  </button>

  {#if errors.length > 0}
    <div class="errors">
      {#each errors as error, index (index)}
        <p class="error">{error.path ? `${error.path}: ` : ""}{error.message}</p>
      {/each}
    </div>
  {/if}

  <button type="button" class="save-button" disabled={saving} onclick={save}>
    {saving ? "Saving..." : "Save pack"}
  </button>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    max-width: 48rem;
  }

  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
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

  .playbook-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .playbook-header {
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

  .icon-button,
  .add-button,
  .save-button {
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

  .icon-button,
  .add-button {
    align-self: flex-start;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
  }

  .save-button {
    background: var(--accent);
    color: var(--bg);
    border: none;
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .icon-button:focus-visible,
  .add-button:focus-visible,
  .save-button:focus-visible {
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
