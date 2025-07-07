<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv } from "$lib/components/atoms";
  import { IconEntryButton, TopBar } from "$lib/components/molecules";
  import { deleteAllFileThumbnailCaches } from "$lib/modules/file";
  import { getFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";
  import {
    persistentStates,
    getGenerationStatus,
    requestThumbnailGeneration,
  } from "./service.svelte";

  import IconDelete from "~icons/material-symbols/delete";

  let { data } = $props();

  const generateAllThumbnails = () => {
    persistentStates.files.forEach(({ info }) => {
      const fileInfo = get(info);
      if (fileInfo) {
        requestThumbnailGeneration(fileInfo);
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
<FullscreenDiv class="bg-gray-100 !px-0">
  <div class="flex flex-grow flex-col space-y-4">
    <div class="flex-shrink-0 bg-white p-4 !pt-0">
      <IconEntryButton icon={IconDelete} onclick={deleteAllFileThumbnailCaches} class="w-full">
        저장된 썸네일 모두 삭제하기
      </IconEntryButton>
    </div>
    {#if persistentStates.files.length > 0}
      <div class="flex-grow space-y-2 bg-white p-4">
        <p class="text-lg font-bold text-gray-800">썸네일이 누락된 파일</p>
        <div class="space-y-4">
          <p class="break-keep text-gray-800">
            {persistentStates.files.length}개 파일의 썸네일이 존재하지 않아요.
          </p>
          <div class="space-y-2">
            {#each persistentStates.files as { info, status }}
              <File
                {info}
                generationStatus={status}
                onclick={({ id }) => goto(`/file/${id}`)}
                onGenerateThumbnailClick={requestThumbnailGeneration}
              />
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
  {#if persistentStates.files.length > 0}
    <BottomDiv class="flex flex-col items-center gap-y-2 px-4">
      <Button onclick={generateAllThumbnails} class="w-full">모두 썸네일 생성하기</Button>
    </BottomDiv>
  {/if}
</FullscreenDiv>
