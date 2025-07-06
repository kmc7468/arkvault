<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";
  import {
    persistentStates,
    getGenerationStatus,
    requestFileThumbnailGeneration,
  } from "./service.svelte";

  let { data } = $props();

  const generateAllThumbnails = async () => {
    persistentStates.files.forEach(({ info }) => {
      const fileInfo = get(info);
      if (fileInfo) {
        requestFileThumbnailGeneration(fileInfo);
      }
    });
  };

  onMount(() => {
    persistentStates.files = data.files.map((fileId) => ({
      id: fileId,
      info: getFileInfo(fileId, $masterKeyStore?.get(1)?.key!),
      status: getGenerationStatus(fileId),
    }));
  });
</script>

<svelte:head>
  <title>썸네일 설정</title>
</svelte:head>

<TopBar title="썸네일" />
<FullscreenDiv>
  {#if persistentStates.files.length > 0}
    <div class="space-y-4 pb-4">
      <div class="space-y-1 break-keep text-gray-800">
        <p>
          {persistentStates.files.length}개 파일의 썸네일이 존재하지 않아요.
        </p>
      </div>
      <div class="space-y-2">
        {#each persistentStates.files as { info, status }}
          <File
            {info}
            generationStatus={status}
            onclick={({ id }) => goto(`/file/${id}`)}
            onGenerateThumbnailClick={requestFileThumbnailGeneration}
          />
        {/each}
      </div>
    </div>
    <BottomDiv class="flex flex-col items-center gap-y-2">
      <Button onclick={generateAllThumbnails} class="w-full">모두 썸네일 생성하기</Button>
    </BottomDiv>
  {:else}
    <div class="flex flex-grow items-center justify-center">
      <p class="text-gray-500">모든 파일의 썸네일이 존재해요.</p>
    </div>
  {/if}
</FullscreenDiv>
