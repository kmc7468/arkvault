<script lang="ts">
  import { AdaptiveDiv } from "$lib/components/divs";

  let { children } = $props();
</script>

<AdaptiveDiv>
  <div class="flex h-screen w-full flex-col justify-between px-2">
    {@render children()}
  </div>
</AdaptiveDiv>
