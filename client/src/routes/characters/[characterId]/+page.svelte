<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { CharacterSchema, type Character, type ContentPack, type MigrationRequest } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getLatestMigrationRequest } from "$lib/api/migrationRequests.js";
  import { getPack, listPacks, type PackDetail } from "$lib/api/contentPacks.js";
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

  async function loadCharacter(userId: string): Promise<void> {
    const row = await db.entities.get(data.characterId);
    if (!row || row.deleted || row.type !== "character") {
      character = null;
      notFound = true;
      return;
    }
    const parsed = CharacterSchema.safeParse(row.payload);
    if (!parsed.success || parsed.data.campaignId !== null || parsed.data.ownerUserId !== userId) {
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
    const userId = sessionState.user.id;

    // Offline-first (AGENTS.md rule 2): never block rendering on the
    // network. Attempt a pull for fresh data, but always fall back to
    // whatever's already local if it fails or we're offline.
    pull("standalone")
      .catch(() => {})
      .finally(() => {
        void loadCharacter(userId);
      });

    listPacks()
      .then(async (summaries) => {
        const loaded = await Promise.all(summaries.map((s) => getPack(s.id).catch(() => null)));
        packs = loaded.filter((p): p is PackDetail => p !== null).map((p) => p.pack);
      })
      .catch(() => {
        packs = [];
      });

    // Polled independently of loadCharacter's local row (ADR 0003 Decision 7):
    // once a request is approved, the source row is tombstoned server-side, so
    // a pull can mark it deleted here before this poll's result renders the
    // approved banner. The server is owner-only (404 otherwise), so this is
    // safe to call unconditionally.
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
  <a class="back-link" href={resolve("/characters")}>Back to my characters</a>

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
      <CharacterSheet character={character} scope="standalone" packs={packs} />
      <MigrateCharacter
        characterId={character.id}
        sourceScope="standalone"
        playbookId={character.playbookId}
        onRequestCreated={(created) => {
          migrationRequest = created;
        }}
      />
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
