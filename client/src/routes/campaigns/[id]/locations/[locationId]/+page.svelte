<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { LocationSchema, type Location } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { db } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import RevealToggle from "$lib/RevealToggle.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let location = $state<Location | null>(null);
  let notFound = $state(false);
  let isKeeper = $state(false);
  let descriptionDraft = $state("");
  let mapNotesDraft = $state("");

  async function loadLocation(): Promise<void> {
    const row = await db.entities.get(data.locationId);
    if (!row || row.deleted || row.type !== "location" || row.campaignId !== data.id) {
      location = null;
      notFound = true;
      return;
    }
    const parsed = LocationSchema.safeParse(row.payload);
    if (!parsed.success) {
      location = null;
      notFound = true;
      return;
    }
    location = parsed.data;
    descriptionDraft = parsed.data.description;
    mapNotesDraft = parsed.data.mapNotes;
    notFound = false;
  }

  async function applyUpdate(patch: Partial<Location>): Promise<void> {
    if (!location) return;
    const result = LocationSchema.safeParse({ ...location, ...patch });
    if (!result.success) return;
    location = result.data;
    await writeEntity("location", data.id, result.data.id, result.data);
  }

  let descriptionTimer: ReturnType<typeof setTimeout> | undefined;
  function onDescriptionInput(): void {
    if (descriptionTimer) clearTimeout(descriptionTimer);
    descriptionTimer = setTimeout(() => {
      void applyUpdate({ description: descriptionDraft });
    }, 600);
  }

  let mapNotesTimer: ReturnType<typeof setTimeout> | undefined;
  function onMapNotesInput(): void {
    if (mapNotesTimer) clearTimeout(mapNotesTimer);
    mapNotesTimer = setTimeout(() => {
      void applyUpdate({ mapNotes: mapNotesDraft });
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
        void loadLocation();
      });

    getCampaign(data.id)
      .then((result) => {
        isKeeper = result.keeperUserId === sessionState.user?.id;
      })
      .catch(() => {});
  });
</script>

<main class="page">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if notFound}
    <p class="error">Location not found.</p>
  {:else if !location}
    <p class="meta">Loading...</p>
  {:else}
    <header class="sheet-header">
      <h1 class="title">{location.name}</h1>
      {#if isKeeper}
        <RevealToggle revealed={location.revealed} onToggle={() => applyUpdate({ revealed: !location?.revealed })} />
      {/if}
    </header>

    <section class="panel">
      <h2 class="section-title">Description</h2>
      <textarea class="form-textarea" bind:value={descriptionDraft} oninput={onDescriptionInput} placeholder="What does this place look like?" disabled={!isKeeper}></textarea>
    </section>

    <section class="panel">
      <h2 class="section-title">Map notes</h2>
      <textarea class="form-textarea" bind:value={mapNotesDraft} oninput={onMapNotesInput} placeholder="How does this fit on the map?" disabled={!isKeeper}></textarea>
    </section>
  {/if}
</main>

<style>
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
