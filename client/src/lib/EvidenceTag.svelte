<script lang="ts">
  /**
   * The "evidence tag" motif from docs/DESIGN.md: a rectangular chip with
   * one clipped corner and a Courier label, used for move/gear tags and
   * similar short metadata. First user: the character sheet
   * (campaigns/[id]/characters/[characterId]).
   */
  interface Props {
    label: string;
  }

  let { label }: Props = $props();
</script>

<span class="evidence-tag">{label}</span>

<style>
  .evidence-tag {
    display: inline-block;
    padding: 0 var(--space-2);
    clip-path: polygon(0 0, 100% 0, 100% 100%, var(--tag-clip) 100%, 0 calc(100% - var(--tag-clip)));
    background: var(--surface);
    border: 1px solid var(--border);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
</style>
