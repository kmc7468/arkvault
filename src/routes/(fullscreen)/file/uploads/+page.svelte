<script lang="ts">
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getUploadingFiles, clearUploadedFiles } from "$lib/modules/file";
  import File from "./File.svelte";

  $effect(() => clearUploadedFiles);
</script>

<svelte:head>
  <title>진행 중인 업로드</title>
</svelte:head>

<TopBar />
<FullscreenDiv>
  <div class="space-y-2 pb-4">
    {#each getUploadingFiles() as file}
      <File state={file} />
    {/each}
  </div>
</FullscreenDiv>
