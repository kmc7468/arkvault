<script lang="ts">
  import { FullscreenDiv } from "#lib/components/atoms/index.js";
  import { TopBar } from "#lib/components/molecules/index.js";
  import { getUploadingFiles, clearUploadedFiles } from "#lib/client/transfer/index.js";
  import File from "./File.svelte";

  const uploadingFiles = getUploadingFiles();

  $effect(() => clearUploadedFiles);
</script>

<svelte:head>
  <title>진행 중인 업로드</title>
</svelte:head>

<TopBar />
<FullscreenDiv>
  <div class="space-y-2 pb-4">
    {#each uploadingFiles as file (file.id)}
      <File state={file} />
    {/each}
  </div>
</FullscreenDiv>
