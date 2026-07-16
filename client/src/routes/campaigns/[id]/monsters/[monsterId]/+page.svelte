<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { MonsterSchema, type ArchetypeDef, type ContentPack, type Monster } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { db } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import { flattenMonsterTypes } from "$lib/monster-builder.js";
  import { nextTrackValue } from "$lib/track-tap.js";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import RevealToggle from "$lib/RevealToggle.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let monster = $state<Monster | null>(null);
  let notFound = $state(false);
  let isKeeper = $state(false);
  let packs = $state<ContentPack[]>([]);

  async function loadMonster(): Promise<void> {
    const row = await db.entities.get(data.monsterId);
    if (!row || row.deleted || row.type !== "monster" || row.campaignId !== data.id) {
      monster = null;
      notFound = true;
      return;
    }
    const parsed = MonsterSchema.safeParse(row.payload);
    if (!parsed.success) {
      monster = null;
      notFound = true;
      return;
    }
    monster = parsed.data;
    notFound = false;
  }

  /**
   * Applies a field change locally-first (same pattern as the character
   * sheet's applyUpdate): validates the full updated Monster, updates the
   * `monster` $state optimistically, then queues the write via writeEntity.
   * Only reachable from Keeper-gated controls below.
   */
  async function applyUpdate(patch: Partial<Monster>): Promise<void> {
    if (!monster) return;
    const result = MonsterSchema.safeParse({ ...monster, ...patch });
    if (!result.success) return;
    monster = result.data;
    await writeEntity("monster", data.id, result.data.id, result.data);
  }

  function tapHarm(boxNumber: number): void {
    if (!monster || !isKeeper) return;
    void applyUpdate({ harmTaken: nextTrackValue(monster.harmTaken, monster.harmCapacity, boxNumber) });
  }

  function trackLabel(boxNumber: number, current: number, max: number): string {
    return boxNumber === current ? `Clear harm back to ${current - 1}` : `Mark harm ${boxNumber} of ${max}`;
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
        void loadMonster();
      });

    getCampaign(data.id)
      .then(async (campaign) => {
        isKeeper = campaign.keeperUserId === sessionState.user?.id;
        const loaded = await Promise.all(campaign.packIds.map((id) => getPack(id).catch(() => null)));
        packs = loaded.filter((p): p is PackDetail => p !== null).map((p) => p.pack);
      })
      .catch(() => {
        packs = [];
      });
  });

  const resolvedType = $derived<ArchetypeDef | null>(
    monster?.typeId ? (flattenMonsterTypes(packs).find((t) => t.id === monster?.typeId) ?? null) : null
  );
</script>

<main>
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if notFound}
    <p class="error">Monster not found.</p>
  {:else if !monster}
    <p class="meta">Loading...</p>
  {:else}
    <header class="sheet-header">
      <h1 class="title">{monster.name}</h1>
      <p class="meta">{resolvedType ? resolvedType.name : monster.typeId ? `Unknown type (${monster.typeId})` : "No type"}</p>
      {#if isKeeper}
        <RevealToggle revealed={monster.revealed} onToggle={() => applyUpdate({ revealed: !monster?.revealed })} />
      {/if}
    </header>

    {#if monster.motivation}
      <section class="panel">
        <h2 class="section-title">Motivation</h2>
        <p>{monster.motivation}</p>
      </section>
    {/if}

    <section class="panel">
      <h2 class="section-title">Powers</h2>
      {#if monster.powers.length === 0}
        <p class="meta">No powers.</p>
      {:else}
        <ul class="text-list">
          {#each monster.powers as power (power)}
            <li>{power}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Weaknesses</h2>
      {#if monster.weaknesses.length === 0}
        <p class="meta">No weaknesses.</p>
      {:else}
        <ul class="text-list">
          {#each monster.weaknesses as weakness (weakness)}
            <li>{weakness}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Attacks</h2>
      {#if monster.attacks.length === 0}
        <p class="meta">No attacks.</p>
      {:else}
        <ul class="attack-list">
          {#each monster.attacks as attack (attack.name)}
            <li class="attack-item">
              <span class="move-name">{attack.name}</span>
              <span class="gear-stat">Harm {attack.harm}</span>
              {#each attack.tags as tag (tag)}
                <EvidenceTag label={tag} />
              {/each}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Armor</h2>
      <p>{monster.armor}</p>
    </section>

    <section class="panel">
      <h2 class="section-title">Harm</h2>
      <p class="meta">{monster.harmTaken} of {monster.harmCapacity}</p>
      <div class="track">
        {#each Array.from({ length: monster.harmCapacity }) as _, index (index)}
          {@const boxNumber = index + 1}
          {@const filled = boxNumber <= monster.harmTaken}
          <button
            type="button"
            class="track-box"
            class:filled
            class:readonly={!isKeeper}
            disabled={!isKeeper}
            onclick={() => tapHarm(boxNumber)}
            aria-label={trackLabel(boxNumber, monster.harmTaken, monster.harmCapacity)}
          ></button>
        {/each}
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">Custom moves</h2>
      {#if monster.customMoves.length === 0}
        <p class="meta">No custom moves.</p>
      {:else}
        <ul class="text-list">
          {#each monster.customMoves as move (move)}
            <li>{move}</li>
          {/each}
        </ul>
      {/if}
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

  .attack-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .attack-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
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

  .gear-stat {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
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

  .track-box.readonly {
    cursor: default;
  }

  .track-box:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .track-box.filled {
    background: var(--ink);
  }

  /* Track boxes fill with a 120ms ink-blot scale (docs/DESIGN.md Motion,
     matching the character sheet's harm track). Reduced-motion users get an
     instant change (no animation). */
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
</style>
