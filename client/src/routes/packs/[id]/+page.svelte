<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { deletePack, getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { sessionState } from "$lib/session.svelte";
  import Icon from "$lib/Icon.svelte";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import { Download, Trash2 } from "@lucide/svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let detail = $state<PackDetail | null>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }
    getPack(data.id)
      .then((result) => {
        detail = result;
        loadError = null;
      })
      .catch(() => {
        loadError = "Pack not found.";
      });
  });

  function exportPack(): void {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail.pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${detail.pack.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.mowcpack.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function onDelete(): Promise<void> {
    if (!detail) return;
    await deletePack(detail.id);
    await goto(resolve("/packs"));
  }
</script>

<main>
  <a class="back-link" href={resolve("/packs")}>Back to packs</a>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if detail}
    <div class="header">
      <div>
        <h1 class="title-row">
          <span class="title">{detail.pack.name}</span>
          {#if detail.visibility === "shared"}
            <EvidenceTag label="Shared" />
          {/if}
        </h1>
        <p class="meta">{detail.pack.author} - v{detail.pack.version}</p>
      </div>
      <div class="actions">
        <button type="button" class="action-button" onclick={exportPack}>
          <Icon icon={Download} size={18} />
          Export
        </button>
        {#if detail.ownerUserId === sessionState.user?.id}
          <button type="button" class="action-button danger" onclick={onDelete}>
            <Icon icon={Trash2} size={18} />
            Delete
          </button>
        {/if}
      </div>
    </div>

    {#each detail.pack.playbooks as playbook (playbook.id)}
      <section class="playbook">
        <h2 class="section-title">{playbook.name}</h2>
        {#if playbook.blurb}
          <p class="blurb">{playbook.blurb}</p>
        {/if}
        <p class="meta">
          Luck {playbook.luckMax} - Harm {playbook.harmTrack.max} (unstable at {playbook.harmTrack.unstableAt}) - Pick {playbook.movesToPick} moves
        </p>

        <ul class="moves">
          {#each playbook.moves as move (move.id)}
            <li class="move">
              <span class="move-name">{move.name}</span>
              {#if move.rating}<span class="tag">{move.rating}</span>{/if}
              <p class="move-trigger">{move.trigger}</p>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else}
    <p class="meta">Loading...</p>
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

  .back-link {
    align-self: flex-start;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
  }

  .title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .meta {
    margin: var(--space-1) 0 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .error {
    color: var(--danger);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .action-button {
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
  }

  .action-button.danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .action-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .playbook {
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .blurb {
    color: var(--ink);
  }

  .moves {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
  }

  .move {
    padding: var(--space-2);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .move-name {
    font-family: var(--font-body);
    font-weight: 700;
    color: var(--ink);
  }

  .move-trigger {
    margin: var(--space-1) 0 0;
    color: var(--ink-muted);
  }

  .tag {
    display: inline-block;
    margin-left: var(--space-2);
    padding: 0 var(--space-2);
    clip-path: polygon(0 0, 100% 0, 100% 100%, var(--tag-clip) 100%, 0 calc(100% - var(--tag-clip)));
    background: var(--surface);
    border: 1px solid var(--border);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
</style>
