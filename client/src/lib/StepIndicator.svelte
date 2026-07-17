<script lang="ts">
  import { Lock } from "@lucide/svelte";
  import Icon from "$lib/Icon.svelte";

  /**
   * Numbered wizard progress rail (docs/DESIGN.md "Builders" line). Purely
   * presentational: the parent route owns step state and navigation. A step
   * is done (index < current), current, or locked (index > current, not
   * yet reachable since wizards are linear and don't allow skipping ahead).
   */
  interface Props {
    steps: string[];
    current: number;
  }

  let { steps, current }: Props = $props();
</script>

<ol class="rail">
  {#each steps as step, index (step)}
    <li
      class="step"
      class:current={index === current}
      class:done={index < current}
      class:locked={index > current}
    >
      <span class="step-number">{index + 1}</span>
      <span class="step-label">{step}</span>
      {#if index > current}
        <Icon icon={Lock} size={12} />
      {/if}
    </li>
  {/each}
</ol>

<style>
  .rail {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    opacity: 0.6;
  }

  .step.current,
  .step.done {
    opacity: 1;
  }

  .step.current {
    border-color: var(--accent);
  }

  .step.done {
    background: var(--surface-2);
  }

  .step.locked {
    color: var(--ink-muted);
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .step.current .step-number {
    border-color: var(--accent);
    color: var(--accent);
  }

  .step-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .step.current .step-label {
    color: var(--ink);
  }
</style>
