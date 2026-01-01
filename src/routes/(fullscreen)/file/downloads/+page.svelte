<script lang="ts">
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getDownloadingFiles, clearDownloadedFiles } from "$lib/modules/file";
  import { bulkGetFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";

  const downloadingFiles = getDownloadingFiles();
  const filesPromise = $derived(
    bulkGetFileInfo(
      downloadingFiles.map(({ id }) => id),
      $masterKeyStore?.get(1)?.key!,
    ),
  );

  $effect(() => clearDownloadedFiles);
</script>

<svelte:head>
  <title>진행 중인 다운로드</title>
</svelte:head>

<TopBar />
<FullscreenDiv>
  {#await filesPromise then files}
    <div class="space-y-2 pb-4">
      {#each downloadingFiles as state}
        {@const info = files.get(state.id)!}
        {#if info.exists}
          <File {state} {info} />
        {/if}
      {/each}
    </div>
  {/await}
</FullscreenDiv>
