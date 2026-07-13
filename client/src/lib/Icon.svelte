<script lang="ts">
  import type { Icon as IconType } from "@lucide/svelte";

  interface Props {
    icon: typeof IconType;
    size?: number;
  }

  let { icon: IconComponent, size = 20 }: Props = $props();
</script>

<IconComponent {size} strokeWidth={2} aria-hidden="true" />
