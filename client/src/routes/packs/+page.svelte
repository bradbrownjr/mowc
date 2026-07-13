<script lang="ts">
  import { ContentPackSchema } from "@mowc/shared";
  import { resolve } from "$app/paths";
  import { createPack, deletePack, listPacks, PackApiError, type PackSummary } from "$lib/api/contentPacks.js";
  import Icon from "$lib/Icon.svelte";
  import { Plus, Trash2, Upload } from "@lucide/svelte";

  let packs = $state<PackSummary[]>([]);
  let loadError = $state<string | null>(null);
  let importError = $state<string | null>(null);
  let importing = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  async function refresh(): Promise<void> {
    try {
      packs = await listPacks();
      loadError = null;
    } catch {
      loadError = "Could not reach the server.";
    }
  }

  $effect(() => {
    refresh();
  });

  async function onDelete(id: string): Promise<void> {
    await deletePack(id);
    await refresh();
  }

  async function onFileSelected(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importing = true;
    importError = null;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = ContentPackSchema.safeParse(parsed);
      if (!result.success) {
        importError = `${file.name} is not a valid .mowcpack.json file: ${result.error.issues[0]?.message ?? "invalid format"}`;
        return;
      }
      await createPack(result.data);
      await refresh();
    } catch (err) {
      if (err instanceof SyntaxError) {
        importError = `${file.name} is not valid JSON.`;
      } else if (err instanceof PackApiError) {
        importError = err.message;
      } else {
        importError = "Could not import that file.";
      }
    } finally {
      importing = false;
      input.value = "";
    }
  }
</script>

<main>
  <div class="header">
    <h1 class="title">Content packs</h1>
    <div class="actions">
      <button type="button" class="add-button" onclick={() => fileInput?.click()} disabled={importing}>
        <Icon icon={Upload} size={18} />
        {importing ? "Importing..." : "Import .mowcpack.json"}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".json,application/json"
        class="visually-hidden"
        onchange={onFileSelected}
      />
      <a class="add-button" href={resolve("/packs/new")}>
        <Icon icon={Plus} size={18} />
        New pack
      </a>
    </div>
  </div>

  {#if importError}
    <p class="error">{importError}</p>
  {/if}

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if packs.length === 0}
    <p class="meta">No content packs yet.</p>
  {:else}
    <ul class="pack-list">
      {#each packs as pack (pack.id)}
        <li class="pack-row">
          <a class="pack-link" href={resolve("/packs/[id]", { id: pack.id })}>
            <span class="pack-name">{pack.name}</span>
            <span class="pack-meta">{pack.author} - v{pack.version}</span>
          </a>
          <button type="button" class="icon-button" onclick={() => onDelete(pack.id)} aria-label={`Delete ${pack.name}`}>
            <Icon icon={Trash2} size={18} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    max-width: 48rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .meta {
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .error {
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .pack-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pack-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .pack-link {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--ink);
    text-decoration: none;
  }

  .pack-name {
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .pack-meta {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .add-button,
  .icon-button {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .add-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .add-button:focus-visible,
  .icon-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
