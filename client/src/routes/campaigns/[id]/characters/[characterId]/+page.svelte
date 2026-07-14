<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { CharacterSchema, type Character, type ContentPack } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import {
    DEFAULT_HARM_TRACK,
    DEFAULT_LUCK_MAX,
    resolveCharacterMoves,
    resolveCharacterPlaybook
  } from "$lib/character-sheet.js";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let character = $state<Character | null>(null);
  let notFound = $state(false);
  let packs = $state<ContentPack[]>([]);

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
    notFound = false;
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
  const moves = $derived(character ? resolveCharacterMoves(character, resolved) : []);
  const luckMax = $derived(resolved?.playbook.luckMax ?? DEFAULT_LUCK_MAX);
  const harmTrack = $derived(resolved?.playbook.harmTrack ?? DEFAULT_HARM_TRACK);
</script>

<main>
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
        <span class="stamp">Unstable</span>
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
          {@const spent = index < character.luckSpent}
          <div class="track-box" class:filled={spent} role="img" aria-label={spent ? "Luck spent" : "Luck available"}></div>
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
          <div
            class="track-box"
            class:filled
            class:unstable-threshold={isThreshold}
            role="img"
            aria-label={`${filled ? "Harm taken" : "Open"}${isThreshold ? ", unstable threshold" : ""}`}
          ></div>
        {/each}
      </div>
    </section>

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
      <p class="notes">{character.notes || "No notes yet."}</p>
    </section>
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
    background: var(--surface-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .track-box.filled {
    background: var(--ink);
  }

  .track-box.unstable-threshold {
    border-color: var(--danger);
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
    margin: 0;
    color: var(--ink);
    font-family: var(--font-body);
    white-space: pre-wrap;
  }
</style>
