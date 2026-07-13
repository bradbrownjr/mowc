<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import "@fontsource/big-shoulders";
  import "@fontsource/alegreya-sans";
  import "@fontsource/courier-prime";
  import "$lib/styles.css";
  import InstallButton from "$lib/InstallButton.svelte";
  import { initPwa } from "$lib/pwa.svelte";

  let { children } = $props();

  onMount(() => {
    if (browser) initPwa();
  });
</script>

{@render children()}
<InstallButton />
