<script lang="ts">
  import { getFileThumbnail } from "$lib/modules/file";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";

  import IconFavorite from "~icons/material-symbols/favorite";

  interface Props {
    info: SummarizedFileInfo;
    onclick?: (file: SummarizedFileInfo) => void;
  }

  let { info, onclick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));
</script>

<button
  onclick={onclick && (() => setTimeout(() => onclick(info), 100))}
  class="relative aspect-square overflow-hidden rounded transition active:scale-95 active:brightness-90"
>
  {#if $thumbnail}
    <img src={$thumbnail} alt={info.name} class="h-full w-full object-cover" />
  {:else}
    <div class="h-full w-full bg-gray-100"></div>
  {/if}
  {#if info.isFavorite}
    <div class={["absolute bottom-0 right-0", !thumbnail && "rounded-full bg-white p-0.5"]}>
      <IconFavorite
        class="text-sm text-red-500"
        style="filter: drop-shadow(0 0 1px white) drop-shadow(0 0 1px white);"
      />
    </div>
  {/if}
</button>
