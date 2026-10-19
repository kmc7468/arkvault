<script lang="ts">
  import { AdaptiveDiv } from "#lib/ui/index.ts";
  import BottomBar from "./BottomBar.svelte";

  let { children } = $props();
</script>

<div class="flex h-screen flex-col justify-between">
  <AdaptiveDiv class="w-full grow">
    {@render children()}
  </AdaptiveDiv>
  <BottomBar />
</div>
