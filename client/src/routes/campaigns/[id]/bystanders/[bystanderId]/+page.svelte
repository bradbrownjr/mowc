<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { BystanderSchema, type Bystander } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { db } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import RevealToggle from "$lib/RevealToggle.svelte";
  import type { ContentPack } from "@mowc/shared";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let bystander = $state<Bystander | null>(null);
  let notFound = $state(false);
  let isKeeper = $state(false);
  let packs = $state<ContentPack[]>([]);
  let notesDraft = $state("");

  async function loadBystander(): Promise<void> {
    const row = await db.entities.get(data.bystanderId);
    if (!row || row.deleted || row.type !== "bystander" || row.campaignId !== data.id) {
      bystander = null;
      notFound = true;
      return;
    }
    const parsed = BystanderSchema.safeParse(row.payload);
    if (!parsed.success) {
      bystander = null;
      notFound = true;
      return;
    }
    bystander = parsed.data;
    notesDraft = parsed.data.notes;
    notFound = false;
  }

  async function applyUpdate(patch: Partial<Bystander>): Promise<void> {
    if (!bystander) return;
    const result = BystanderSchema.safeParse({ ...bystander, ...patch });
    if (!result.success) return;
    bystander = result.data;
    await writeEntity("bystander", data.id, result.data.id, result.data);
  }

  let notesTimer: ReturnType<typeof setTimeout> | undefined;
  function onNotesInput(): void {
    if (notesTimer) clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      void applyUpdate({ notes: notesDraft });
    }, 600);
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadBystander();
      });

    getCampaign(data.id)
      .then(async (result) => {
        isKeeper = result.keeperUserId === sessionState.user?.id;
        const loaded = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        packs = loaded.filter((p): p is PackDetail => p !== null).map((p) => p.pack);
      })
      .catch(() => {});
  });

  const bystanderType = $derived(
    bystander?.typeId ? packs.flatMap((p) => p.bystanderTypes).find((t) => t.id === bystander?.typeId) : null
  );
</script>

<main>
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if notFound}
    <p class="error">Bystander not found.</p>
  {:else if !bystander}
    <p class="meta">Loading...</p>
  {:else}
    <header class="sheet-header">
      <h1 class="title">{bystander.name}</h1>
      {#if bystanderType}
        <p class="meta">{bystanderType.name}</p>
      {/if}
      {#if isKeeper}
        <RevealToggle revealed={bystander.revealed} onToggle={() => applyUpdate({ revealed: !bystander?.revealed })} />
      {/if}
    </header>

    {#if bystander.motivation}
      <section class="panel">
        <h2 class="section-title">Motivation</h2>
        <p class="detail-text">{bystander.motivation}</p>
      </section>
    {/if}

    <section class="panel">
      <h2 class="section-title">Notes</h2>
      <textarea
        class="form-textarea"
        bind:value={notesDraft}
        oninput={onNotesInput}
        placeholder="Add details about this bystander..."
        disabled={!isKeeper}
      ></textarea>
    </section>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    max-width: 32rem;
  }

  .back-link {
    align-self: flex-start;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .sheet-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

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

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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

  .detail-text {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--ink);
  }

  .form-textarea {
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-base);
    min-height: 6rem;
    resize: vertical;
  }

  .form-textarea:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
</style>
