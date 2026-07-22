<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { CharacterSchema, type Character, type ContentPack, type MigrationRequest } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { getLatestMigrationRequest } from "$lib/api/migrationRequests.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import CharacterSheet from "$lib/CharacterSheet.svelte";
  import MigrateCharacter from "$lib/MigrateCharacter.svelte";
  import MigrationStatusBanner from "$lib/MigrationStatusBanner.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let character = $state<Character | null>(null);
  let notFound = $state(false);
  let packs = $state<ContentPack[]>([]);
  let migrationRequest = $state<MigrationRequest | null>(null);

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

    // Polled independently of loadCharacter's local row (ADR 0003 Decision 7):
    // once a request is approved, the source row is tombstoned server-side, so
    // a pull can mark it deleted here before this poll's result renders the
    // approved banner. The server itself is owner-only (404 for anyone else,
    // including once the row is gone, falling back to the request's own
    // requestedBy), so this is safe to call unconditionally; a non-owner or a
    // character with no request simply gets null back.
    getLatestMigrationRequest(data.characterId)
      .then((latest) => {
        migrationRequest = latest;
      })
      .catch(() => {
        migrationRequest = null;
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  <MigrationStatusBanner
    characterId={data.characterId}
    request={migrationRequest}
    onRequestChange={(updated) => {
      migrationRequest = updated;
    }}
  />

  {#if notFound && migrationRequest?.status !== "approved"}
    <p class="error">Character not found.</p>
  {:else if !character}
    <p class="meta">Loading...</p>
  {:else}
    {#key data.characterId}
      <CharacterSheet character={character} scope={data.id} packs={packs} />
      {#if character.ownerUserId === sessionState.user?.id}
        <MigrateCharacter
          characterId={character.id}
          sourceScope={data.id}
          playbookId={character.playbookId}
          onRequestCreated={(created) => {
            migrationRequest = created;
          }}
        />
      {/if}
    {/key}
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
</style>
