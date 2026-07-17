<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    MysterySchema,
    type Bystander,
    type Campaign,
    type Location,
    type Minion,
    type Monster,
    type Mystery,
    type MysteryStatus
  } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { db } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import { generateUuid } from "$lib/uuid.js";
  import StepIndicator from "$lib/StepIndicator.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import {
    addCountdownStep,
    buildMysteryPayload,
    countdownStepReason,
    emptyMysteryWizardState,
    isCastStepComplete,
    isConceptHookStepComplete,
    isCountdownStepComplete,
    isLocationsStepComplete,
    isStatusStepComplete,
    isTitleStepComplete,
    moveCountdownStep,
    removeCountdownStep,
    titleStepReason,
    toggleCastId,
    type MysteryWizardState
  } from "$lib/mystery-builder.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  const STEP_LABELS = ["Title", "Concept & Hook", "Countdown", "Cast", "Locations", "Status", "Review"];
  const STATUS_OPTIONS: MysteryStatus[] = ["draft", "active", "resolved"];

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let notKeeper = $state(false);

  let monsters = $state<Monster[]>([]);
  let minions = $state<Minion[]>([]);
  let bystanders = $state<Bystander[]>([]);
  let locations = $state<Location[]>([]);

  let wizard = $state<MysteryWizardState>(emptyMysteryWizardState());
  let currentStep = $state(0);

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let created = $state<Mystery | null>(null);

  /**
   * Loads this campaign's already-created Monster/Minion/Bystander/Location
   * entities from local IndexedDB for the cast/locations picker. These are
   * not pack-sourced (unlike playbooks or monster archetypes), so there is
   * no flatten-from-packs step here.
   */
  async function loadCastOptions(): Promise<void> {
    const [monsterRows, minionRows, bystanderRows, locationRows] = await Promise.all([
      db.entities.where("[campaignId+type]").equals([data.id, "monster"]).and((row) => !row.deleted).toArray(),
      db.entities.where("[campaignId+type]").equals([data.id, "minion"]).and((row) => !row.deleted).toArray(),
      db.entities.where("[campaignId+type]").equals([data.id, "bystander"]).and((row) => !row.deleted).toArray(),
      db.entities.where("[campaignId+type]").equals([data.id, "location"]).and((row) => !row.deleted).toArray()
    ]);
    monsters = monsterRows.map((row) => row.payload as unknown as Monster).sort((a, b) => a.name.localeCompare(b.name));
    minions = minionRows.map((row) => row.payload as unknown as Minion).sort((a, b) => a.name.localeCompare(b.name));
    bystanders = bystanderRows
      .map((row) => row.payload as unknown as Bystander)
      .sort((a, b) => a.name.localeCompare(b.name));
    locations = locationRows
      .map((row) => row.payload as unknown as Location)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then((result) => {
        campaign = result;
        loadError = null;
        if (result.keeperUserId !== sessionState.user?.id) {
          notKeeper = true;
          return;
        }
        pull(data.id)
          .catch(() => {})
          .finally(() => {
            void loadCastOptions();
          });
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });

  const stepComplete = $derived([
    isTitleStepComplete(wizard),
    isConceptHookStepComplete(wizard),
    isCountdownStepComplete(wizard),
    isCastStepComplete(wizard),
    isLocationsStepComplete(wizard),
    isStatusStepComplete(wizard),
    true
  ]);

  const stepReasons = $derived([
    titleStepReason(wizard),
    null,
    countdownStepReason(wizard),
    null,
    null,
    null,
    null
  ]);

  function next(): void {
    if (!stepComplete[currentStep]) return;
    currentStep = Math.min(currentStep + 1, STEP_LABELS.length - 1);
  }

  function back(): void {
    currentStep = Math.max(currentStep - 1, 0);
  }

  function onAddCountdownStep(): void {
    wizard = addCountdownStep(wizard);
  }

  function onRemoveCountdownStep(index: number): void {
    wizard = removeCountdownStep(wizard, index);
  }

  function onMoveCountdownStep(index: number, direction: -1 | 1): void {
    wizard = moveCountdownStep(wizard, index, direction);
  }

  function onToggleMonster(id: string): void {
    wizard = { ...wizard, monsterIds: toggleCastId(wizard.monsterIds, id) };
  }

  function onToggleMinion(id: string): void {
    wizard = { ...wizard, minionIds: toggleCastId(wizard.minionIds, id) };
  }

  function onToggleBystander(id: string): void {
    wizard = { ...wizard, bystanderIds: toggleCastId(wizard.bystanderIds, id) };
  }

  function onToggleLocation(id: string): void {
    wizard = { ...wizard, locationIds: toggleCastId(wizard.locationIds, id) };
  }

  function onSelectStatus(status: MysteryStatus): void {
    wizard = { ...wizard, status };
  }

  async function onSubmit(): Promise<void> {
    const id = generateUuid();
    const payload = buildMysteryPayload({ id, campaignId: data.id, state: wizard });
    if (!payload) {
      submitError = "Something is missing; go back and complete every step.";
      return;
    }
    const result = MysterySchema.safeParse(payload);
    if (!result.success) {
      submitError = "Could not validate the mystery.";
      return;
    }

    submitting = true;
    submitError = null;
    try {
      await writeEntity("mystery", data.id, id, result.data);
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
  {:else if notKeeper}
    <p class="error">Only the Keeper can create a mystery.</p>
  {:else if created}
    <h1 class="title">Mystery created</h1>
    <p class="meta">{created.title} is ready to run.</p>
    <a class="submit-button" href={resolve("/campaigns/[id]/mysteries/[mysteryId]", { id: data.id, mysteryId: created.id })}>
      View mystery
    </a>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else}
    <h1 class="title">New mystery</h1>
    <StepIndicator steps={STEP_LABELS} current={currentStep} />

    {#if currentStep === 0}
      <section class="panel">
        <h2 class="section-title">Title</h2>
        <FieldNote>A mystery is one session's case: the monster, the trouble it's causing, and the trail your hunters follow. The title is just what you and your players call this case.</FieldNote>
        <label class="field">
          <span class="field-label">Mystery title</span>
          <input type="text" bind:value={wizard.title} required />
        </label>
      </section>
    {:else if currentStep === 1}
      <section class="panel">
        <h2 class="section-title">Concept</h2>
        <FieldNote>The concept is what's really going on behind the scenes, for your eyes only. The hook is how the hunters get pulled into it. Both are optional and can be filled in later.</FieldNote>
        <textarea class="form-textarea" bind:value={wizard.concept} placeholder="What's really going on?"></textarea>
        <h2 class="section-title">Hook</h2>
        <textarea class="form-textarea" bind:value={wizard.hook} placeholder="How do the hunters get pulled in?"></textarea>
      </section>
    {:else if currentStep === 2}
      <section class="panel">
        <h2 class="section-title">Countdown</h2>
        <FieldNote>The countdown is the mystery's clock: a short ordered list of things that happen if the hunters don't intervene. Optional, and you can keep adjusting it as you run the session.</FieldNote>
        {#if wizard.countdownSteps.length > 0}
          <ul class="row-list">
            {#each wizard.countdownSteps as step, index (index)}
              <li class="countdown-row">
                <input type="text" class="countdown-label" placeholder="Step label" bind:value={step.label} />
                <textarea class="countdown-text" placeholder="What happens" bind:value={step.text}></textarea>
                <div class="countdown-actions">
                  <button type="button" class="icon-button" onclick={() => onMoveCountdownStep(index, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button
                    type="button"
                    class="icon-button"
                    onclick={() => onMoveCountdownStep(index, 1)}
                    disabled={index === wizard.countdownSteps.length - 1}
                  >
                    Down
                  </button>
                  <button type="button" class="icon-button" onclick={() => onRemoveCountdownStep(index)}>Remove</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        <button type="button" class="submit-button" onclick={onAddCountdownStep}>Add a step</button>
      </section>
    {:else if currentStep === 3}
      <section class="panel">
        <FieldNote>The cast is which monsters, minions, and bystanders (already-created world entities) appear in this mystery. Optional, and only affects this mystery's own record; it doesn't reveal anything to your players.</FieldNote>
        <h2 class="section-title">Monsters</h2>
        {#if monsters.length === 0}
          <p class="meta">No monsters created yet.</p>
        {:else}
          <div class="option-list stacked">
            {#each monsters as monster (monster.id)}
              <button
                type="button"
                class="option-card"
                class:selected={wizard.monsterIds.includes(monster.id)}
                onclick={() => onToggleMonster(monster.id)}
              >
                {monster.name}
              </button>
            {/each}
          </div>
        {/if}

        <h2 class="section-title">Minions</h2>
        {#if minions.length === 0}
          <p class="meta">No minions created yet.</p>
        {:else}
          <div class="option-list stacked">
            {#each minions as minion (minion.id)}
              <button
                type="button"
                class="option-card"
                class:selected={wizard.minionIds.includes(minion.id)}
                onclick={() => onToggleMinion(minion.id)}
              >
                {minion.name}
              </button>
            {/each}
          </div>
        {/if}

        <h2 class="section-title">Bystanders</h2>
        {#if bystanders.length === 0}
          <p class="meta">No bystanders created yet.</p>
        {:else}
          <div class="option-list stacked">
            {#each bystanders as bystander (bystander.id)}
              <button
                type="button"
                class="option-card"
                class:selected={wizard.bystanderIds.includes(bystander.id)}
                onclick={() => onToggleBystander(bystander.id)}
              >
                {bystander.name}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if currentStep === 4}
      <section class="panel">
        <h2 class="section-title">Locations</h2>
        <FieldNote>Places (already-created world entities) tied to this mystery. Optional, same as cast: it's for your own planning and doesn't reveal anything to players.</FieldNote>
        {#if locations.length === 0}
          <p class="meta">No locations created yet.</p>
        {:else}
          <div class="option-list stacked">
            {#each locations as location (location.id)}
              <button
                type="button"
                class="option-card"
                class:selected={wizard.locationIds.includes(location.id)}
                onclick={() => onToggleLocation(location.id)}
              >
                {location.name}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if currentStep === 5}
      <section class="panel">
        <h2 class="section-title">Status</h2>
        <FieldNote>Draft is still in planning, active is being played right now, resolved is done. You can change this anytime from the mystery's own page.</FieldNote>
        <div class="option-list">
          {#each STATUS_OPTIONS as option (option)}
            <button
              type="button"
              class="option-card"
              class:selected={wizard.status === option}
              onclick={() => onSelectStatus(option)}
            >
              {option}
            </button>
          {/each}
        </div>
      </section>
    {:else if currentStep === 6}
      <section class="panel">
        <h2 class="section-title">Review</h2>
        <FieldNote>Check everything below, then create this mystery. Concept, hook, and countdown all stay editable from the mystery's own page.</FieldNote>
        <div class="preview-card">
          <p class="preview-name">{wizard.title}</p>
          <p class="meta">{wizard.status}</p>
          {#if wizard.hook}<p class="preview-look">{wizard.hook}</p>{/if}
          {#if wizard.countdownSteps.length > 0}
            <div class="preview-section">
              <p class="meta">Countdown</p>
              <ol class="row-list">
                {#each wizard.countdownSteps as step (step.label)}
                  <li class="row"><span class="row-text">{step.label}</span></li>
                {/each}
              </ol>
            </div>
          {/if}
          {#if wizard.monsterIds.length + wizard.minionIds.length + wizard.bystanderIds.length > 0}
            <div class="preview-section">
              <p class="meta">Cast</p>
              <div class="option-list">
                {#each monsters.filter((m) => wizard.monsterIds.includes(m.id)) as monster (monster.id)}<EvidenceTag label={monster.name} />{/each}
                {#each minions.filter((m) => wizard.minionIds.includes(m.id)) as minion (minion.id)}<EvidenceTag label={minion.name} />{/each}
                {#each bystanders.filter((b) => wizard.bystanderIds.includes(b.id)) as bystander (bystander.id)}<EvidenceTag label={bystander.name} />{/each}
              </div>
            </div>
          {/if}
          {#if wizard.locationIds.length > 0}
            <div class="preview-section">
              <p class="meta">Locations</p>
              <div class="option-list">
                {#each locations.filter((l) => wizard.locationIds.includes(l.id)) as location (location.id)}<EvidenceTag label={location.name} />{/each}
              </div>
            </div>
          {/if}
        </div>

        {#if submitError}
          <p class="error">{submitError}</p>
        {/if}

        <button type="button" class="submit-button" onclick={onSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create mystery"}
        </button>
      </section>
    {/if}

    {#if stepReasons[currentStep]}
      <FieldNote>{stepReasons[currentStep]}</FieldNote>
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
    text-transform: capitalize;
  }

  .option-card.selected {
    border-color: var(--accent);
  }

  .option-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  input,
  .form-textarea,
  .countdown-label,
  .countdown-text {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .form-textarea {
    min-height: 6rem;
    resize: vertical;
  }

  input:focus-visible,
  .form-textarea:focus-visible,
  .countdown-label:focus-visible,
  .countdown-text:focus-visible {
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

  .countdown-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .countdown-text {
    min-height: 4rem;
    resize: vertical;
  }

  .countdown-actions {
    display: flex;
    gap: var(--space-2);
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

  .icon-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .icon-button:focus-visible {
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

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
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
