<script lang="ts">
  /**
   * The numbered character-builder wizard (playbook, ratings, looks, moves,
   * gear, name, review), extracted from
   * client/src/routes/campaigns/[id]/characters/new/+page.svelte (0.13.2)
   * so it can also drive the standalone (campaign-less) creation route at
   * client/src/routes/characters/new/+page.svelte. Both callers own their
   * own data loading (campaign packs vs shared/self-owned packs) and empty
   * states; this component only owns the wizard steps and the
   * "character created" confirmation once playbooks are available.
   */
  import { resolve } from "$app/paths";
  import type { ResolvedPathname } from "$app/types";
  import { CharacterSchema, type Character, type PlaybookDef } from "@mowc/shared";
  import { generateUuid } from "$lib/uuid.js";
  import { writeEntity } from "$lib/sync.js";
  import StepIndicator from "$lib/StepIndicator.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import {
    buildCharacterPayload,
    emptyWizardState,
    gearStepReason,
    isGearStepComplete,
    isLooksStepComplete,
    isMovesStepComplete,
    isNameStepComplete,
    isPlaybookStepComplete,
    isRatingsStepComplete,
    looksStepReason,
    movesStepReason,
    nameStepReason,
    playbookStepReason,
    ratingsStepReason,
    resolveScopePlaybooks,
    selectPlaybook,
    type CampaignOption,
    type WizardState
  } from "$lib/character-builder.js";

  interface Props {
    /**
     * Pass a fixed campaign id to lock the wizard's scope to that campaign
     * (no campaign-picker step); the campaign route
     * (`campaigns/[id]/characters/new`) does this. Omit entirely to show a
     * campaign-picker step offering Standalone plus every campaign in
     * `campaignOptions` (the standalone `characters/new` route, 0.14.2).
     */
    lockedCampaignId?: string;
    /**
     * Seated campaigns the picker can switch scope to, each with its own
     * attached-pack playbooks preloaded by the route. Ignored when
     * `lockedCampaignId` is set.
     */
    campaignOptions?: CampaignOption[];
    ownerUserId: string;
    /**
     * Playbooks for the active scope: the locked campaign's attached packs
     * when `lockedCampaignId` is set, or the Standalone scope's own/shared
     * packs otherwise (used while the picker's "Standalone" option is
     * selected).
     */
    playbooks: PlaybookDef[];
    /** Called after the character is written locally, in addition to the
     * built-in "Character created" confirmation this component renders. */
    onCreated?: (character: Character) => void;
  }

  let { lockedCampaignId, campaignOptions = [], ownerUserId, playbooks, onCreated }: Props = $props();

  /** True for the campaign route, which locks scope and skips the picker step. */
  const isLocked = $derived(lockedCampaignId !== undefined);

  /** The character's scope: a real campaign id, or null for Standalone. Set
   * once from the initial prop value (a fresh component instance per route
   * visit); subsequent changes come only from the user via selectCampaign. */
  let selectedCampaignId = $state<string | null>(lockedCampaignId === undefined ? null : lockedCampaignId);

  const BASE_STEP_LABELS = ["Playbook", "Ratings", "Looks", "Moves", "Gear", "Name", "Review"];
  const stepLabels = $derived(isLocked ? BASE_STEP_LABELS : ["Campaign", ...BASE_STEP_LABELS]);

  /** Playbooks for the currently selected scope (0.14.2). */
  const activePlaybooks = $derived(
    resolveScopePlaybooks({ isLocked, selectedCampaignId, playbooks, campaignOptions })
  );

  let wizard = $state<WizardState>(emptyWizardState());
  let currentStep = $state(0);

  /** Index into the wizard's own (campaign-agnostic) steps: equal to
   * `currentStep` when locked, or one behind it when the leading Campaign
   * step is present. */
  const effectiveStep = $derived(isLocked ? currentStep : currentStep - 1);

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Character | null>(null);

  const baseStepComplete = $derived([
    isPlaybookStepComplete(wizard),
    isRatingsStepComplete(wizard),
    isLooksStepComplete(wizard),
    isMovesStepComplete(wizard),
    isGearStepComplete(wizard),
    isNameStepComplete(wizard),
    true
  ]);
  const stepComplete = $derived(isLocked ? baseStepComplete : [true, ...baseStepComplete]);

  const baseStepReasons = $derived([
    playbookStepReason(wizard),
    ratingsStepReason(wizard),
    looksStepReason(wizard),
    movesStepReason(wizard),
    gearStepReason(wizard),
    nameStepReason(wizard),
    null
  ]);
  const stepReasons = $derived(isLocked ? baseStepReasons : [null, ...baseStepReasons]);

  function next(): void {
    if (!stepComplete[currentStep]) return;
    currentStep = Math.min(currentStep + 1, stepLabels.length - 1);
  }

  function back(): void {
    currentStep = Math.max(currentStep - 1, 0);
  }

  function onSelectPlaybook(playbook: PlaybookDef): void {
    wizard = selectPlaybook(wizard, playbook);
  }

  /** Switching scope changes which playbooks are available, so the rest of
   * the wizard (playbook onward) resets, same as picking a different
   * playbook resets ratings/looks/moves/gear. */
  function selectCampaign(id: string | null): void {
    if (selectedCampaignId === id) return;
    selectedCampaignId = id;
    wizard = emptyWizardState();
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

  /** Where "View character sheet" points once created, campaign or standalone. */
  function sheetHref(characterId: string): ResolvedPathname {
    return selectedCampaignId
      ? resolve("/campaigns/[id]/characters/[characterId]", { id: selectedCampaignId, characterId })
      : resolve("/characters/[characterId]", { characterId });
  }

  async function onSubmit(): Promise<void> {
    const id = generateUuid();
    const payload = buildCharacterPayload({ id, campaignId: selectedCampaignId, ownerUserId, state: wizard });
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
      await writeEntity("character", selectedCampaignId ?? "standalone", id, result.data);
      created = result.data;
      onCreated?.(result.data);
    } finally {
      submitting = false;
    }
  }
</script>

{#if created}
  <h1 class="title">Character created</h1>
  <p class="meta">{created.name} joins the case.</p>
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- sheetHref() always returns a resolve()d path, dispatched by selectedCampaignId -->
  <a class="submit-button" href={sheetHref(created.id)}>View character sheet</a>
{:else}
  <h1 class="title">New character</h1>
  <StepIndicator steps={stepLabels} current={currentStep} />

  {#if !isLocked && currentStep === 0}
    <section class="panel">
      <h2 class="section-title">Campaign</h2>
      <FieldNote>Choose which campaign this hunter belongs to, or keep them Standalone with no campaign at all. This also decides which content packs' playbooks are available next.</FieldNote>
      <div class="option-list stacked">
        <button
          type="button"
          class="option-card"
          class:selected={selectedCampaignId === null}
          onclick={() => selectCampaign(null)}
        >
          <span class="option-title">Standalone</span>
          <span class="option-detail">No campaign; just this character.</span>
        </button>
        {#each campaignOptions as campaign (campaign.id)}
          <button
            type="button"
            class="option-card"
            class:selected={selectedCampaignId === campaign.id}
            onclick={() => selectCampaign(campaign.id)}
          >
            <span class="option-title">{campaign.name}</span>
          </button>
        {/each}
      </div>
    </section>
  {:else if effectiveStep === 0}
    <section class="panel">
      <h2 class="section-title">Playbook</h2>
      <FieldNote>Your playbook (a character template) sets your hunter's role in the story, along with their starting moves and gear. Choose the one that fits how you want to play.</FieldNote>
      <div class="option-list stacked">
        {#each activePlaybooks as playbook (playbook.id)}
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
  {:else if effectiveStep === 1 && wizard.playbook}
    <section class="panel">
      <h2 class="section-title">Ratings line</h2>
      <FieldNote>Ratings are the numbers you add when you roll dice for a move. A higher rating means better odds at that kind of action.</FieldNote>
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
  {:else if effectiveStep === 2 && wizard.playbook}
    <section class="panel">
      <h2 class="section-title">Look</h2>
      <FieldNote>A quick sketch of how your hunter looks and carries themselves. This is flavor, not rules; pick an option or write your own.</FieldNote>
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
  {:else if effectiveStep === 3 && wizard.playbook}
    <section class="panel">
      <h2 class="section-title">Moves</h2>
      <FieldNote>Moves (actions your character can roll dice for) are how you interact with the story mechanically. Pick the ones that fit how you want to play.</FieldNote>
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
  {:else if effectiveStep === 4 && wizard.playbook}
    <section class="panel">
      <h2 class="section-title">Gear</h2>
      <FieldNote>Gear is equipment your hunter starts with. Some playbooks offer a choice between a few options; others hand you a fixed loadout.</FieldNote>
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
  {:else if effectiveStep === 5}
    <section class="panel">
      <h2 class="section-title">Name</h2>
      <FieldNote>What your hunter goes by. You can still edit ratings, moves, and notes later from the character sheet, but the playbook is set for good once you create this character.</FieldNote>
      <label class="field">
        <span class="field-label">Character name</span>
        <input type="text" bind:value={wizard.name} required />
      </label>
    </section>
  {:else if effectiveStep === 6 && wizard.playbook && wizard.ratings}
    <section class="panel">
      <h2 class="section-title">Review</h2>
      <FieldNote>Check everything below, then create your hunter.</FieldNote>
      <div class="preview-card">
        <p class="preview-name">{wizard.name || "Unnamed hunter"}</p>
        {#if !isLocked}
          <p class="meta">
            {selectedCampaignId
              ? (campaignOptions.find((c) => c.id === selectedCampaignId)?.name ?? "Campaign")
              : "Standalone"}
          </p>
        {/if}
        <p class="meta">{wizard.playbook.name}</p>
        {#if wizard.lookChoices.some((choice) => choice.trim())}
          <p class="preview-look">{wizard.lookChoices.filter((choice) => choice.trim()).join(", ")}</p>
        {/if}
        <div class="preview-ratings">
          <span class="preview-rating"><span class="preview-rating-label">Charm</span>{wizard.ratings.charm}</span>
          <span class="preview-rating"><span class="preview-rating-label">Cool</span>{wizard.ratings.cool}</span>
          <span class="preview-rating"><span class="preview-rating-label">Sharp</span>{wizard.ratings.sharp}</span>
          <span class="preview-rating"><span class="preview-rating-label">Tough</span>{wizard.ratings.tough}</span>
          <span class="preview-rating"><span class="preview-rating-label">Weird</span>{wizard.ratings.weird}</span>
        </div>
        <div class="preview-section">
          <p class="meta">Moves</p>
          <div class="option-list">
            {#each wizard.playbook.moves.filter((m) => wizard.moveIds.includes(m.id)) as move (move.id)}
              <EvidenceTag label={move.name} />
            {/each}
          </div>
        </div>
        <div class="preview-section">
          <p class="meta">Gear</p>
          <div class="option-list">
            {#each wizard.playbook.gearChoices.flatMap((c) => c.options.filter((o) => (wizard.gearSelections[c.id] ?? []).includes(o.id))) as item (item.id)}
              <EvidenceTag label={item.name} />
            {:else}
              <p class="preview-empty">No gear.</p>
            {/each}
          </div>
        </div>
      </div>

      {#if submitError}
        <p class="error">{submitError}</p>
      {/if}

      <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting}>
        {submitting ? "Creating..." : "Create character"}
      </button>
    </section>
  {/if}

  {#if stepReasons[currentStep]}
    <FieldNote>{stepReasons[currentStep]}</FieldNote>
  {/if}

  <div class="nav-row">
    <button type="button" class="submit-button" onclick={back} disabled={currentStep === 0}>Back</button>
    {#if currentStep < stepLabels.length - 1}
      <button type="button" class="submit-button" onclick={next} disabled={!stepComplete[currentStep]}>Next</button>
    {/if}
  </div>
{/if}

<style>
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

  /* Review step's compact preview (docs/DESIGN.md Builders: "a compact
     preview of the thing being created", not a flat label/value list). */
  .preview-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .preview-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .preview-look {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .preview-ratings {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .preview-rating {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    color: var(--ink);
  }

  .preview-rating-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .preview-empty {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
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
