<script lang="ts">
  import { onMount } from "svelte";
  import type { Writable } from "svelte/store";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import type { FileCacheIndex } from "$lib/indexedDB";
  import { getFileCacheIndex, deleteFileCache as doDeleteFileCache } from "$lib/modules/file";
  import { getFileInfo, type FileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { formatFileSize } from "$lib/utils";
  import File from "./File.svelte";

  interface FileCache {
    index: FileCacheIndex;
    fileInfo: Writable<FileInfo | null>;
  }

  let fileCache: FileCache[] | undefined = $state();
  let fileCacheTotalSize = $state(0);

  const deleteFileCache = async (fileId: number) => {
    await doDeleteFileCache(fileId);
    fileCache = fileCache?.filter(({ index }) => index.fileId !== fileId);
  };

  onMount(() => {
    fileCache = getFileCacheIndex()
      .map((index) => ({
        index,
        fileInfo: getFileInfo(index.fileId, $masterKeyStore?.get(1)?.key!),
      }))
      .sort((a, b) => a.index.lastRetrievedAt.getTime() - b.index.lastRetrievedAt.getTime());
  });

  $effect(() => {
    if (fileCache) {
      fileCacheTotalSize = fileCache.reduce((acc, { index }) => acc + index.size, 0);
    }
  });
</script>

<svelte:head>
  <title>캐시 설정</title>
</svelte:head>

<TopBar title="캐시" />
<FullscreenDiv>
  {#if fileCache && fileCache.length > 0}
    <div class="space-y-4 pb-4">
      <div class="space-y-1 break-keep text-gray-800">
        <p>
          {fileCache.length}개 파일이 캐시되어 {formatFileSize(fileCacheTotalSize)}를 사용하고
          있어요.
        </p>
        <p>캐시를 삭제하더라도 원본 파일은 삭제되지 않아요.</p>
      </div>
      <div class="space-y-2">
        {#each fileCache as { index, fileInfo }}
          <File {index} info={fileInfo} onDeleteClick={deleteFileCache} />
        {/each}
      </div>
    </div>
  {:else}
    <div class="flex flex-grow items-center justify-center">
      <p class="text-gray-500">
        {#if fileCache}
          캐시된 파일이 없어요.
        {:else}
          캐시 목록을 불러오고 있어요.
        {/if}
      </p>
    </div>
  {/if}
</FullscreenDiv>
