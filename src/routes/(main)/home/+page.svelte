<script lang="ts">
  import type { Writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { EntryButton } from "$lib/components/atoms";
  import { FileThumbnailButton } from "$lib/components/molecules";
  import { getFileInfo, type FileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { requestFreshFilesRetrieval } from "./service";

  let files: Writable<FileInfo | null>[] = $state([]);

  $effect(() => {
    requestFreshFilesRetrieval().then((retrievedFiles) => {
      files = retrievedFiles.map(({ id }) => getFileInfo(id, $masterKeyStore?.get(1)?.key!));
    });
  });
</script>

<svelte:head>
  <title>홈</title>
</svelte:head>

<div class="min-h-full space-y-4 bg-gray-100 px-4 pb-[5.5em] pt-4">
  <p class="px-2 text-2xl font-bold text-gray-800">ArkVault</p>
  <div class="space-y-2 rounded-xl bg-white px-2 pb-4 pt-2">
    <EntryButton onclick={() => goto("/gallery")} class="w-full">
      <p class="text-left font-semibold">사진 및 동영상</p>
    </EntryButton>
    <div class="grid grid-cols-4 gap-2 px-2">
      {#each files as file}
        <FileThumbnailButton info={file} onclick={({ id }) => goto(`/file/${id}`)} />
      {/each}
    </div>
  </div>
</div>
