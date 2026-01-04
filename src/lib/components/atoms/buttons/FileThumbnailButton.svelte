<script lang="ts">
  import { getFileThumbnail } from "$lib/modules/file";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";

  interface Props {
    info: SummarizedFileInfo;
    onclick?: (file: SummarizedFileInfo) => void;
  }

  let { info, onclick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));
</script>

<button
  onclick={onclick && (() => setTimeout(() => onclick(info), 100))}
  class="aspect-square overflow-hidden rounded transition active:scale-95 active:brightness-90"
>
  {#if $thumbnail}
    <img src={$thumbnail} alt={info.name} class="h-full w-full object-cover" />
  {:else}
    <div class="h-full w-full bg-gray-100"></div>
  {/if}
</button>
