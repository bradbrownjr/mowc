<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { MinionSchema, type Campaign, type Minion } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { generateUuid } from "$lib/uuid.js";
  import { writeEntity } from "$lib/sync.js";
  import { buildMinionPayload, flattenMinionTypes, minionFormReason } from "$lib/world-entity-builder.js";
  import FieldNote from "$lib/FieldNote.svelte";
  import type { ArchetypeDef, MonsterAttack } from "@mowc/shared";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let isKeeper = $state(false);
  let minionTypes = $state<ArchetypeDef[]>([]);

  let name = $state("");
  let selectedTypeId = $state<string | null>(null);
  let motivation = $state("");
  let attacks = $state<MonsterAttack[]>([]);
  let newAttackName = $state("");
  let newAttackHarm = $state<number | "">(0);
  let armor = $state<number | "">(0);
  let harmCapacity = $state<number | "">(0);

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Minion | null>(null);

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
          loadError = "Only the Keeper can create minions.";
          return;
        }
        const packs = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        const loaded = packs.filter((p): p is PackDetail => p !== null);
        minionTypes = flattenMinionTypes(loaded.map((p) => p.pack));
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });

  const formReason = $derived(minionFormReason(name, harmCapacity));

  function onTypeSelect(typeId: string): void {
    selectedTypeId = typeId;
    const type = minionTypes.find((t) => t.id === typeId);
    if (type) {
      motivation = type.motivation;
    }
  }

  function addAttack(): void {
    if (!newAttackName.trim()) return;
    const harm = typeof newAttackHarm === "number" ? newAttackHarm : parseInt(newAttackHarm) || 0;
    attacks = [...attacks, { name: newAttackName.trim(), harm: Math.max(0, harm), tags: [] }];
    newAttackName = "";
    newAttackHarm = 0;
  }

  function removeAttack(index: number): void {
    attacks = attacks.filter((_, i) => i !== index);
  }

  async function onSubmit(): Promise<void> {
    if (!sessionState.user || !campaign) return;

    submitError = null;

    const armorNum = typeof armor === "number" ? armor : parseInt(armor) || 0;
    const harmCapNum = typeof harmCapacity === "number" ? harmCapacity : parseInt(harmCapacity) || 0;

    const id = generateUuid();
    const payload = buildMinionPayload({
      id,
      campaignId: data.id,
      name,
      typeId: selectedTypeId,
      motivation,
      attacks,
      armor: armorNum,
      harmCapacity: harmCapNum
    });

    const result = MinionSchema.safeParse(payload);
    if (!result.success) {
      submitError = "Could not validate the minion.";
      return;
    }

    submitting = true;
    try {
      await writeEntity("minion", data.id, id, result.data);
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
    <h1 class="title">Minion created</h1>
    <p class="meta">{created.name} has joined the encounter.</p>
    <a class="submit-button" href={resolve("/campaigns/[id]/minions/[minionId]", { id: data.id, minionId: created.id })}>
      View minion
    </a>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else if !isKeeper}
    <p class="error">Only the Keeper can create minions.</p>
  {:else}
    <h1 class="title">New minion</h1>

    <section class="panel">
      <label class="form-label" for="minion-name">Name *</label>
      <FieldNote>A minion is one of the monster's mooks: weaker than the monster itself, but still a threat in a fight.</FieldNote>
      <input id="minion-name" type="text" class="form-input" placeholder="Ghoul" bind:value={name} />
    </section>

    {#if minionTypes.length > 0}
      <section class="panel">
        <h3 class="form-label">Type</h3>
        <FieldNote>Type (an archetype from a content pack) is optional; it just prefills a motivation you can still edit.</FieldNote>
        <div class="option-list">
          {#each minionTypes as type (type.id)}
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
      <label class="form-label" for="minion-motivation">Motivation</label>
      <FieldNote>What this minion wants, or why it's following the monster. Optional.</FieldNote>
      <textarea id="minion-motivation" class="form-textarea" placeholder="What does it want?" bind:value={motivation}></textarea>
    </section>

    <section class="panel">
      <h3 class="form-label">Attacks</h3>
      <FieldNote>Attacks this minion can make in a fight, each with a harm value for how much damage it deals. Optional.</FieldNote>
      {#if attacks.length > 0}
        <ul class="attack-list">
          {#each attacks as attack, index (index)}
            <li class="attack-item">
              <span class="attack-name">{attack.name}</span>
              <span class="attack-harm">{attack.harm} harm</span>
              <button type="button" class="remove-button" onclick={() => removeAttack(index)}>Remove</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="form-group">
        <input type="text" class="form-input" placeholder="Attack name (e.g., Claw)" bind:value={newAttackName} />
        <input
          type="number"
          class="form-input"
          placeholder="Harm"
          bind:value={newAttackHarm}
          min="0"
        />
        <button type="button" class="secondary-button" onclick={addAttack} disabled={!newAttackName.trim()}>
          Add attack
        </button>
      </div>
    </section>

    <section class="panel">
      <label class="form-label" for="minion-armor">Armor</label>
      <FieldNote>Armor reduces harm this minion takes.</FieldNote>
      <input id="minion-armor" type="number" class="form-input" bind:value={armor} min="0" />
    </section>

    <section class="panel">
      <label class="form-label" for="minion-harm">Harm capacity *</label>
      <FieldNote>How much harm this minion can take before it's taken out. Required.</FieldNote>
      <input id="minion-harm" type="number" class="form-input" placeholder="3" bind:value={harmCapacity} min="1" />
    </section>

    {#if submitError}
      <p class="error">{submitError}</p>
    {/if}

    {#if formReason}
      <FieldNote>{formReason}</FieldNote>
    {/if}

    <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting || formReason !== null}>
      {submitting ? "Creating..." : "Create minion"}
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

  .form-group {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .form-group .form-input {
    flex: 1;
    min-width: 8rem;
  }

  .attack-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .attack-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .attack-name {
    flex: 1;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--ink);
  }

  .attack-harm {
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }

  .remove-button {
    padding: var(--space-1) var(--space-2);
    background: var(--surface);
    color: var(--danger);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .remove-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .secondary-button {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .secondary-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
