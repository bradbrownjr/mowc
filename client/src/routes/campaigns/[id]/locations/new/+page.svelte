<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { LocationSchema, type Campaign, type Location } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { generateUuid } from "$lib/uuid.js";
  import { writeEntity } from "$lib/sync.js";
  import { buildLocationPayload } from "$lib/world-entity-builder.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let isKeeper = $state(false);

  let name = $state("");
  let description = $state("");
  let mapNotes = $state("");

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Location | null>(null);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then((result) => {
        campaign = result;
        isKeeper = result.keeperUserId === sessionState.user?.id;
        loadError = null;
        if (!isKeeper) {
          loadError = "Only the Keeper can create locations.";
        }
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });

  async function onSubmit(): Promise<void> {
    if (!sessionState.user || !campaign) return;

    submitError = null;

    if (!name.trim()) {
      submitError = "Name is required.";
      return;
    }

    const id = generateUuid();
    const payload = buildLocationPayload({
      id,
      campaignId: data.id,
      name,
      description,
      mapNotes
    });

    const result = LocationSchema.safeParse(payload);
    if (!result.success) {
      submitError = "Could not validate the location.";
      return;
    }

    submitting = true;
    try {
      await writeEntity("location", data.id, id, result.data);
      created = result.data;
    } finally {
      submitting = false;
    }
  }
</script>

<main class="page">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if created}
    <h1 class="title">Location created</h1>
    <p class="meta">{created.name} is now on the map.</p>
    <a class="submit-button" href={resolve("/campaigns/[id]/locations/[locationId]", { id: data.id, locationId: created.id })}>
      View location
    </a>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else if !isKeeper}
    <p class="error">Only the Keeper can create locations.</p>
  {:else}
    <h1 class="title">New location</h1>

    <section class="panel">
      <label class="form-label" for="location-name">Name *</label>
      <input id="location-name" type="text" class="form-input" placeholder="Old Town Hall" bind:value={name} />
    </section>

    <section class="panel">
      <label class="form-label" for="location-description">Description</label>
      <textarea id="location-description" class="form-textarea" placeholder="What does this place look like?" bind:value={description}></textarea>
    </section>

    <section class="panel">
      <label class="form-label" for="location-mapnotes">Map notes</label>
      <textarea id="location-mapnotes" class="form-textarea" placeholder="How does this fit on the map?" bind:value={mapNotes}></textarea>
    </section>

    {#if submitError}
      <p class="error">{submitError}</p>
    {/if}

    <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting}>
      {submitting ? "Creating..." : "Create location"}
    </button>
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

  .form-label {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .form-input,
  .form-textarea {
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .form-textarea {
    min-height: 6rem;
    font-family: var(--font-body);
    resize: vertical;
  }

  .submit-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-2);
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

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
