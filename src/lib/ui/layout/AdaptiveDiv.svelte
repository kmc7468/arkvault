<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    children: Snippet;
    class?: ClassValue;
  }

  let { children, class: className }: Props = $props();
</script>

<div class={["mx-auto max-w-(--breakpoint-md)", className]}>
  {@render children()}
</div>
