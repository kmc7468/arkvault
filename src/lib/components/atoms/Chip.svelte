<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    children: Snippet;
    class?: ClassValue;
    onclick?: () => void;
    onRemoveClick?: () => void;
    selected?: boolean;
    removable?: boolean;
  }

  let {
    children,
    class: className,
    onclick = () => (selected = !selected),
    onRemoveClick,
    removable = false,
    selected = $bindable(false),
  }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  onclick={onclick && (() => setTimeout(onclick, 100))}
  class={[
    "inline-flex cursor-pointer items-center gap-x-1 rounded-lg px-3 py-1.5 text-sm font-medium transition active:scale-95",
    selected
      ? "bg-primary-500 text-white active:bg-primary-400"
      : "bg-gray-100 text-gray-700 active:bg-gray-200",
    className,
  ]}
>
  <span>
    {@render children()}
  </span>
  {#if selected && removable}
    <button
      onclick={(e) => {
        e.stopPropagation();
        if (onRemoveClick) {
          setTimeout(onRemoveClick, 100);
        }
      }}
    >
      <IconClose />
    </button>
  {/if}
</div>
