<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Bystander, Campaign, Location, Minion, Monster, Mystery } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign, updateCampaign } from "$lib/api/campaigns.js";
  import { db, type LocalEntity } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import { GLOSS } from "$lib/glossary.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let notKeeper = $state(false);

  let mysteries = $state<Mystery[]>([]);
  let selectedMysteryId = $state<string | null>(null);

  let castMonsters = $state<Monster[]>([]);
  let castMinions = $state<Minion[]>([]);
  let castBystanders = $state<Bystander[]>([]);
  let castLocations = $state<Location[]>([]);

  let arcNotesDraft = $state("");

  const selectedMystery = $derived(mysteries.find((m) => m.id === selectedMysteryId) ?? null);

  function isLive(row: LocalEntity | undefined): row is LocalEntity {
    return row !== undefined && !row.deleted;
  }

  async function loadMysteries(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "mystery"])
      .and((row) => !row.deleted)
      .toArray();
    mysteries = rows.map((row) => row.payload as unknown as Mystery).sort((a, b) => a.title.localeCompare(b.title));
  }

  async function loadCastForSelected(mystery: Mystery): Promise<void> {
    const [monsterRows, minionRows, bystanderRows, locationRows] = await Promise.all([
      db.entities.bulkGet(mystery.monsterIds),
      db.entities.bulkGet(mystery.minionIds),
      db.entities.bulkGet(mystery.bystanderIds),
      db.entities.bulkGet(mystery.locationIds)
    ]);
    castMonsters = monsterRows.filter(isLive).map((row) => row.payload as unknown as Monster);
    castMinions = minionRows.filter(isLive).map((row) => row.payload as unknown as Minion);
    castBystanders = bystanderRows.filter(isLive).map((row) => row.payload as unknown as Bystander);
    castLocations = locationRows.filter(isLive).map((row) => row.payload as unknown as Location);
  }

  function selectMystery(id: string): void {
    selectedMysteryId = id;
    const mystery = mysteries.find((m) => m.id === id);
    if (mystery) {
      void loadCastForSelected(mystery);
    }
  }

  function backToList(): void {
    selectedMysteryId = null;
  }

  /**
   * Arc notes live in Campaign.settings (a freeform record already on the
   * schema), not the sync-entity system: Campaign is not a SyncEntityType,
   * and Keeper-only admin screens are explicitly allowed to be online-only
   * (AGENTS.md rule 2), matching the existing pack-attach/invite actions on
   * the campaign page which are also plain REST calls.
   */
  let arcNotesTimer: ReturnType<typeof setTimeout> | undefined;
  function onArcNotesInput(): void {
    if (arcNotesTimer) clearTimeout(arcNotesTimer);
    arcNotesTimer = setTimeout(() => {
      void saveArcNotes();
    }, 600);
  }

  async function saveArcNotes(): Promise<void> {
    if (!campaign) return;
    try {
      campaign = await updateCampaign(data.id, {
        settings: { ...campaign.settings, arcNotes: arcNotesDraft }
      });
    } catch {
      // Best-effort: the next successful save will carry the latest draft.
    }
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
        const notes = result.settings["arcNotes"];
        arcNotesDraft = typeof notes === "string" ? notes : "";
        pull(data.id)
          .catch(() => {})
          .finally(() => {
            void loadMysteries();
          });
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if notKeeper}
    <p class="error">Only the {GLOSS.keeper} has a dashboard.</p>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else}
    <h1 class="title">{campaign.name} - Keeper dashboard</h1>
    <FieldNote>This is your prep space as the {GLOSS.keeper}: mysteries, arc notes, and session prep in one place.</FieldNote>

    <section class="panel">
      <h2 class="section-title">Arc notes</h2>
      <textarea
        class="form-textarea"
        bind:value={arcNotesDraft}
        oninput={onArcNotesInput}
        placeholder="Where is this campaign's story headed?"
      ></textarea>
    </section>

    <div class="dashboard">
      <div class="list-pane" class:hidden-mobile={selectedMysteryId !== null}>
        <section class="panel">
          <h2 class="section-title">Mysteries</h2>
          <a class="submit-button" href={resolve("/campaigns/[id]/mysteries/new", { id: data.id })}>Create a mystery</a>
          {#if mysteries.length === 0}
            <p class="meta">No mysteries yet.</p>
          {:else}
            <ul class="mystery-list">
              {#each mysteries as mystery (mystery.id)}
                <li>
                  <button
                    type="button"
                    class="mystery-row"
                    class:selected={selectedMysteryId === mystery.id}
                    onclick={() => selectMystery(mystery.id)}
                  >
                    <span class="mystery-title">{mystery.title}</span>
                    <EvidenceTag label={mystery.status} />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>

      <div class="detail-pane" class:hidden-mobile={selectedMysteryId === null}>
        {#if selectedMystery}
          <section class="panel">
            <button type="button" class="submit-button back-to-list" onclick={backToList}>Back to list</button>
            <header class="sheet-header">
              <h2 class="section-title">{selectedMystery.title}</h2>
              <EvidenceTag label={selectedMystery.status} />
            </header>

            {#if selectedMystery.concept}
              <p class="meta">Concept</p>
              <p>{selectedMystery.concept}</p>
            {/if}
            {#if selectedMystery.hook}
              <p class="meta">Hook</p>
              <p>{selectedMystery.hook}</p>
            {/if}

            <p class="meta">Countdown</p>
            {#if selectedMystery.countdown.steps.length === 0}
              <p>No countdown steps.</p>
            {:else}
              <ul class="countdown-list">
                {#each selectedMystery.countdown.steps as step, index (index)}
                  <li class:done={step.done}>{step.label}</li>
                {/each}
              </ul>
            {/if}

            <p class="meta">Cast</p>
            {#if castMonsters.length === 0 && castMinions.length === 0 && castBystanders.length === 0}
              <p>None attached.</p>
            {:else}
              <ul class="text-list">
                {#each castMonsters as monster (monster.id)}<li>{monster.name} (Monster)</li>{/each}
                {#each castMinions as minion (minion.id)}<li>{minion.name} (Minion)</li>{/each}
                {#each castBystanders as bystander (bystander.id)}<li>{bystander.name} (Bystander)</li>{/each}
              </ul>
            {/if}

            <p class="meta">Locations</p>
            {#if castLocations.length === 0}
              <p>None attached.</p>
            {:else}
              <ul class="text-list">
                {#each castLocations as location (location.id)}<li>{location.name}</li>{/each}
              </ul>
            {/if}

            <a
              class="submit-button"
              href={resolve("/campaigns/[id]/mysteries/[mysteryId]", { id: data.id, mysteryId: selectedMystery.id })}
            >
              Open full mystery sheet
            </a>
          </section>
        {:else}
          <section class="panel empty-detail">
            <p class="meta">Pick a mystery from the list to prep it.</p>
          </section>
        {/if}
      </div>
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

  .form-textarea {
    width: 100%;
    min-height: 5rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-base);
    resize: vertical;
  }

  .form-textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Two-pane Keeper dashboard (docs/DESIGN.md "Layout"): mystery list left,
     detail right on desktop; on mobile only one pane is visible at a time,
     toggled by selection, matching "collapses to list->detail navigation". */
  .dashboard {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  @media (min-width: 768px) {
    .dashboard {
      grid-template-columns: 20rem 1fr;
      align-items: start;
    }
  }

  @media (max-width: 767px) {
    .hidden-mobile {
      display: none;
    }
  }

  .mystery-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .mystery-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .mystery-row.selected {
    border-color: var(--accent);
  }

  .mystery-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .mystery-title {
    flex: 1;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .back-to-list {
    display: none;
  }

  @media (max-width: 767px) {
    .back-to-list {
      display: inline-flex;
    }
  }

  .countdown-list,
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

  .countdown-list li.done {
    text-decoration: line-through;
    color: var(--ink-muted);
  }

  .empty-detail {
    align-items: center;
    justify-content: center;
    min-height: 8rem;
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

  .submit-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
