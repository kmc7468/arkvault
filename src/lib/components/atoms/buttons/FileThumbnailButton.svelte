<script lang="ts">
  import { browser } from "$app/environment";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem2.svelte";
  import { requestFileThumbnailDownload } from "$lib/services/file";

  interface Props {
    info: SummarizedFileInfo;
    onclick?: (file: SummarizedFileInfo) => void;
  }

  let { info, onclick }: Props = $props();

  let showThumbnail = $derived(
    browser && (info.contentType.startsWith("image/") || info.contentType.startsWith("video/")),
  );
  let thumbnailPromise = $derived(
    showThumbnail ? requestFileThumbnailDownload(info.id, info.dataKey?.key) : null,
  );
</script>

<button
  onclick={onclick && (() => setTimeout(() => onclick(info), 100))}
  class="aspect-square overflow-hidden rounded transition active:scale-95 active:brightness-90"
>
  {#await thumbnailPromise}
    <div class="h-full w-full bg-gray-100"></div>
  {:then thumbnail}
    {#if thumbnail}
      <img src={thumbnail} alt={info.name} class="h-full w-full object-cover" />
    {:else}
      <div class="h-full w-full bg-gray-100"></div>
    {/if}
  {/await}
</button>
