<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { MonsterSchema, type ArchetypeDef, type Campaign, type Monster } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { generateUuid } from "$lib/uuid.js";
  import { writeEntity } from "$lib/sync.js";
  import StepIndicator from "$lib/StepIndicator.svelte";
  import {
    buildMonsterPayload,
    emptyMonsterWizardState,
    flattenMonsterTypes,
    isArmorHarmStepComplete,
    isAttacksStepComplete,
    isCustomMovesStepComplete,
    isNameStepComplete,
    isPowersWeaknessesStepComplete,
    isTypeStepComplete,
    selectMonsterType,
    type MonsterWizardState
  } from "$lib/monster-builder.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  const STEP_LABELS = ["Type", "Powers & Weaknesses", "Attacks", "Armor & Harm", "Custom Moves", "Name", "Review"];

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let notKeeper = $state(false);
  let availableMonsterTypes = $state<ArchetypeDef[]>([]);

  let wizard = $state<MonsterWizardState>(emptyMonsterWizardState());
  let currentStep = $state(0);

  let powerDraft = $state("");
  let weaknessDraft = $state("");
  let customMoveDraft = $state("");
  let attackNameDraft = $state("");
  let attackHarmDraft = $state(0);
  let attackTagsDraft = $state("");

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Monster | null>(null);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then(async (result) => {
        campaign = result;
        loadError = null;
        if (result.keeperUserId !== sessionState.user?.id) {
          notKeeper = true;
          return;
        }
        const packs = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        const loaded = packs.filter((p): p is PackDetail => p !== null);
        availableMonsterTypes = flattenMonsterTypes(loaded.map((p) => p.pack));
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });

  const stepComplete = $derived([
    isTypeStepComplete(wizard),
    isPowersWeaknessesStepComplete(wizard),
    isAttacksStepComplete(wizard),
    isArmorHarmStepComplete(wizard),
    isCustomMovesStepComplete(wizard),
    isNameStepComplete(wizard),
    true
  ]);

  function next(): void {
    if (!stepComplete[currentStep]) return;
    currentStep = Math.min(currentStep + 1, STEP_LABELS.length - 1);
  }

  function back(): void {
    currentStep = Math.max(currentStep - 1, 0);
  }

  function onSelectType(type: ArchetypeDef): void {
    wizard = selectMonsterType(wizard, type);
  }

  function addPower(): void {
    const value = powerDraft.trim();
    if (!value) return;
    wizard.powers = [...wizard.powers, value];
    powerDraft = "";
  }

  function removePower(index: number): void {
    wizard.powers = wizard.powers.filter((_, i) => i !== index);
  }

  function addWeakness(): void {
    const value = weaknessDraft.trim();
    if (!value) return;
    wizard.weaknesses = [...wizard.weaknesses, value];
    weaknessDraft = "";
  }

  function removeWeakness(index: number): void {
    wizard.weaknesses = wizard.weaknesses.filter((_, i) => i !== index);
  }

  function addCustomMove(): void {
    const value = customMoveDraft.trim();
    if (!value) return;
    wizard.customMoves = [...wizard.customMoves, value];
    customMoveDraft = "";
  }

  function removeCustomMove(index: number): void {
    wizard.customMoves = wizard.customMoves.filter((_, i) => i !== index);
  }

  function addAttack(): void {
    const name = attackNameDraft.trim();
    if (!name) return;
    const tags = attackTagsDraft
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    wizard.attacks = [...wizard.attacks, { name, harm: Math.max(0, Math.floor(attackHarmDraft || 0)), tags }];
    attackNameDraft = "";
    attackHarmDraft = 0;
    attackTagsDraft = "";
  }

  function removeAttack(index: number): void {
    wizard.attacks = wizard.attacks.filter((_, i) => i !== index);
  }

  function onArmorInput(value: string): void {
    wizard.armor = Math.max(0, Math.floor(Number(value) || 0));
  }

  function onHarmCapacityInput(value: string): void {
    wizard.harmCapacity = value === "" ? null : Math.max(0, Math.floor(Number(value) || 0));
  }

  async function onSubmit(): Promise<void> {
    const id = generateUuid();
    const payload = buildMonsterPayload({ id, campaignId: data.id, state: wizard });
    if (!payload) {
      submitError = "Something is missing; go back and complete every step.";
      return;
    }
    const result = MonsterSchema.safeParse(payload);
    if (!result.success) {
      submitError = "Could not validate the monster.";
      return;
    }

    submitting = true;
    submitError = null;
    try {
      await writeEntity("monster", data.id, id, result.data);
      created = result.data;
    } finally {
      submitting = false;
    }
  }
</script>

<main>
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if notKeeper}
    <p class="error">Only the Keeper can create a monster.</p>
  {:else if created}
    <h1 class="title">Monster created</h1>
    <p class="meta">{created.name} lurks in the shadows.</p>
    <a class="submit-button" href={resolve("/campaigns/[id]/monsters/[monsterId]", { id: data.id, monsterId: created.id })}>
      View monster sheet
    </a>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else}
    <h1 class="title">New monster</h1>
    <StepIndicator steps={STEP_LABELS} current={currentStep} />

    {#if currentStep === 0}
      <section class="panel">
        <h2 class="section-title">Type</h2>
        {#if availableMonsterTypes.length === 0}
          <p class="meta">No monster types in attached packs. Motivation can still be written freely.</p>
        {:else}
          <div class="option-list stacked">
            {#each availableMonsterTypes as type (type.id)}
              <button
                type="button"
                class="option-card"
                class:selected={wizard.type?.id === type.id}
                onclick={() => onSelectType(type)}
              >
                <span class="option-title">{type.name}</span>
                {#if type.motivation}<span class="option-detail">{type.motivation}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
        <label class="field">
          <span class="field-label">Motivation</span>
          <input type="text" bind:value={wizard.motivation} placeholder="What does it want?" />
        </label>
      </section>
    {:else if currentStep === 1}
      <section class="panel">
        <h2 class="section-title">Powers</h2>
        {#if wizard.powers.length > 0}
          <ul class="row-list">
            {#each wizard.powers as power, index (index)}
              <li class="row">
                <span class="row-text">{power}</span>
                <button type="button" class="icon-button" onclick={() => removePower(index)}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="add-row">
          <input
            type="text"
            placeholder="Add a power"
            bind:value={powerDraft}
            onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addPower())}
          />
          <button type="button" class="submit-button" onclick={addPower}>Add</button>
        </div>

        <h2 class="section-title">Weaknesses</h2>
        {#if wizard.weaknesses.length > 0}
          <ul class="row-list">
            {#each wizard.weaknesses as weakness, index (index)}
              <li class="row">
                <span class="row-text">{weakness}</span>
                <button type="button" class="icon-button" onclick={() => removeWeakness(index)}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="add-row">
          <input
            type="text"
            placeholder="Add a weakness"
            bind:value={weaknessDraft}
            onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addWeakness())}
          />
          <button type="button" class="submit-button" onclick={addWeakness}>Add</button>
        </div>
      </section>
    {:else if currentStep === 2}
      <section class="panel">
        <h2 class="section-title">Attacks</h2>
        {#if wizard.attacks.length > 0}
          <ul class="row-list">
            {#each wizard.attacks as attack, index (index)}
              <li class="row">
                <span class="row-text">{attack.name} &middot; Harm {attack.harm}{attack.tags.length > 0 ? ` — ${attack.tags.join(", ")}` : ""}</span>
                <button type="button" class="icon-button" onclick={() => removeAttack(index)}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="attack-form">
          <label class="field">
            <span class="field-label">Attack name</span>
            <input type="text" bind:value={attackNameDraft} placeholder="Attack name" />
          </label>
          <label class="field">
            <span class="field-label">Harm</span>
            <input type="number" min="0" step="1" bind:value={attackHarmDraft} />
          </label>
          <label class="field">
            <span class="field-label">Tags (comma separated)</span>
            <input type="text" bind:value={attackTagsDraft} placeholder="e.g. forceful, area" />
          </label>
          <button type="button" class="submit-button" onclick={addAttack}>Add attack</button>
        </div>
      </section>
    {:else if currentStep === 3}
      <section class="panel">
        <h2 class="section-title">Armor & Harm capacity</h2>
        <label class="field">
          <span class="field-label">Armor</span>
          <input
            type="number"
            min="0"
            step="1"
            value={wizard.armor}
            oninput={(e) => onArmorInput(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field-label">Harm capacity</span>
          <input
            type="number"
            min="0"
            step="1"
            value={wizard.harmCapacity ?? ""}
            oninput={(e) => onHarmCapacityInput(e.currentTarget.value)}
          />
        </label>
      </section>
    {:else if currentStep === 4}
      <section class="panel">
        <h2 class="section-title">Custom moves</h2>
        {#if wizard.customMoves.length > 0}
          <ul class="row-list">
            {#each wizard.customMoves as move, index (index)}
              <li class="row">
                <span class="row-text">{move}</span>
                <button type="button" class="icon-button" onclick={() => removeCustomMove(index)}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="add-row">
          <input
            type="text"
            placeholder="Add a custom move"
            bind:value={customMoveDraft}
            onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomMove())}
          />
          <button type="button" class="submit-button" onclick={addCustomMove}>Add</button>
        </div>
      </section>
    {:else if currentStep === 5}
      <section class="panel">
        <h2 class="section-title">Name</h2>
        <label class="field">
          <span class="field-label">Monster name</span>
          <input type="text" bind:value={wizard.name} required />
        </label>
      </section>
    {:else if currentStep === 6}
      <section class="panel">
        <h2 class="section-title">Review</h2>
        <p class="meta">Type</p>
        <p>{wizard.type?.name ?? "None"}</p>
        <p class="meta">Motivation</p>
        <p>{wizard.motivation || "None"}</p>
        <p class="meta">Powers</p>
        <p>{wizard.powers.join(", ") || "None"}</p>
        <p class="meta">Weaknesses</p>
        <p>{wizard.weaknesses.join(", ") || "None"}</p>
        <p class="meta">Attacks</p>
        <p>{wizard.attacks.map((a) => `${a.name} (Harm ${a.harm})`).join(", ") || "None"}</p>
        <p class="meta">Armor</p>
        <p>{wizard.armor}</p>
        <p class="meta">Harm capacity</p>
        <p>{wizard.harmCapacity ?? "Not set"}</p>
        <p class="meta">Custom moves</p>
        <p>{wizard.customMoves.join(", ") || "None"}</p>
        <p class="meta">Name</p>
        <p>{wizard.name}</p>

        {#if submitError}
          <p class="error">{submitError}</p>
        {/if}

        <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create monster"}
        </button>
      </section>
    {/if}

    <div class="nav-row">
      <button type="button" class="submit-button" onclick={back} disabled={currentStep === 0}>Back</button>
      {#if currentStep < STEP_LABELS.length - 1}
        <button type="button" class="submit-button" onclick={next} disabled={!stepComplete[currentStep]}>Next</button>
      {/if}
    </div>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    max-width: 40rem;
  }

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

  .section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .option-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .option-list.stacked {
    flex-direction: column;
  }

  .option-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-height: var(--tap-min);
    padding: var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
  }

  .option-card.selected {
    border-color: var(--accent);
  }

  .option-title {
    font-family: var(--font-body);
    font-weight: 700;
    color: var(--ink);
  }

  .option-detail {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  input:focus-visible,
  .option-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .row-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .row-text {
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--ink);
  }

  .icon-button {
    min-height: var(--tap-min);
    padding: var(--space-1) var(--space-3);
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

  .icon-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .add-row {
    display: flex;
    gap: var(--space-2);
  }

  .add-row input {
    flex: 1;
  }

  .attack-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .nav-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
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
