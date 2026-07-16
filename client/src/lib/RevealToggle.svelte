<script lang="ts">
  /**
   * Keeper-only share control (ROADMAP 0.5.5, docs/SECURITY.md section 3):
   * flips a Keeper-owned entity's `revealed` field. The parent sheet is
   * responsible for gating this behind `isKeeper` (a hunter never sees it,
   * matching every other edit affordance on these sheets) and for wiring
   * `onToggle` to its own `applyUpdate({ revealed: !entity.revealed })`,
   * which persists through the same local-first `writeEntity` path as
   * every other field. Pull-side visibility filtering (server/src/entities/
   * router.ts) is what actually keeps this entity out of a hunter's local
   * IndexedDB until `revealed` is true; this component only flips the flag.
   */
  interface Props {
    revealed: boolean;
    onToggle: () => void;
  }

  let { revealed, onToggle }: Props = $props();
</script>

<button type="button" class="reveal-toggle" class:revealed onclick={onToggle}>
  {revealed ? "Revealed to hunters" : "Hidden from hunters"}
</button>

<style>
  .reveal-toggle {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-2);
    color: var(--ink-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .reveal-toggle.revealed {
    color: var(--accent);
    border-color: var(--accent);
  }

  .reveal-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
