<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { BystanderSchema, type Campaign, type Bystander } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { generateUuid } from "$lib/uuid.js";
  import { writeEntity } from "$lib/sync.js";
  import { buildBystanderPayload, bystanderFormReason, flattenBystanderTypes } from "$lib/world-entity-builder.js";
  import FieldNote from "$lib/FieldNote.svelte";
  import { GLOSS } from "$lib/glossary.js";
  import type { ArchetypeDef } from "@mowc/shared";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let isKeeper = $state(false);
  let bystanderTypes = $state<ArchetypeDef[]>([]);

  let name = $state("");
  let selectedTypeId = $state<string | null>(null);
  let motivation = $state("");
  let notes = $state("");

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Bystander | null>(null);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then(async (result) => {
        campaign = result;
        isKeeper = result.keeperUserId === sessionState.user?.id;
        loadError = null;
        if (!isKeeper) {
          loadError = `Only the ${GLOSS.keeper} can create bystanders.`;
          return;
        }
        const packs = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        const loaded = packs.filter((p): p is PackDetail => p !== null);
        bystanderTypes = flattenBystanderTypes(loaded.map((p) => p.pack));
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });

  const formReason = $derived(bystanderFormReason(name));

  function onTypeSelect(typeId: string): void {
    selectedTypeId = typeId;
    const type = bystanderTypes.find((t) => t.id === typeId);
    if (type) {
      motivation = type.motivation;
    }
  }

  async function onSubmit(): Promise<void> {
    if (!sessionState.user || !campaign) return;

    submitError = null;

    const id = generateUuid();
    const payload = buildBystanderPayload({
      id,
      campaignId: data.id,
      name,
      typeId: selectedTypeId,
      motivation,
      notes
    });

    const result = BystanderSchema.safeParse(payload);
    if (!result.success) {
      submitError = "Could not validate the bystander.";
      return;
    }

    submitting = true;
    try {
      await writeEntity("bystander", data.id, id, result.data);
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
    <h1 class="title">Bystander created</h1>
    <p class="meta">{created.name} is now in the story.</p>
    <a class="submit-button" href={resolve("/campaigns/[id]/bystanders/[bystanderId]", { id: data.id, bystanderId: created.id })}>
      View bystander
    </a>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else if !isKeeper}
    <p class="error">Only the {GLOSS.keeper} can create bystanders.</p>
  {:else}
    <h1 class="title">New bystander</h1>

    <section class="panel">
      <label class="form-label" for="bystander-name">Name *</label>
      <FieldNote>A bystander is a person the hunters can talk to, protect, or suspect: a witness, a victim, a local who knows too much.</FieldNote>
      <input id="bystander-name" type="text" class="form-input" placeholder="Sister Mary" bind:value={name} />
    </section>

    {#if bystanderTypes.length > 0}
      <section class="panel">
        <h3 class="form-label">Type</h3>
        <FieldNote>Type (an archetype from a content pack) is optional; it just prefills a motivation you can still edit.</FieldNote>
        <div class="option-list">
          {#each bystanderTypes as type (type.id)}
            <button
              type="button"
              class="option-card"
              class:selected={selectedTypeId === type.id}
              onclick={() => onTypeSelect(type.id)}
            >
              <span class="option-title">{type.name}</span>
              {#if type.motivation}<span class="option-detail">{type.motivation}</span>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="panel">
      <label class="form-label" for="bystander-motivation">Motivation</label>
      <FieldNote>What this person wants, whether or not the hunters ever learn it. Optional.</FieldNote>
      <textarea id="bystander-motivation" class="form-textarea" placeholder="What do they want?" bind:value={motivation}></textarea>
    </section>

    <section class="panel">
      <label class="form-label" for="bystander-notes">Notes</label>
      <FieldNote>Anything else worth remembering: secrets, relationships, or details for your own reference. Optional.</FieldNote>
      <textarea id="bystander-notes" class="form-textarea" placeholder="Secrets, relationships, details..." bind:value={notes}></textarea>
    </section>

    {#if submitError}
      <p class="error">{submitError}</p>
    {/if}

    {#if formReason}
      <FieldNote>{formReason}</FieldNote>
    {/if}

    <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting || formReason !== null}>
      {submitting ? "Creating..." : "Create bystander"}
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

  .option-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .option-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    text-align: left;
  }

  .option-card.selected {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .option-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .option-title {
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--ink);
  }

  .option-detail {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink-muted);
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
