<script lang="ts">
  import type { Writable } from "svelte/store";
  import type { FileCacheIndex } from "$lib/indexedDB";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { formatDate, formatFileSize } from "$lib/utils";

  import IconDraft from "~icons/material-symbols/draft";
  import IconScanDelete from "~icons/material-symbols/scan-delete";
  import IconDelete from "~icons/material-symbols/delete";

  interface Props {
    index: FileCacheIndex;
    info: Writable<FileInfo | null>;
    onDeleteClick: (fileId: number) => void;
  }

  let { index, info, onDeleteClick }: Props = $props();
</script>

<div class="flex h-14 items-center gap-x-4 p-2">
  {#if $info}
    <div class="flex-shrink-0 rounded-full bg-blue-100 p-1 text-xl">
      <IconDraft class="text-blue-400" />
    </div>
  {:else}
    <div class="flex-shrink-0 rounded-full bg-red-100 p-1 text-xl">
      <IconScanDelete class="text-red-400" />
    </div>
  {/if}
  <div class="flex-grow overflow-hidden">
    {#if $info}
      <p title={$info.name} class="truncate font-medium">{$info.name}</p>
    {:else}
      <p class="font-medium">삭제된 파일</p>
    {/if}
    <p class="text-xs text-gray-800">
      읽음 {formatDate(index.lastRetrievedAt)} · {formatFileSize(index.size)}
    </p>
  </div>
  <button
    onclick={() => setTimeout(() => onDeleteClick(index.fileId), 100)}
    class="flex-shrink-0 rounded-full p-1 active:bg-gray-100"
  >
    <IconDelete class="text-lg text-gray-600" />
  </button>
</div>
