<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { CharacterSchema, type Campaign, type Character, type PlaybookDef } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { generateUuid } from "$lib/uuid.js";
  import { writeEntity } from "$lib/sync.js";
  import StepIndicator from "$lib/StepIndicator.svelte";
  import {
    buildCharacterPayload,
    emptyWizardState,
    flattenPlaybooks,
    isGearStepComplete,
    isLooksStepComplete,
    isMovesStepComplete,
    isNameStepComplete,
    isPlaybookStepComplete,
    isRatingsStepComplete,
    selectPlaybook,
    type WizardState
  } from "$lib/character-builder.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  const STEP_LABELS = ["Playbook", "Ratings", "Looks", "Moves", "Gear", "Name", "Review"];

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let availablePlaybooks = $state<PlaybookDef[]>([]);

  let wizard = $state<WizardState>(emptyWizardState());
  let currentStep = $state(0);

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Character | null>(null);

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
        const packs = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        const loaded = packs.filter((p): p is PackDetail => p !== null);
        availablePlaybooks = flattenPlaybooks(loaded.map((p) => p.pack));
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });

  const stepComplete = $derived([
    isPlaybookStepComplete(wizard),
    isRatingsStepComplete(wizard),
    isLooksStepComplete(wizard),
    isMovesStepComplete(wizard),
    isGearStepComplete(wizard),
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

  function onSelectPlaybook(playbook: PlaybookDef): void {
    wizard = selectPlaybook(wizard, playbook);
  }

  function toggleMove(id: string): void {
    if (!wizard.playbook) return;
    const idx = wizard.moveIds.indexOf(id);
    if (idx >= 0) {
      wizard.moveIds = wizard.moveIds.filter((m) => m !== id);
    } else if (wizard.moveIds.length < wizard.playbook.movesToPick) {
      wizard.moveIds = [...wizard.moveIds, id];
    }
  }

  function toggleGearOption(choiceId: string, optionId: string, pick: number): void {
    const current = wizard.gearSelections[choiceId] ?? [];
    const idx = current.indexOf(optionId);
    let nextSelection: string[];
    if (idx >= 0) {
      nextSelection = current.filter((id) => id !== optionId);
    } else if (current.length < pick) {
      nextSelection = [...current, optionId];
    } else {
      nextSelection = current;
    }
    wizard.gearSelections = { ...wizard.gearSelections, [choiceId]: nextSelection };
  }

  async function onSubmit(): Promise<void> {
    if (!sessionState.user) return;
    const id = generateUuid();
    const payload = buildCharacterPayload({ id, campaignId: data.id, ownerUserId: sessionState.user.id, state: wizard });
    if (!payload) {
      submitError = "Something is missing; go back and complete every step.";
      return;
    }
    const result = CharacterSchema.safeParse(payload);
    if (!result.success) {
      submitError = "Could not validate the character.";
      return;
    }

    submitting = true;
    submitError = null;
    try {
      await writeEntity("character", data.id, id, result.data);
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
    <h1 class="title">Character created</h1>
    <p class="meta">{created.name} joins the case.</p>
    <a
      class="submit-button"
      href={resolve("/campaigns/[id]/characters/[characterId]", { id: data.id, characterId: created.id })}
    >
      View character sheet
    </a>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else if availablePlaybooks.length === 0}
    <h1 class="title">New character</h1>
    <p class="meta">Ask your Keeper to attach a content pack with playbooks.</p>
  {:else}
    <h1 class="title">New character</h1>
    <StepIndicator steps={STEP_LABELS} current={currentStep} />

    {#if currentStep === 0}
      <section class="panel">
        <h2 class="section-title">Playbook</h2>
        <div class="option-list stacked">
          {#each availablePlaybooks as playbook (playbook.id)}
            <button
              type="button"
              class="option-card"
              class:selected={wizard.playbook?.id === playbook.id}
              onclick={() => onSelectPlaybook(playbook)}
            >
              <span class="option-title">{playbook.name}</span>
              {#if playbook.blurb}<span class="option-detail">{playbook.blurb}</span>{/if}
            </button>
          {/each}
        </div>
      </section>
    {:else if currentStep === 1 && wizard.playbook}
      <section class="panel">
        <h2 class="section-title">Ratings line</h2>
        <div class="option-list stacked">
          {#each wizard.playbook.ratingsLines as line, index (index)}
            <button
              type="button"
              class="option-card"
              class:selected={wizard.ratings === line}
              onclick={() => (wizard.ratings = line)}
            >
              <span class="option-title">
                Charm {line.charm}, Cool {line.cool}, Sharp {line.sharp}, Tough {line.tough}, Weird {line.weird}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {:else if currentStep === 2 && wizard.playbook}
      <section class="panel">
        <h2 class="section-title">Look</h2>
        {#each wizard.playbook.looks as group, groupIndex (groupIndex)}
          <div class="look-group">
            <span class="field-label">Look choice {groupIndex + 1}</span>
            <div class="option-list">
              {#each group as option (option)}
                <button
                  type="button"
                  class="option-button"
                  class:selected={wizard.lookChoices[groupIndex] === option}
                  onclick={() => (wizard.lookChoices[groupIndex] = option)}
                >
                  {option}
                </button>
              {/each}
            </div>
            <input
              type="text"
              placeholder="Or write your own"
              value={wizard.lookChoices[groupIndex] ?? ""}
              oninput={(e) => (wizard.lookChoices[groupIndex] = e.currentTarget.value)}
            />
          </div>
        {/each}
      </section>
    {:else if currentStep === 3 && wizard.playbook}
      <section class="panel">
        <h2 class="section-title">Moves</h2>
        <p class="meta">Pick {wizard.playbook.movesToPick} ({wizard.moveIds.length} chosen)</p>
        <div class="option-list stacked">
          {#each wizard.playbook.moves as move (move.id)}
            <button
              type="button"
              class="option-card"
              class:selected={wizard.moveIds.includes(move.id)}
              onclick={() => toggleMove(move.id)}
            >
              <span class="option-title">{move.name}</span>
              <span class="option-detail">{move.trigger}</span>
            </button>
          {/each}
        </div>
      </section>
    {:else if currentStep === 4 && wizard.playbook}
      <section class="panel">
        <h2 class="section-title">Gear</h2>
        {#each wizard.playbook.gearChoices as choice (choice.id)}
          <div class="look-group">
            <span class="field-label">{choice.label} - pick {choice.pick}</span>
            <div class="option-list stacked">
              {#each choice.options as option (option.id)}
                <button
                  type="button"
                  class="option-card"
                  class:selected={(wizard.gearSelections[choice.id] ?? []).includes(option.id)}
                  onclick={() => toggleGearOption(choice.id, option.id, choice.pick)}
                >
                  <span class="option-title">{option.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {:else if currentStep === 5}
      <section class="panel">
        <h2 class="section-title">Name</h2>
        <label class="field">
          <span class="field-label">Character name</span>
          <input type="text" bind:value={wizard.name} required />
        </label>
      </section>
    {:else if currentStep === 6 && wizard.playbook && wizard.ratings}
      <section class="panel">
        <h2 class="section-title">Review</h2>
        <p class="meta">Playbook</p>
        <p>{wizard.playbook.name}</p>
        <p class="meta">Ratings</p>
        <p>
          Charm {wizard.ratings.charm}, Cool {wizard.ratings.cool}, Sharp {wizard.ratings.sharp}, Tough
          {wizard.ratings.tough}, Weird {wizard.ratings.weird}
        </p>
        <p class="meta">Look</p>
        <p>{wizard.lookChoices.join(", ")}</p>
        <p class="meta">Moves</p>
        <p>{wizard.playbook.moves.filter((m) => wizard.moveIds.includes(m.id)).map((m) => m.name).join(", ")}</p>
        <p class="meta">Gear</p>
        <p>
          {wizard.playbook.gearChoices
            .flatMap((c) => c.options.filter((o) => (wizard.gearSelections[c.id] ?? []).includes(o.id)))
            .map((o) => o.name)
            .join(", ")}
        </p>
        <p class="meta">Name</p>
        <p>{wizard.name}</p>

        {#if submitError}
          <p class="error">{submitError}</p>
        {/if}

        <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create character"}
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

  .option-button {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .option-button.selected {
    border-color: var(--accent);
    color: var(--accent);
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

  .look-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
  .option-button:focus-visible,
  .option-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
