<script lang="ts">
  import { getFileThumbnail } from "#lib/client/cache/index.ts";
  import type { SummarizedFileInfo } from "#lib/features/filesystem/index.ts";
  import { afterPress } from "#lib/ui/index.ts";

  import IconFavorite from "~icons/material-symbols/favorite";

  interface Props {
    info: SummarizedFileInfo;
    onclick?: (file: SummarizedFileInfo) => void;
  }

  let { info, onclick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));
</script>

<button
  onclick={afterPress(onclick && (() => onclick(info)))}
  class="relative aspect-square overflow-hidden rounded-sm transition active:scale-95 active:brightness-90"
>
  {#if thumbnail?.url}
    <img src={thumbnail?.url} alt={info.name} class="size-full object-cover" />
  {:else}
    <div class="size-full bg-gray-100"></div>
  {/if}
  {#if info.isFavorite}
    <div class={["absolute right-0.5 bottom-0.5"]}>
      <IconFavorite
        class="text-sm text-red-500"
        style="filter: drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)"
      />
    </div>
  {/if}
</button>
