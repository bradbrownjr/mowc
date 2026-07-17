<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ResolvedPathname } from "$app/types";

  /**
   * The empty-state pattern from docs/DESIGN.md "Empty states": a dashed
   * panel explaining what the thing is and when to create one, with at
   * most one CTA. When a hunter cannot create the entity themselves
   * (Keeper-only), omit ctaLabel/ctaHref and use children to say who will
   * fill it in instead ("Your Keeper reveals locations here...").
   *
   * ctaHref is typed as ResolvedPathname (not string) so callers must pass
   * an already-`resolve()`d path. The lint rule below still can't trace a
   * value through a prop boundary (this repo's eslint config has no
   * type-aware Svelte linting), hence the inline disable; the type keeps
   * the guarantee real at compile time.
   */
  interface Props {
    what: string;
    why: string;
    ctaLabel?: string;
    ctaHref?: ResolvedPathname;
    children?: Snippet;
  }

  let { what, why, ctaLabel, ctaHref, children }: Props = $props();
</script>

<div class="empty-state">
  <p class="empty-copy">{what}</p>
  <p class="empty-copy">{#if children}{@render children()}{:else}{why}{/if}</p>
  {#if ctaLabel && ctaHref}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- ctaHref is ResolvedPathname-typed; callers must pass a resolve()d path -->
    <a class="empty-cta" href={ctaHref}>{ctaLabel}</a>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
  }

  .empty-copy {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .empty-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .empty-cta:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
