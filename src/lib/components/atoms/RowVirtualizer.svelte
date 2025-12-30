<script lang="ts">
  import { createWindowVirtualizer } from "@tanstack/svelte-virtual";
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    class?: ClassValue;
    count: number;
    item: Snippet<[index: number]>;
    itemHeight: (index: number) => number;
    placeholder?: Snippet;
  }

  let { class: className, count, item, itemHeight, placeholder }: Props = $props();

  const virtualizer = $derived(
    createWindowVirtualizer({
      count,
      estimateSize: itemHeight,
    }),
  );

  const measureItem = (node: HTMLElement) => {
    $effect(() => $virtualizer.measureElement(node));
  };
</script>

<div class={["relative", className]}>
  <div style:height="{$virtualizer.getTotalSize()}px">
    {#each $virtualizer.getVirtualItems() as virtualItem (virtualItem.key)}
      <div
        class="absolute left-0 top-0 w-full"
        style:transform="translateY({virtualItem.start}px)"
        data-index={virtualItem.index}
        use:measureItem
      >
        {@render item(virtualItem.index)}
      </div>
    {/each}
  </div>
  {#if placeholder && $virtualizer.getVirtualItems().length === 0}
    {@render placeholder()}
  {/if}
</div>
