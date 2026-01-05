<script lang="ts">
  import { createWindowVirtualizer } from "@tanstack/svelte-virtual";
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    class?: ClassValue;
    count: number;
    item: Snippet<[index: number]>;
    itemHeight: (index: number) => number;
    itemGap?: number;
    placeholder?: Snippet;
  }

  let { class: className, count, item, itemHeight, itemGap, placeholder }: Props = $props();

  let element: HTMLElement | undefined = $state();
  let scrollMargin = $state(0);

  let virtualizer = $derived(
    createWindowVirtualizer({
      count,
      estimateSize: itemHeight,
      gap: itemGap,
      scrollMargin,
    }),
  );

  const measureItem = (node: HTMLElement) => {
    $effect(() => $virtualizer.measureElement(node));
  };

  $effect(() => {
    if (!element) return;

    const observer = new ResizeObserver(() => {
      scrollMargin = Math.round(element!.getBoundingClientRect().top + window.scrollY);
    });
    observer.observe(element.parentElement!);
    return () => observer.disconnect();
  });
</script>

<div bind:this={element} class={["relative", className]}>
  <div style:height="{$virtualizer.getTotalSize()}px">
    {#each $virtualizer.getVirtualItems() as virtualItem (virtualItem.key)}
      <div
        class="absolute left-0 top-0 w-full"
        style:transform="translateY({virtualItem.start - scrollMargin}px)"
        data-index={virtualItem.index}
        use:measureItem
      >
        {@render item(virtualItem.index)}
      </div>
    {/each}
  </div>
  {#if placeholder && count === 0}
    {@render placeholder()}
  {/if}
</div>
