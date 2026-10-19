<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";

  interface Props {
    children: Snippet;
    class?: ClassValue;
    icon?: Component<SvelteHTMLElements["svg"]>;
    textClass?: ClassValue;
  }

  let { children, class: className, icon: Icon, textClass: textClassName }: Props = $props();
</script>

<div class={className}>
  <div class="flex min-h-[10vh] items-center">
    {#if Icon}
      <Icon class="text-5xl text-gray-600" />
    {/if}
  </div>
  <p class={["text-3xl font-bold", textClassName]}>
    {@render children()}
  </p>
</div>
