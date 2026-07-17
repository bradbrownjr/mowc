<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { createPack, deletePack, listPacks, PackApiError, type PackSummary } from "$lib/api/contentPacks.js";
  import { extractPacksFromFiles } from "$lib/pack-import.js";
  import { convertPdf, ConversionApiError } from "$lib/api/conversion.js";
  import { setConversionResult } from "$lib/conversion.svelte";
  import { sessionState } from "$lib/session.svelte";
  import Icon from "$lib/Icon.svelte";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import { FileText, Plus, Trash2, Upload } from "@lucide/svelte";

  interface ImportResultRow {
    name: string;
    ok: boolean;
    message?: string;
  }

  let packs = $state<PackSummary[]>([]);
  let loadError = $state<string | null>(null);
  let importResults = $state<ImportResultRow[]>([]);
  let importing = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let convertInput: HTMLInputElement | undefined = $state();
  let converting = $state(false);
  let convertError = $state<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      packs = await listPacks();
      loadError = null;
    } catch {
      loadError = "Could not reach the server.";
    }
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }
    void refresh();
  });

  async function onDelete(id: string): Promise<void> {
    await deletePack(id);
    await refresh();
  }

  async function onFileSelected(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    importing = true;
    importResults = [];
    try {
      const outcomes = await extractPacksFromFiles(files);
      const results: ImportResultRow[] = [];
      for (const outcome of outcomes) {
        if (!outcome.ok || !outcome.pack) {
          results.push({ name: outcome.name, ok: false, message: outcome.message ?? "Could not import that file." });
          continue;
        }
        try {
          await createPack(outcome.pack);
          results.push({ name: outcome.name, ok: true });
        } catch (err) {
          results.push({
            name: outcome.name,
            ok: false,
            message: err instanceof PackApiError ? err.message : "Could not import that file."
          });
        }
      }
      importResults = results;
      await refresh();
    } finally {
      importing = false;
      input.value = "";
    }
  }

  async function onConvertFileSelected(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    converting = true;
    convertError = null;
    try {
      const result = await convertPdf(file);
      setConversionResult(result);
      await goto(resolve("/packs/convert"));
    } catch (err) {
      convertError = err instanceof ConversionApiError ? err.message : "Could not convert that PDF.";
    } finally {
      converting = false;
      input.value = "";
    }
  }
</script>

<main class="page page--wide">
  <div class="header">
    <h1 class="title">Content packs</h1>
    <div class="actions">
      <button type="button" class="add-button" onclick={() => fileInput?.click()} disabled={importing}>
        <Icon icon={Upload} size={18} />
        {importing ? "Importing..." : "Import packs"}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        multiple
        accept=".json,.zip,application/json,application/zip"
        class="visually-hidden"
        onchange={onFileSelected}
      />
      {#if sessionState.user?.isAdmin}
        <button type="button" class="add-button" onclick={() => convertInput?.click()} disabled={converting}>
          <Icon icon={FileText} size={18} />
          {converting ? "Converting..." : "Convert PDF"}
        </button>
        <input
          bind:this={convertInput}
          type="file"
          accept=".pdf,application/pdf"
          class="visually-hidden"
          onchange={onConvertFileSelected}
        />
      {/if}
      <a class="add-button" href={resolve("/packs/new")}>
        <Icon icon={Plus} size={18} />
        New pack
      </a>
    </div>
  </div>

  {#if convertError}
    <p class="error">{convertError}</p>
  {/if}

  {#if importResults.length > 0}
    {@const failed = importResults.filter((r) => !r.ok)}
    {@const succeeded = importResults.length - failed.length}
    <div class="import-summary">
      <p class="meta">Imported {succeeded} of {importResults.length} pack{importResults.length === 1 ? "" : "s"}.</p>
      {#if failed.length > 0}
        <ul class="import-errors">
          {#each failed as row (row.name)}
            <li class="error">{row.name}: {row.message}</li>
          {/each}
        </ul>
      {/if}
    </div>
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
            <span class="pack-name-row">
              <span class="pack-name">{pack.name}</span>
              {#if pack.visibility === "shared"}
                <EvidenceTag label="Shared" />
              {/if}
            </span>
            <span class="pack-meta">{pack.author} - v{pack.version}</span>
          </a>
          {#if pack.ownerUserId === sessionState.user?.id}
            <button type="button" class="icon-button" onclick={() => onDelete(pack.id)} aria-label={`Delete ${pack.name}`}>
              <Icon icon={Trash2} size={18} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
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

  .import-summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .import-errors {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding-left: var(--space-4);
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

  .pack-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
