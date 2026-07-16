<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    MysterySchema,
    type Bystander,
    type CountdownStep,
    type Location,
    type Minion,
    type Monster,
    type Mystery,
    type MysteryStatus
  } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { db, type LocalEntity } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import RevealToggle from "$lib/RevealToggle.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  const STATUS_OPTIONS: MysteryStatus[] = ["draft", "active", "resolved"];

  let mystery = $state<Mystery | null>(null);
  let notFound = $state(false);
  let isKeeper = $state(false);

  let conceptDraft = $state("");
  let hookDraft = $state("");
  let keeperNotesDraft = $state("");
  let countdownDrafts = $state<CountdownStep[]>([]);

  let castMonsters = $state<Monster[]>([]);
  let castMinions = $state<Minion[]>([]);
  let castBystanders = $state<Bystander[]>([]);
  let castLocations = $state<Location[]>([]);

  function isLive(row: LocalEntity | undefined): row is LocalEntity {
    return row !== undefined && !row.deleted;
  }

  async function loadCast(m: Mystery): Promise<void> {
    const [monsterRows, minionRows, bystanderRows, locationRows] = await Promise.all([
      db.entities.bulkGet(m.monsterIds),
      db.entities.bulkGet(m.minionIds),
      db.entities.bulkGet(m.bystanderIds),
      db.entities.bulkGet(m.locationIds)
    ]);
    castMonsters = monsterRows.filter(isLive).map((row) => row.payload as unknown as Monster);
    castMinions = minionRows.filter(isLive).map((row) => row.payload as unknown as Minion);
    castBystanders = bystanderRows.filter(isLive).map((row) => row.payload as unknown as Bystander);
    castLocations = locationRows.filter(isLive).map((row) => row.payload as unknown as Location);
  }

  async function loadMystery(): Promise<void> {
    const row = await db.entities.get(data.mysteryId);
    if (!row || row.deleted || row.type !== "mystery" || row.campaignId !== data.id) {
      mystery = null;
      notFound = true;
      return;
    }
    const parsed = MysterySchema.safeParse(row.payload);
    if (!parsed.success) {
      mystery = null;
      notFound = true;
      return;
    }
    mystery = parsed.data;
    conceptDraft = parsed.data.concept;
    hookDraft = parsed.data.hook;
    keeperNotesDraft = parsed.data.keeperNotes;
    countdownDrafts = parsed.data.countdown.steps.map((step) => ({ ...step }));
    notFound = false;
    await loadCast(parsed.data);
  }

  /**
   * Applies a field change locally-first (same pattern as the monster and
   * location sheets): validates the full updated Mystery, updates the
   * `mystery` $state optimistically, then queues the write via writeEntity.
   * Only reachable from Keeper-gated controls below.
   */
  async function applyUpdate(patch: Partial<Mystery>): Promise<void> {
    if (!mystery) return;
    const result = MysterySchema.safeParse({ ...mystery, ...patch });
    if (!result.success) return;
    mystery = result.data;
    await writeEntity("mystery", data.id, result.data.id, result.data);
  }

  let conceptTimer: ReturnType<typeof setTimeout> | undefined;
  function onConceptInput(): void {
    if (conceptTimer) clearTimeout(conceptTimer);
    conceptTimer = setTimeout(() => void applyUpdate({ concept: conceptDraft }), 600);
  }

  let hookTimer: ReturnType<typeof setTimeout> | undefined;
  function onHookInput(): void {
    if (hookTimer) clearTimeout(hookTimer);
    hookTimer = setTimeout(() => void applyUpdate({ hook: hookDraft }), 600);
  }

  let keeperNotesTimer: ReturnType<typeof setTimeout> | undefined;
  function onKeeperNotesInput(): void {
    if (keeperNotesTimer) clearTimeout(keeperNotesTimer);
    keeperNotesTimer = setTimeout(() => void applyUpdate({ keeperNotes: keeperNotesDraft }), 600);
  }

  function onSelectStatus(status: MysteryStatus): void {
    void applyUpdate({ status });
  }

  /**
   * Countdown edits write immediately for structural changes (add/remove/
   * reorder/toggle done) since those are discrete clicks, not keystrokes.
   * Label/text edits are debounced the same way concept/hook are.
   */
  function addCountdownStep(): void {
    const steps = [...countdownDrafts, { label: "", text: "", done: false }];
    countdownDrafts = steps;
    void applyUpdate({ countdown: { steps } });
  }

  function removeCountdownStep(index: number): void {
    const steps = countdownDrafts.filter((_, i) => i !== index);
    countdownDrafts = steps;
    void applyUpdate({ countdown: { steps } });
  }

  function moveCountdownStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= countdownDrafts.length) return;
    const steps = [...countdownDrafts];
    const moved = steps[index]!;
    steps[index] = steps[target]!;
    steps[target] = moved;
    countdownDrafts = steps;
    void applyUpdate({ countdown: { steps } });
  }

  function toggleCountdownDone(index: number): void {
    const steps = countdownDrafts.map((step, i) => (i === index ? { ...step, done: !step.done } : step));
    countdownDrafts = steps;
    void applyUpdate({ countdown: { steps } });
  }

  let countdownTimer: ReturnType<typeof setTimeout> | undefined;
  function onCountdownDraftInput(): void {
    if (countdownTimer) clearTimeout(countdownTimer);
    countdownTimer = setTimeout(() => void applyUpdate({ countdown: { steps: countdownDrafts } }), 600);
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
        void loadMystery();
      });

    getCampaign(data.id)
      .then((result) => {
        isKeeper = result.keeperUserId === sessionState.user?.id;
      })
      .catch(() => {});
  });
</script>

<main>
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if notFound}
    <p class="error">Mystery not found.</p>
  {:else if !mystery}
    <p class="meta">Loading...</p>
  {:else}
    <header class="sheet-header">
      <h1 class="title">{mystery.title}</h1>
      {#if isKeeper}
        <RevealToggle revealed={mystery.revealed} onToggle={() => applyUpdate({ revealed: !mystery?.revealed })} />
      {/if}
      {#if isKeeper}
        <div class="option-list">
          {#each STATUS_OPTIONS as option (option)}
            <button
              type="button"
              class="option-card"
              class:selected={mystery.status === option}
              onclick={() => onSelectStatus(option)}
            >
              {option}
            </button>
          {/each}
        </div>
      {:else}
        <p class="meta">{mystery.status}</p>
      {/if}
    </header>

    <section class="panel">
      <h2 class="section-title">Concept</h2>
      {#if isKeeper}
        <textarea class="form-textarea" bind:value={conceptDraft} oninput={onConceptInput} placeholder="What's really going on?"></textarea>
      {:else}
        <p>{mystery.concept || "None"}</p>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Hook</h2>
      {#if isKeeper}
        <textarea class="form-textarea" bind:value={hookDraft} oninput={onHookInput} placeholder="How do the hunters get pulled in?"></textarea>
      {:else}
        <p>{mystery.hook || "None"}</p>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Countdown</h2>
      {#if countdownDrafts.length === 0}
        <p class="meta">No countdown steps.</p>
      {:else}
        <ul class="row-list">
          {#each countdownDrafts as step, index (index)}
            <li class="countdown-row">
              {#if isKeeper}
                <input type="text" class="countdown-label" placeholder="Step label" bind:value={step.label} oninput={onCountdownDraftInput} />
                <textarea class="countdown-text" placeholder="What happens" bind:value={step.text} oninput={onCountdownDraftInput}></textarea>
                <div class="countdown-actions">
                  <button type="button" class="icon-button" onclick={() => toggleCountdownDone(index)}>
                    {step.done ? "Mark not done" : "Mark done"}
                  </button>
                  <button type="button" class="icon-button" onclick={() => moveCountdownStep(index, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button
                    type="button"
                    class="icon-button"
                    onclick={() => moveCountdownStep(index, 1)}
                    disabled={index === countdownDrafts.length - 1}
                  >
                    Down
                  </button>
                  <button type="button" class="icon-button" onclick={() => removeCountdownStep(index)}>Remove</button>
                </div>
              {:else}
                <span class="row-text" class:done={step.done}>{step.label}</span>
                {#if step.text}<p class="meta">{step.text}</p>{/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if isKeeper}
        <button type="button" class="submit-button" onclick={addCountdownStep}>Add a step</button>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Cast</h2>
      {#if castMonsters.length === 0 && castMinions.length === 0 && castBystanders.length === 0}
        <p class="meta">No cast attached.</p>
      {:else}
        <ul class="text-list">
          {#each castMonsters as monster (monster.id)}
            <li><a class="entity-link" href={resolve("/campaigns/[id]/monsters/[monsterId]", { id: data.id, monsterId: monster.id })}>{monster.name}</a> (Monster)</li>
          {/each}
          {#each castMinions as minion (minion.id)}
            <li><a class="entity-link" href={resolve("/campaigns/[id]/minions/[minionId]", { id: data.id, minionId: minion.id })}>{minion.name}</a> (Minion)</li>
          {/each}
          {#each castBystanders as bystander (bystander.id)}
            <li><a class="entity-link" href={resolve("/campaigns/[id]/bystanders/[bystanderId]", { id: data.id, bystanderId: bystander.id })}>{bystander.name}</a> (Bystander)</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Locations</h2>
      {#if castLocations.length === 0}
        <p class="meta">No locations attached.</p>
      {:else}
        <ul class="text-list">
          {#each castLocations as location (location.id)}
            <li><a class="entity-link" href={resolve("/campaigns/[id]/locations/[locationId]", { id: data.id, locationId: location.id })}>{location.name}</a></li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if isKeeper}
      <section class="panel">
        <h2 class="section-title">Keeper notes</h2>
        <textarea class="form-textarea" bind:value={keeperNotesDraft} oninput={onKeeperNotesInput} placeholder="Prep notes only the Keeper sees."></textarea>
      </section>
    {/if}
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

  .sheet-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
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
    align-items: flex-start;
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

  .option-card {
    display: flex;
    align-items: center;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-transform: capitalize;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
  }

  .option-card.selected {
    border-color: var(--accent);
  }

  .option-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .form-textarea,
  .countdown-label,
  .countdown-text {
    width: 100%;
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
    resize: vertical;
  }

  .countdown-text {
    min-height: 4rem;
    resize: vertical;
  }

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

  .countdown-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .row-text {
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--ink);
  }

  .row-text.done {
    text-decoration: line-through;
    color: var(--ink-muted);
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

  .text-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding-left: var(--space-4);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .entity-link {
    color: var(--ink);
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
  }

  .submit-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
