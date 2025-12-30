<script lang="ts">
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getFileInfo } from "$lib/modules/filesystem";
  import { getDownloadingFiles, clearDownloadedFiles } from "$lib/modules/file";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";

  let downloadingFilesPromise = $derived(
    Promise.all(
      getDownloadingFiles().map(async (file) => ({
        state: file,
        fileInfo: await getFileInfo(file.id, $masterKeyStore?.get(1)?.key!),
      })),
    ),
  );

  $effect(() => clearDownloadedFiles);
</script>

<svelte:head>
  <title>진행 중인 다운로드</title>
</svelte:head>

<TopBar />
<FullscreenDiv>
  {#await downloadingFilesPromise then downloadingFiles}
    {#each downloadingFiles as { state, fileInfo }}
      <File {state} info={fileInfo} />
    {/each}
  {/await}
</FullscreenDiv>
