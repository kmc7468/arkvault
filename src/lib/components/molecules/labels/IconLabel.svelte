<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";

  interface Props {
    children: Snippet;
    class?: ClassValue;
    icon?: Component<SvelteHTMLElements["svg"]>;
    iconClass?: ClassValue;
    iconSnippet?: Snippet;
    subtext?: Snippet;
    textClass?: ClassValue;
  }

  let {
    children,
    class: className,
    icon: Icon,
    iconClass: iconClassName,
    iconSnippet,
    subtext,
    textClass: textClassName,
  }: Props = $props();
</script>

<div class={["flex items-center gap-x-4", className]}>
  {#if iconSnippet}
    <div class={["flex-shrink-0", iconClassName]}>
      {@render iconSnippet()}
    </div>
  {:else if Icon}
    <div class={["flex-shrink-0 text-lg", iconClassName]}>
      <Icon />
    </div>
  {/if}
  <div class="flex flex-grow flex-col overflow-x-hidden text-left">
    <p class={["truncate font-medium", textClassName]}>
      {@render children()}
    </p>
    {#if subtext}
      <p class="truncate text-xs text-gray-800">
        {@render subtext()}
      </p>
    {/if}
  </div>
</div>
