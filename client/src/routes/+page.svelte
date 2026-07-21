<script lang="ts">
  import { resolve } from "$app/paths";
  import type { Campaign } from "@mowc/shared";
  import { healthState } from "$lib/health.svelte";
  import { sessionState } from "$lib/session.svelte";
  import { GLOSS } from "$lib/glossary.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import { listCampaigns } from "$lib/api/campaigns.js";
  import { groupOwnCharacters, type CharacterGroup } from "$lib/my-characters.js";
  import { splitCampaignsByRole } from "$lib/home.js";
  import EmptyState from "$lib/EmptyState.svelte";
  import FieldNote from "$lib/FieldNote.svelte";

  let loading = $state(true);
  let characterGroups = $state<CharacterGroup[]>([]);
  let running = $state<Campaign[]>([]);
  let joined = $state<Campaign[]>([]);

  /**
   * Freshens the user's campaigns and characters, same "pull everything
   * seated, then read local IndexedDB" pattern as the /characters roster,
   * so the dashboard reflects edits made on another device.
   */
  async function loadDashboard(userId: string): Promise<void> {
    let campaigns: Campaign[] = [];
    try {
      campaigns = await listCampaigns();
      await Promise.all([...campaigns.map((c) => pull(c.id).catch(() => {})), pull("standalone").catch(() => {})]);
    } catch {
      // Offline or API error: render from whatever local data is available.
    }
    const split = splitCampaignsByRole(campaigns, userId);
    running = split.running;
    joined = split.joined;
    const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));
    const entities = await db.entities.toArray();
    characterGroups = groupOwnCharacters(entities, userId, campaignNames);
    loading = false;
  }

  $effect(() => {
    if (sessionState.status !== "ready" || !sessionState.user) return;
    void loadDashboard(sessionState.user.id);
  });
</script>

<main class="page">
  <h1 class="title">MOWC</h1>
  <p class="tagline">A field notebook for your Monster of the Week campaign.</p>

  {#if healthState.status === "offline"}
    <p class="offline-notice">Offline. Could not reach the server.</p>
  {/if}

  {#if sessionState.user}
    <section class="dash-section">
      <div class="dash-header">
        <h2 class="section-title">Characters</h2>
        <a class="section-link" href={resolve("/characters")}>View all</a>
      </div>
      {#if loading}
        <p class="meta">Loading...</p>
      {:else if characterGroups.length === 0}
        <EmptyState
          what="A character (a hunter's playbook sheet) is who you play as when you take on the monsters."
          why="Create a standalone character, or join or start a campaign and create your hunter there."
          ctaLabel="New character"
          ctaHref={resolve("/characters/new")}
        />
      {:else}
        <ul class="entity-list">
          {#each characterGroups as group (group.key)}
            {#each group.characters as character (character.id)}
              <li class="entity-row">
                <a
                  class="entity-link"
                  href={group.campaignId
                    ? resolve("/campaigns/[id]/characters/[characterId]", {
                        id: group.campaignId,
                        characterId: character.id
                      })
                    : resolve("/characters/[characterId]", { characterId: character.id })}
                >
                  <span class="entity-name">{character.name}</span>
                  <span class="entity-meta">{group.label}</span>
                </a>
              </li>
            {/each}
          {/each}
        </ul>
      {/if}
    </section>

    <section class="dash-section">
      <h2 class="section-title">Campaigns I'm Running</h2>
      <FieldNote>Campaigns where you are the {GLOSS.keeper}.</FieldNote>
      {#if loading}
        <p class="meta">Loading...</p>
      {:else if running.length === 0}
        <EmptyState
          what="This is where your own campaigns live, once you start one."
          why="Create a campaign to begin building your mystery, monsters, and world."
          ctaLabel="Create a campaign"
          ctaHref={resolve("/campaigns")}
        />
      {:else}
        <ul class="campaign-list">
          {#each running as campaign (campaign.id)}
            <li class="campaign-row">
              <a class="campaign-link" href={resolve("/campaigns/[id]", { id: campaign.id })}>{campaign.name}</a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="dash-section">
      <h2 class="section-title">Campaigns I'm In</h2>
      <FieldNote>Campaigns where you are a {GLOSS.hunter}.</FieldNote>
      {#if loading}
        <p class="meta">Loading...</p>
      {:else if joined.length === 0}
        <EmptyState
          what="Campaigns you've joined appear here."
          why="Ask your Keeper for an invite code and redeem it to join their game."
          ctaLabel="Join a campaign"
          ctaHref={resolve("/campaigns")}
        />
      {:else}
        <ul class="campaign-list">
          {#each joined as campaign (campaign.id)}
            <li class="campaign-row">
              <a class="campaign-link" href={resolve("/campaigns/[id]", { id: campaign.id })}>{campaign.name}</a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else if sessionState.status === "ready"}
    <div class="role-grid">
      <section class="role-card">
        <h2 class="role-title">I'm running the game</h2>
        <p class="role-copy">
          As the {GLOSS.keeper}, you build the mystery, the monsters, and the world, then reveal pieces of it to your
          hunters as they investigate. Content packs (playbooks and monster types someone else has written) give you
          the pieces to build with.
        </p>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is resolve("/register") with a static query string appended, same pattern as EmptyState.svelte's ctaHref -->
        <a class="cta cta-primary" href={`${resolve("/register")}?intent=create`}>Create a campaign</a>
      </section>
      <section class="role-card">
        <h2 class="role-title">I'm joining a game</h2>
        <p class="role-copy">
          As a {GLOSS.hunter}, you play through the case your Keeper has built. Grab the invite code your Keeper sent
          you, then build your character from whatever content pack they've attached.
        </p>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is resolve("/register") with a static query string appended, same pattern as EmptyState.svelte's ctaHref -->
        <a class="cta cta-primary" href={`${resolve("/register")}?intent=join`}>Join with an invite code</a>
      </section>
    </div>
    <p class="nav-link-row">Already have an account? <a class="nav-link" href={resolve("/login")}>Log in</a></p>
  {/if}
</main>

<style>
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .tagline {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .offline-notice {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .dash-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .dash-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .section-link {
    color: var(--accent);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
    text-decoration: none;
  }

  .section-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .meta {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .entity-list,
  .campaign-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .entity-row,
  .campaign-row {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .entity-link,
  .campaign-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--tap-min);
    padding: var(--space-3);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
    text-decoration: none;
  }

  .entity-link:focus-visible,
  .campaign-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .entity-meta {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .cta {
    min-height: var(--tap-min);
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .cta-primary {
    border-color: var(--accent);
    color: var(--accent);
  }

  .cta:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .role-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }

  @media (min-width: 768px) {
    .role-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .role-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .role-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .role-copy {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .nav-link-row {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
  }

  .nav-link {
    color: var(--accent);
    text-decoration: none;
  }

  .nav-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
