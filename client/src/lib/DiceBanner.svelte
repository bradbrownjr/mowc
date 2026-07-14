<script lang="ts">
  /**
   * The "Dice banner" motif from docs/DESIGN.md: THE signature interaction,
   * a roll result that slides in as a torn-slip banner (big display-font
   * total, outcome band as a stamp, then the matching outcome text). Gets
   * the full motion budget (docs/DESIGN.md Motion: 400ms slide + stamp
   * thunk, opacity-only under prefers-reduced-motion). First user: the
   * character sheet's move rollers
   * (campaigns/[id]/characters/[characterId]).
   */
  import type { RollBand, RollResult } from "./dice.js";

  interface Props {
    moveName: string;
    ratingLabel: string;
    result: RollResult;
    outcomeText: string | null;
    onDismiss: () => void;
  }

  let { moveName, ratingLabel, result, outcomeText, onDismiss }: Props = $props();

  const bandLabel: Record<RollBand, string> = {
    full: "10+",
    mixed: "7-9",
    miss: "Miss"
  };
</script>

<div class="backdrop" role="presentation" onclick={onDismiss}></div>
<div class="banner band-{result.band}" role="alert">
  <button type="button" class="close" onclick={onDismiss} aria-label="Dismiss roll result">&times;</button>
  <p class="move-name">{moveName}</p>
  <p class="dice-line">{ratingLabel} &middot; {result.die1} + {result.die2}</p>
  <p class="total">{result.total}</p>
  <span class="stamp">{bandLabel[result.band]}</span>
  {#if outcomeText}
    <p class="outcome-text">{outcomeText}</p>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: transparent;
  }

  .banner {
    position: fixed;
    top: var(--space-4);
    left: var(--space-4);
    right: var(--space-4);
    z-index: 11;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    max-width: 28rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .banner.band-full {
    border-color: var(--ok);
  }

  .banner.band-miss {
    border-color: var(--danger);
  }

  .close {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    width: var(--tap-min);
    height: var(--tap-min);
    background: none;
    border: none;
    color: var(--ink-muted);
    font-family: var(--font-display);
    font-size: var(--text-xl);
    line-height: 1;
    cursor: pointer;
  }

  .close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .move-name {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .dice-line {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }

  .total {
    margin: 0;
    font-family: var(--font-display);
    font-size: calc(var(--text-2xl) * 2.5);
    line-height: 1;
    color: var(--ink);
  }

  .stamp {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    color: var(--accent);
    opacity: 0.8;
    transform: rotate(-2deg);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .band-full .stamp {
    border-color: var(--ok);
    color: var(--ok);
  }

  .band-miss .stamp {
    border-color: var(--danger);
    color: var(--danger);
  }

  .outcome-text {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  /* Dice banner: 400ms slide + stamp thunk (docs/DESIGN.md Motion).
     Reduced-motion users get an instant opacity-only fallback, same
     pattern as the track-box ink-blot in the character sheet. */
  @media (prefers-reduced-motion: no-preference) {
    .banner {
      animation: slide-in 400ms ease-out;
    }

    .stamp {
      animation: stamp-thunk 400ms ease-out;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .banner {
      animation: fade-in 400ms ease-out;
    }

    .stamp {
      animation: fade-in 400ms ease-out;
    }
  }

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateY(-100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes stamp-thunk {
    0% {
      opacity: 0;
      transform: scale(1.1) rotate(-2deg);
    }
    100% {
      opacity: 0.8;
      transform: scale(1) rotate(-2deg);
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
