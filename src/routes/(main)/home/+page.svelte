<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { EntryButton, FileThumbnailButton } from "$lib/components/atoms";
  import { bulkGetFileInfo, type MaybeFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { requestFreshMediaFilesRetrieval } from "./service";

  let mediaFiles: MaybeFileInfo[] = $state([]);

  onMount(async () => {
    const files = await requestFreshMediaFilesRetrieval();
    mediaFiles = Array.from(
      (
        await bulkGetFileInfo(
          files.map(({ id }) => id),
          $masterKeyStore?.get(1)?.key!,
        )
      ).values(),
    );
  });
</script>

<svelte:head>
  <title>홈</title>
</svelte:head>

<div class="min-h-full space-y-4 bg-gray-100 px-4 pb-[5.5em] pt-4">
  <p class="px-2 text-2xl font-bold text-gray-800">ArkVault</p>
  <div class="rounded-xl bg-white p-2">
    <EntryButton onclick={() => goto("/gallery")} class="w-full">
      <p class="text-left font-semibold">사진 및 동영상</p>
    </EntryButton>
    {#if mediaFiles.length > 0}
      <div class="grid grid-cols-4 gap-2 p-2">
        {#each mediaFiles as file}
          {#if file.exists}
            <FileThumbnailButton info={file} onclick={({ id }) => goto(`/file/${id}`)} />
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>
