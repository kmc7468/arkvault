<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    onclick?: () => void;
  }

  let { children, onclick }: Props = $props();
</script>

<button
  onclick={onclick && (() => setTimeout(onclick, 100))}
  class="text-sm font-medium text-gray-800 underline underline-offset-2 active:rounded-xl active:bg-gray-100"
>
  <div class="h-full p-1 transition active:scale-95">
    {@render children()}
  </div>
</button>
