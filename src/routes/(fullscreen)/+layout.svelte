<script lang="ts">
  import { AdaptiveDiv } from "#lib/ui/index.js";

  let { children } = $props();
</script>

<AdaptiveDiv class="flex min-h-screen flex-col">
  {@render children()}
</AdaptiveDiv>
