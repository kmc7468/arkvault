<script lang="ts">
  import type { Writable } from "svelte/store";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { requestFileThumbnailDownload } from "$lib/services/file";

  interface Props {
    info: Writable<FileInfo | null>;
    onclick?: (file: FileInfo) => void;
  }

  let { info, onclick }: Props = $props();

  let thumbnail: string | undefined = $state();

  $effect(() => {
    if ($info) {
      requestFileThumbnailDownload($info.id, $info.dataKey)
        .then((thumbnailUrl) => {
          thumbnail = thumbnailUrl ?? undefined;
        })
        .catch(() => {
          // TODO: Error Handling
          thumbnail = undefined;
        });
    } else {
      thumbnail = undefined;
    }
  });
</script>

{#if $info}
  <button
    onclick={() => onclick?.($info)}
    class="aspect-square overflow-hidden rounded transition active:scale-95 active:brightness-90"
  >
    {#if thumbnail}
      <img src={thumbnail} alt={$info.name} class="h-full w-full object-cover" />
    {:else}
      <div class="h-full w-full bg-gray-100"></div>
    {/if}
  </button>
{/if}
