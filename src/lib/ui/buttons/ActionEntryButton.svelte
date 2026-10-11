<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";
  import { afterPress } from "../press.ts";

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
<div data-entry-container onclick={afterPress(onclick)} class={["rounded-xl", className]}>
  <div data-entry-content class="flex h-full items-center gap-x-4 p-2 transition">
    <div class="grow overflow-x-hidden">
      {@render children()}
    </div>
    {#if ActionButtonIcon}
      <button
        data-action-button
        onclick={(e) => {
          e.stopPropagation();
          afterPress(onActionButtonClick)?.();
        }}
        class={["shrink-0 rounded-full p-1 text-lg active:bg-gray-100", actionButtonClassName]}
      >
        <ActionButtonIcon />
      </button>
    {/if}
  </div>
</div>

<style lang="postcss">
  @reference "../../../app.css";

  [data-entry-container]:active:not(:has([data-action-button]:active)) {
    @apply bg-gray-100;
  }
  [data-entry-content]:active:not(:has([data-action-button]:active)) {
    @apply scale-95;
  }
</style>
