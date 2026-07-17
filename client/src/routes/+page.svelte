<script lang="ts">
  import { resolve } from "$app/paths";
  import { healthState } from "$lib/health.svelte";
  import { sessionState } from "$lib/session.svelte";
  import { GLOSS } from "$lib/glossary.js";
</script>

<main class="page">
  <h1 class="title">MOWC</h1>
  <p class="tagline">A field notebook for your Monster of the Week campaign.</p>

  {#if healthState.status === "offline"}
    <p class="offline-notice">Offline. Could not reach the server.</p>
  {/if}

  {#if sessionState.user}
    <div class="cta-row">
      <a class="cta cta-primary" href={resolve("/campaigns")}>My campaigns</a>
      <a class="cta" href={resolve("/packs")}>Content packs</a>
    </div>
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

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-2);
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
