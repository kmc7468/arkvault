<script lang="ts">
  import { onMount } from "svelte";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import {
    getDownloadingFiles,
    clearDownloadedFiles,
    type FileDownloadState,
  } from "$lib/modules/file";
  import { bulkGetFileInfo, type MaybeFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";

  let downloadingFiles: { info: MaybeFileInfo; state: FileDownloadState }[] = $state([]);

  onMount(async () => {
    const states = getDownloadingFiles();
    const infos = await bulkGetFileInfo(
      states.map(({ id }) => id),
      $masterKeyStore?.get(1)?.key!,
    );
    downloadingFiles = states.map((state) => ({
      info: infos.get(state.id)!,
      state,
    }));
  });

  $effect(() => clearDownloadedFiles);
</script>

<svelte:head>
  <title>진행 중인 다운로드</title>
</svelte:head>

<TopBar />
<FullscreenDiv>
  <div class="space-y-2 pb-4">
    {#each downloadingFiles as { info, state } (info.id)}
      {#if info.exists}
        <File {info} {state} />
      {/if}
    {/each}
  </div>
</FullscreenDiv>
