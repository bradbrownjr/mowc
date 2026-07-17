<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { CharacterSchema, type Character, type ContentPack, type ImprovementDef, type MoveDef } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { db } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import {
    DEFAULT_HARM_TRACK,
    DEFAULT_LUCK_MAX,
    resolveCharacterMoves,
    resolveCharacterPlaybook
  } from "$lib/character-sheet.js";
  import { crossesUnstable, nextTrackValue } from "$lib/track-tap.js";
  import {
    allBasicImprovementsTaken,
    applyImprovement,
    eligibleAdvancedImprovements,
    eligibleImprovements,
    pickableMoves
  } from "$lib/level-up.js";
  import { rollMove, type RollResult } from "$lib/dice.js";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import DiceBanner from "$lib/DiceBanner.svelte";
  import type { PageProps } from "./$types.js";

  // Fixed engine constant (docs/DATA-MODEL.md): 5 experience = an
  // improvement. NOT pack-configurable; there is no experienceMax on
  // PlaybookDef.
  const EXPERIENCE_MAX = 5;
  const NOTES_DEBOUNCE_MS = 600;
  // 0.4.7: roll history is local-only (not synced, see CHANGELOG), capped
  // so it doesn't grow unbounded over a long session.
  const ROLL_HISTORY_MAX = 20;

  let { data }: PageProps = $props();

  let character = $state<Character | null>(null);
  let notFound = $state(false);
  let packs = $state<ContentPack[]>([]);
  let notesDraft = $state("");
  // Inline "choose your improvement" picker (docs/DESIGN.md: tracks are
  // already inline on this sheet, and this is a single list-pick, not a
  // multi-step flow, so it doesn't warrant the separate-route pattern the
  // character-creation wizard uses).
  let showImprovementPicker = $state(false);
  // Set only for an `addMove` improvement with `moveId: null` ("player picks
  // a move"), while the second-step move picker is open.
  let pendingImprovement = $state<ImprovementDef | null>(null);

  // The Dice banner (docs/DESIGN.md's signature interaction). Null when no
  // roll has been made yet or the banner has been dismissed.
  let currentRoll = $state<{
    moveName: string;
    ratingLabel: string;
    result: RollResult;
    outcomeText: string | null;
  } | null>(null);

  interface RollHistoryEntry {
    moveName: string;
    ratingLabel: string;
    result: RollResult;
    ts: number;
  }

  // Local-only roll history (0.4.7 scope boundary, see CHANGELOG): not a
  // synced SessionLog entity (that's 0.6.3), just an in-memory list for this
  // browser session, most-recent-first, capped at ROLL_HISTORY_MAX.
  let rollHistory = $state<RollHistoryEntry[]>([]);

  async function loadCharacter(): Promise<void> {
    const row = await db.entities.get(data.characterId);
    if (!row || row.deleted || row.type !== "character" || row.campaignId !== data.id) {
      character = null;
      notFound = true;
      return;
    }
    const parsed = CharacterSchema.safeParse(row.payload);
    if (!parsed.success) {
      character = null;
      notFound = true;
      return;
    }
    character = parsed.data;
    notesDraft = parsed.data.notes;
    notFound = false;
  }

  /**
   * Applies a field change locally-first: validates the full updated
   * Character (defense in depth, same as character-builder), updates the
   * `character` $state optimistically so the tap feels instant, then queues
   * the local Dexie write plus background push via writeEntity. The UI never
   * waits on the network (AGENTS.md rule 2).
   */
  async function applyUpdate(patch: Partial<Character>): Promise<void> {
    if (!character) return;
    const result = CharacterSchema.safeParse({ ...character, ...patch });
    if (!result.success) return;
    character = result.data;
    await writeEntity("character", data.id, result.data.id, result.data);
  }

  function tapLuck(boxNumber: number): void {
    if (!character) return;
    void applyUpdate({ luckSpent: nextTrackValue(character.luckSpent, luckMax, boxNumber) });
  }

  function tapHarm(boxNumber: number): void {
    if (!character) return;
    const harm = nextTrackValue(character.harm, harmTrack.max, boxNumber);
    const patch: Partial<Character> = { harm };
    // Never auto-clear unstable when harm drops (recovery is a table
    // decision); only set it when harm reaches the threshold.
    if (crossesUnstable(harm, harmTrack.unstableAt)) patch.unstable = true;
    void applyUpdate(patch);
  }

  function tapExperience(boxNumber: number): void {
    if (!character) return;
    void applyUpdate({ experience: nextTrackValue(character.experience, EXPERIENCE_MAX, boxNumber) });
  }

  function clearUnstable(): void {
    void applyUpdate({ unstable: false });
  }

  function formatSigned(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /**
   * Rolls a move (2d6 + rating, docs/DATA-MODEL.md engine constants), shows
   * the result in the Dice banner, prepends it to the local roll history,
   * and marks experience on a miss (one applyUpdate call, clamped to
   * EXPERIENCE_MAX per the "mark experience on a miss" rule).
   */
  function rollFor(move: MoveDef): void {
    if (!character || move.rating === null) return;
    const ratingValue = character.ratings[move.rating];
    const result = rollMove(ratingValue);
    const ratingLabel = `${capitalize(move.rating)} ${formatSigned(ratingValue)}`;
    currentRoll = {
      moveName: move.name,
      ratingLabel,
      result,
      outcomeText: move.outcomes ? move.outcomes[result.band] : null
    };
    rollHistory = [{ moveName: move.name, ratingLabel, result, ts: Date.now() }, ...rollHistory].slice(0, ROLL_HISTORY_MAX);
    if (result.band === "miss") {
      void applyUpdate({ experience: Math.min(EXPERIENCE_MAX, character.experience + 1) });
    }
  }

  function dismissRoll(): void {
    currentRoll = null;
  }

  function openImprovementPicker(): void {
    showImprovementPicker = true;
    pendingImprovement = null;
  }

  function closeImprovementPicker(): void {
    showImprovementPicker = false;
    pendingImprovement = null;
  }

  /**
   * Picking an `addMove` improvement with `moveId: null` doesn't apply
   * immediately; it opens a second small picker over pickableMoves() (see
   * level-up.ts) so the player can choose which move to gain. Every other
   * effect kind applies in one step.
   */
  function chooseImprovement(improvement: ImprovementDef): void {
    if (!character) return;
    if (improvement.effect.kind === "addMove" && improvement.effect.moveId === null) {
      pendingImprovement = improvement;
      return;
    }
    void applyUpdate(applyImprovement(character, improvement));
    closeImprovementPicker();
  }

  function chooseGrantedMove(moveId: string): void {
    if (!character || !pendingImprovement) return;
    void applyUpdate(applyImprovement(character, pendingImprovement, moveId));
    closeImprovementPicker();
  }

  let notesTimer: ReturnType<typeof setTimeout> | undefined;
  function onNotesInput(): void {
    if (notesTimer) clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      void applyUpdate({ notes: notesDraft });
    }, NOTES_DEBOUNCE_MS);
  }

  function trackLabel(name: string, boxNumber: number, current: number, max: number): string {
    return boxNumber === current
      ? `Clear ${name} back to ${current - 1}`
      : `Mark ${name} ${boxNumber} of ${max}`;
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    // Offline-first (AGENTS.md rule 2): never block rendering on the
    // network. Attempt a pull for fresh data, but always fall back to
    // whatever's already local if it fails or we're offline.
    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadCharacter();
      });

    getCampaign(data.id)
      .then(async (campaign) => {
        const loaded = await Promise.all(campaign.packIds.map((id) => getPack(id).catch(() => null)));
        packs = loaded.filter((p): p is PackDetail => p !== null).map((p) => p.pack);
      })
      .catch(() => {
        packs = [];
      });
  });

  const resolved = $derived(character ? resolveCharacterPlaybook(character, packs) : null);
  const moves = $derived(character ? resolveCharacterMoves(character, resolved, packs) : []);
  const luckMax = $derived(resolved?.playbook.luckMax ?? DEFAULT_LUCK_MAX);
  const harmTrack = $derived(resolved?.playbook.harmTrack ?? DEFAULT_HARM_TRACK);
  const eligibleBasic = $derived(character && resolved ? eligibleImprovements(resolved.playbook, character) : []);
  const advancedUnlocked = $derived(character && resolved ? allBasicImprovementsTaken(resolved.playbook, character) : false);
  const eligibleAdvanced = $derived(character && resolved ? eligibleAdvancedImprovements(resolved.playbook, character) : []);
  const moveOptions = $derived(character ? pickableMoves(character, packs) : []);
</script>

{#if currentRoll}
  <DiceBanner
    moveName={currentRoll.moveName}
    ratingLabel={currentRoll.ratingLabel}
    result={currentRoll.result}
    outcomeText={currentRoll.outcomeText}
    onDismiss={dismissRoll}
  />
{/if}

<main class="page">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if notFound}
    <p class="error">Character not found.</p>
  {:else if !character}
    <p class="meta">Loading...</p>
  {:else}
    <header class="sheet-header">
      <h1 class="title">{character.name}</h1>
      <p class="meta">{resolved ? resolved.playbook.name : `Unknown playbook (${character.playbookId})`}</p>
      {#if character.unstable}
        <div class="unstable-row">
          <span class="stamp">Unstable</span>
          <button type="button" class="text-button" onclick={clearUnstable}>Clear unstable</button>
        </div>
      {/if}
    </header>

    <section class="ratings">
      <div class="rating">
        <span class="rating-label">Charm</span>
        <span class="rating-value">{character.ratings.charm}</span>
      </div>
      <div class="rating">
        <span class="rating-label">Cool</span>
        <span class="rating-value">{character.ratings.cool}</span>
      </div>
      <div class="rating">
        <span class="rating-label">Sharp</span>
        <span class="rating-value">{character.ratings.sharp}</span>
      </div>
      <div class="rating">
        <span class="rating-label">Tough</span>
        <span class="rating-value">{character.ratings.tough}</span>
      </div>
      <div class="rating">
        <span class="rating-label">Weird</span>
        <span class="rating-value">{character.ratings.weird}</span>
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">Luck</h2>
      <p class="meta">{Math.max(luckMax - character.luckSpent, 0)} of {luckMax} remaining</p>
      <div class="track">
        {#each Array.from({ length: luckMax }) as _, index (index)}
          {@const boxNumber = index + 1}
          {@const spent = index < character.luckSpent}
          <button
            type="button"
            class="track-box"
            class:filled={spent}
            onclick={() => tapLuck(boxNumber)}
            aria-label={trackLabel("luck", boxNumber, character.luckSpent, luckMax)}
          ></button>
        {/each}
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">Harm</h2>
      <p class="meta">{character.harm} of {harmTrack.max}</p>
      <div class="track">
        {#each Array.from({ length: harmTrack.max }) as _, index (index)}
          {@const boxNumber = index + 1}
          {@const filled = boxNumber <= character.harm}
          {@const isThreshold = boxNumber === harmTrack.unstableAt}
          <button
            type="button"
            class="track-box"
            class:filled
            class:unstable-threshold={isThreshold}
            onclick={() => tapHarm(boxNumber)}
            aria-label={`${trackLabel("harm", boxNumber, character.harm, harmTrack.max)}${isThreshold ? ", unstable threshold" : ""}`}
          ></button>
        {/each}
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">Experience</h2>
      <p class="meta">{character.experience} of {EXPERIENCE_MAX}</p>
      <div class="track">
        {#each Array.from({ length: EXPERIENCE_MAX }) as _, index (index)}
          {@const boxNumber = index + 1}
          {@const filled = boxNumber <= character.experience}
          <button
            type="button"
            class="track-box"
            class:filled
            onclick={() => tapExperience(boxNumber)}
            aria-label={trackLabel("experience", boxNumber, character.experience, EXPERIENCE_MAX)}
          ></button>
        {/each}
      </div>
      {#if character.experience >= EXPERIENCE_MAX}
        <p class="level-up">Ready to level up</p>
        {#if resolved}
          <button type="button" class="text-button" onclick={openImprovementPicker}>Choose your improvement</button>
        {/if}
      {/if}
    </section>

    {#if showImprovementPicker && resolved}
      <section class="panel">
        <h2 class="section-title">Choose your improvement</h2>
        {#if pendingImprovement}
          <p class="meta">{pendingImprovement.text} &mdash; pick a move</p>
          {#if moveOptions.length === 0}
            <p class="meta">No eligible moves to grant.</p>
          {:else}
            <ul class="moves">
              {#each moveOptions as move (move.id)}
                <li class="move">
                  <button type="button" class="text-button" onclick={() => chooseGrantedMove(move.id)}>{move.name}</button>
                </li>
              {/each}
            </ul>
          {/if}
          <button type="button" class="text-button" onclick={() => (pendingImprovement = null)}>Back</button>
        {:else}
          {#if eligibleBasic.length === 0 && eligibleAdvanced.length === 0}
            <p class="meta">No more improvements available.</p>
          {:else}
            <ul class="moves">
              {#each eligibleBasic as improvement (improvement.id)}
                <li class="move">
                  <button type="button" class="text-button" onclick={() => chooseImprovement(improvement)}>{improvement.text}</button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if advancedUnlocked && eligibleAdvanced.length > 0}
            <h3 class="section-title">Advanced</h3>
            <ul class="moves">
              {#each eligibleAdvanced as improvement (improvement.id)}
                <li class="move">
                  <button type="button" class="text-button" onclick={() => chooseImprovement(improvement)}>{improvement.text}</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
        <button type="button" class="text-button" onclick={closeImprovementPicker}>Cancel</button>
      </section>
    {/if}

    <section class="panel">
      <h2 class="section-title">Moves</h2>
      {#if resolved}
        {#if moves.length === 0}
          <p class="meta">No moves.</p>
        {:else}
          <ul class="moves">
            {#each moves as move (move.id)}
              <li class="move">
                <span class="move-name">{move.name}</span>
                {#each move.tags as tag (tag)}
                  <EvidenceTag label={tag} />
                {/each}
                <p class="move-trigger">{move.trigger}</p>
                {#if move.outcomes}
                  <details>
                    <summary>Outcomes</summary>
                    <p class="outcome"><strong>10+:</strong> {move.outcomes.full}</p>
                    <p class="outcome"><strong>7-9:</strong> {move.outcomes.mixed}</p>
                    <p class="outcome"><strong>Miss:</strong> {move.outcomes.miss}</p>
                  </details>
                {/if}
                {#if move.rating !== null}
                  <button type="button" class="roll-button" onclick={() => rollFor(move)}>
                    Roll {capitalize(move.rating)} ({formatSigned(character.ratings[move.rating])})
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {:else if character.moves.length > 0}
        <p class="meta">Playbook not found in this campaign's attached packs; showing raw move ids.</p>
        <ul class="moves">
          {#each character.moves as moveId (moveId)}
            <li class="move"><span class="move-name">{moveId}</span></li>
          {/each}
        </ul>
      {:else}
        <p class="meta">No moves.</p>
      {/if}
    </section>

    {#if rollHistory.length > 0}
      <section class="panel">
        <h2 class="section-title">Roll History</h2>
        <p class="meta">This session only, not synced (last {ROLL_HISTORY_MAX})</p>
        <ul class="roll-history">
          {#each rollHistory as entry (entry.ts)}
            <li class="roll-entry band-{entry.result.band}">
              <span class="roll-move">{entry.moveName}</span>
              <span class="roll-detail">{entry.ratingLabel} &middot; {entry.result.die1}+{entry.result.die2} = {entry.result.total}</span>
              <span class="stamp roll-stamp">{entry.result.band === "full" ? "10+" : entry.result.band === "mixed" ? "7-9" : "Miss"}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="panel">
      <h2 class="section-title">Gear</h2>
      {#if character.gear.length === 0}
        <p class="meta">No gear.</p>
      {:else}
        <ul class="gear-list">
          {#each character.gear as item (item.id)}
            <li class="gear-item">
              <span class="move-name">{item.name}</span>
              {#if item.harm !== null}<span class="gear-stat">Harm {item.harm}</span>{/if}
              {#if item.armor !== null}<span class="gear-stat">Armor {item.armor}</span>{/if}
              {#each item.tags as tag (tag)}
                <EvidenceTag label={tag} />
              {/each}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Notes</h2>
      <textarea
        class="notes"
        rows="6"
        placeholder="No notes yet."
        aria-label="Character notes"
        bind:value={notesDraft}
        oninput={onNotesInput}
      ></textarea>
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

  .stamp {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    opacity: 0.8;
    transform: rotate(-2deg);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .ratings {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .rating {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-width: var(--space-12);
  }

  .rating-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .rating-value {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    color: var(--ink);
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

  .track {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .track-box {
    width: var(--tap-min);
    height: var(--tap-min);
    padding: 0;
    background: var(--surface-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .track-box:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .track-box.filled {
    background: var(--ink);
  }

  .track-box.unstable-threshold {
    border-color: var(--danger);
  }

  /* Track boxes fill with a 120ms ink-blot scale (docs/DESIGN.md Motion).
     Reduced-motion users get an instant change (no animation). */
  @media (prefers-reduced-motion: no-preference) {
    .track-box {
      transition: background 120ms ease, border-color 120ms ease;
    }

    .track-box.filled {
      animation: ink-blot 120ms ease-out;
    }
  }

  @keyframes ink-blot {
    from {
      transform: scale(0.6);
    }
    to {
      transform: scale(1);
    }
  }

  .unstable-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .text-button {
    padding: 0;
    background: none;
    border: none;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: underline;
    cursor: pointer;
  }

  .text-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .level-up {
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    color: var(--accent);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .moves {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .move {
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .move-name {
    font-family: var(--font-body);
    font-weight: 700;
    color: var(--ink);
  }

  .move-trigger {
    margin: var(--space-1) 0 0;
    color: var(--ink-muted);
  }

  .outcome {
    margin: var(--space-1) 0 0;
    color: var(--ink);
  }

  details {
    margin-top: var(--space-2);
    color: var(--ink);
    font-family: var(--font-body);
  }

  summary {
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .roll-button {
    min-height: var(--tap-min);
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    color: var(--accent);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .roll-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .roll-history {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .roll-entry {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .roll-move {
    font-family: var(--font-body);
    font-weight: 700;
    color: var(--ink);
  }

  .roll-detail {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }

  .roll-stamp {
    margin-left: auto;
    padding: 0 var(--space-2);
    border-color: var(--accent);
    color: var(--accent);
    font-size: var(--text-xs);
  }

  .roll-entry.band-full .roll-stamp {
    border-color: var(--ok);
    color: var(--ok);
  }

  .roll-entry.band-miss .roll-stamp {
    border-color: var(--danger);
    color: var(--danger);
  }

  .gear-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .gear-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .gear-stat {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .notes {
    width: 100%;
    margin: 0;
    padding: var(--space-3);
    color: var(--ink);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-base);
    white-space: pre-wrap;
    resize: vertical;
  }

  .notes:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
