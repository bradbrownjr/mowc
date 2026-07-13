<script lang="ts">
  import type { GearChoice } from "@mowc/shared";
  import Icon from "$lib/Icon.svelte";
  import { Plus, Trash2 } from "@lucide/svelte";
  import { generateUuid } from "$lib/uuid.js";

  interface Props {
    gearChoices: GearChoice[];
  }

  let { gearChoices = $bindable() }: Props = $props();

  function addChoice(): void {
    gearChoices.push({ id: generateUuid(), label: "", pick: 1, options: [] });
  }

  function removeChoice(index: number): void {
    gearChoices.splice(index, 1);
  }

  function addOption(choice: GearChoice): void {
    choice.options.push({ id: generateUuid(), name: "", harm: null, armor: null, tags: [] });
  }

  function removeOption(choice: GearChoice, index: number): void {
    choice.options.splice(index, 1);
  }

  function toNullableInt(value: string): number | null {
    if (value.trim() === "") return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function tagsToText(tags: string[]): string {
    return tags.join(", ");
  }

  function onTagsChange(target: { tags: string[] }, value: string): void {
    target.tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
</script>

<div class="choices">
  {#each gearChoices as choice, choiceIndex (choice.id)}
    <div class="choice">
      <div class="row">
        <label class="field grow">
          <span class="field-label">Choice label</span>
          <input type="text" bind:value={choice.label} />
        </label>
        <label class="field pick">
          <span class="field-label">Pick</span>
          <input type="number" min="1" bind:value={choice.pick} />
        </label>
        <button
          type="button"
          class="icon-button"
          onclick={() => removeChoice(choiceIndex)}
          aria-label="Remove gear choice"
        >
          <Icon icon={Trash2} size={18} />
        </button>
      </div>

      <div class="options">
        {#each choice.options as option, optionIndex (option.id)}
          <div class="option">
            <label class="field grow">
              <span class="field-label">Gear name</span>
              <input type="text" bind:value={option.name} />
            </label>
            <label class="field small">
              <span class="field-label">Harm</span>
              <input
                type="number"
                value={option.harm ?? ""}
                onchange={(e) => (option.harm = toNullableInt(e.currentTarget.value))}
              />
            </label>
            <label class="field small">
              <span class="field-label">Armor</span>
              <input
                type="number"
                value={option.armor ?? ""}
                onchange={(e) => (option.armor = toNullableInt(e.currentTarget.value))}
              />
            </label>
            <label class="field grow">
              <span class="field-label">Tags</span>
              <input
                type="text"
                value={tagsToText(option.tags)}
                onchange={(e) => onTagsChange(option, e.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="icon-button"
              onclick={() => removeOption(choice, optionIndex)}
              aria-label="Remove gear option"
            >
              <Icon icon={Trash2} size={18} />
            </button>
          </div>
        {/each}
        <button type="button" class="add-button" onclick={() => addOption(choice)}>
          <Icon icon={Plus} size={16} />
          Add gear option
        </button>
      </div>
    </div>
  {/each}
  <button type="button" class="add-button" onclick={addChoice}>
    <Icon icon={Plus} size={18} />
    Add gear choice
  </button>
</div>

<style>
  .choices {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-left: var(--space-4);
    border-left: 2px solid var(--border);
  }

  .option,
  .row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .grow {
    flex: 1;
    min-width: 8rem;
  }

  .small {
    width: 5rem;
  }

  .pick {
    width: 5rem;
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input {
    min-height: var(--tap-min);
    padding: var(--space-2);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .icon-button,
  .add-button {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .add-button {
    align-self: flex-start;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .icon-button:focus-visible,
  .add-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
