<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";

  interface Props {
    actionButtonClass?: ClassValue;
    actionButtonIcon?: Component<SvelteHTMLElements["svg"]>;
    children: Snippet;
    class?: ClassValue;
    onActionButtonClick?: () => void;
    onclick?: () => void;
  }

  let {
    actionButtonIcon: ActionButtonIcon,
    actionButtonClass: actionButtonClassName,
    children,
    class: className,
    onActionButtonClick,
    onclick,
  }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="container"
  onclick={onclick && (() => setTimeout(onclick, 100))}
  class={["rounded-xl", className]}
>
  <div id="children" class="flex h-full items-center gap-x-4 p-2 transition">
    <div class="flex-grow overflow-x-hidden">
      {@render children()}
    </div>
    {#if ActionButtonIcon}
      <button
        id="action-button"
        onclick={(e) => {
          e.stopPropagation();
          if (onActionButtonClick) {
            setTimeout(onActionButtonClick, 100);
          }
        }}
        class={["flex-shrink-0 rounded-full p-1 text-lg active:bg-gray-100", actionButtonClassName]}
      >
        <ActionButtonIcon />
      </button>
    {/if}
  </div>
</div>

<style lang="postcss">
  #container:active:not(:has(#action-button:active)) {
    @apply bg-gray-100;
  }
  #children:active:not(:has(#action-button:active)) {
    @apply scale-95;
  }
</style>
