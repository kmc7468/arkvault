<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    children: Snippet;
    class?: ClassValue;
  }

  let { children, class: className }: Props = $props();
</script>

<div class={["flex flex-grow flex-col justify-between px-4", className]}>
  {@render children()}
</div>
