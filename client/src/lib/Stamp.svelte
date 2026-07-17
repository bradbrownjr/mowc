<script lang="ts">
  /**
   * The "Stamps" motif from docs/DESIGN.md: a status marker (REVEALED,
   * UNSTABLE, SOLVED) rendered as a bordered uppercase stamp, rotated -2deg,
   * in the accent or danger color at 80% opacity. Distinct from EvidenceTag
   * (a clipped-corner chip for move/gear/power tags, not status).
   */
  interface Props {
    label: string;
    tone?: "accent" | "danger";
  }

  let { label, tone = "accent" }: Props = $props();
</script>

<span class="stamp tone-{tone}">{label}</span>

<style>
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

  .tone-danger {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
