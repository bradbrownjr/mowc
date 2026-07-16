<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { MinionSchema, type Minion } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { db } from "$lib/db.js";
  import { pull, writeEntity } from "$lib/sync.js";
  import { nextTrackValue } from "$lib/track-tap.js";
  import type { ContentPack } from "@mowc/shared";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let minion = $state<Minion | null>(null);
  let notFound = $state(false);
  let isKeeper = $state(false);
  let packs = $state<ContentPack[]>([]);

  async function loadMinion(): Promise<void> {
    const row = await db.entities.get(data.minionId);
    if (!row || row.deleted || row.type !== "minion" || row.campaignId !== data.id) {
      minion = null;
      notFound = true;
      return;
    }
    const parsed = MinionSchema.safeParse(row.payload);
    if (!parsed.success) {
      minion = null;
      notFound = true;
      return;
    }
    minion = parsed.data;
    notFound = false;
  }

  async function applyUpdate(patch: Partial<Minion>): Promise<void> {
    if (!minion) return;
    const result = MinionSchema.safeParse({ ...minion, ...patch });
    if (!result.success) return;
    minion = result.data;
    await writeEntity("minion", data.id, result.data.id, result.data);
  }

  function tapHarm(boxNumber: number): void {
    if (!minion) return;
    const harmTaken = nextTrackValue(minion.harmTaken, minion.harmCapacity, boxNumber);
    void applyUpdate({ harmTaken });
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

    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadMinion();
      });

    getCampaign(data.id)
      .then(async (result) => {
        isKeeper = result.keeperUserId === sessionState.user?.id;
        const loaded = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        packs = loaded.filter((p): p is PackDetail => p !== null).map((p) => p.pack);
      })
      .catch(() => {});
  });

  const minionType = $derived(
    minion?.typeId ? packs.flatMap((p) => p.minionTypes).find((t) => t.id === minion?.typeId) : null
  );
</script>

<main>
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if notFound}
    <p class="error">Minion not found.</p>
  {:else if !minion}
    <p class="meta">Loading...</p>
  {:else}
    <header class="sheet-header">
      <h1 class="title">{minion.name}</h1>
      {#if minionType}
        <p class="meta">{minionType.name}</p>
      {/if}
    </header>

    {#if minion.motivation}
      <section class="panel">
        <h2 class="section-title">Motivation</h2>
        <p class="detail-text">{minion.motivation}</p>
      </section>
    {/if}

    {#if minion.attacks.length > 0}
      <section class="panel">
        <h2 class="section-title">Attacks</h2>
        <ul class="attack-list">
          {#each minion.attacks as attack (attack.name)}
            <li class="attack-item">
              <span class="attack-name">{attack.name}</span>
              <span class="attack-harm">{attack.harm} harm</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="panel">
      <h2 class="section-title">Armor</h2>
      <p class="detail-text">{minion.armor}</p>
    </section>

    <section class="panel">
      <h2 class="section-title">Harm</h2>
      <div class="track-container">
        <div class="track-label">
          <span class="track-name">Harm</span>
          <span class="track-count">{minion.harmTaken} / {minion.harmCapacity}</span>
        </div>
        <div class="track">
          {#each Array.from({ length: minion.harmCapacity }, (_, i) => i + 1) as boxNumber (boxNumber)}
            <button
              type="button"
              class="track-box"
              class:filled={boxNumber <= minion.harmTaken}
              title={trackLabel(boxNumber, minion.harmTaken, minion.harmCapacity)}
              onclick={() => tapHarm(boxNumber)}
              disabled={!isKeeper}
            ></button>
          {/each}
        </div>
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    max-width: 32rem;
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

  .detail-text {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--ink);
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

  .track-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .track-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .track-name {
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .track-count {
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }

  .track {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .track-box {
    flex: 1;
    min-width: 2rem;
    aspect-ratio: 1;
    padding: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 120ms;
    min-height: var(--tap-min);
  }

  @media (prefers-reduced-motion) {
    .track-box {
      transition: none;
    }
  }

  .track-box.filled {
    background: var(--accent);
    border-color: var(--accent);
  }

  .track-box:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .track-box:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
