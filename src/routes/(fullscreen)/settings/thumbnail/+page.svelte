<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv } from "$lib/components/atoms";
  import { IconEntryButton, TopBar } from "$lib/components/molecules";
  import { deleteAllFileThumbnailCaches } from "$lib/modules/file";
  import { bulkGetFileInfo, type MaybeFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { sortEntries } from "$lib/utils";
  import File from "./File.svelte";
  import {
    getThumbnailGenerationStatus,
    clearThumbnailGenerationStatuses,
    requestThumbnailGeneration,
    type GenerationStatus,
  } from "./service.svelte";

  import IconDelete from "~icons/material-symbols/delete";

  let { data } = $props();

  let fileInfos: MaybeFileInfo[] = $state([]);
  let files = $derived(
    fileInfos
      .map((info) => ({
        info,
        status: getThumbnailGenerationStatus(info.id),
      }))
      .filter(
        (file): file is { info: MaybeFileInfo; status: Exclude<GenerationStatus, "uploaded"> } =>
          file.status !== "uploaded",
      ),
  );

  const generateAllThumbnails = () => {
    files.forEach(({ info }) => {
      if (info.exists) {
        requestThumbnailGeneration(info);
      }
    });
  };

  onMount(async () => {
    fileInfos = sortEntries(
      Array.from((await bulkGetFileInfo(data.files, $masterKeyStore?.get(1)?.key!)).values()),
    );
  });

  $effect(() => clearThumbnailGenerationStatuses);
</script>

<svelte:head>
  <title>썸네일 설정</title>
</svelte:head>

<TopBar title="썸네일" />
<FullscreenDiv class="bg-gray-100 !px-0">
  <div class="flex flex-grow flex-col space-y-4">
    <div class="bg-white p-4 !pt-0">
      <IconEntryButton icon={IconDelete} onclick={deleteAllFileThumbnailCaches} class="w-full">
        저장된 썸네일 모두 삭제하기
      </IconEntryButton>
    </div>
    {#if files.length > 0}
      <div class="flex-grow space-y-2 bg-white p-4">
        <p class="text-lg font-bold text-gray-800">썸네일이 누락된 파일</p>
        <div class="space-y-4">
          <p class="break-keep text-gray-800">
            {files.length}개 파일의 썸네일이 존재하지 않아요.
          </p>
          <div class="space-y-2">
            {#each files as { info, status } (info.id)}
              {#if info.exists}
                <File
                  {info}
                  {status}
                  onclick={({ id }) => goto(`/file/${id}`)}
                  onGenerateThumbnailClick={requestThumbnailGeneration}
                />
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
  {#if files.length > 0}
    <BottomDiv class="px-4">
      <Button onclick={generateAllThumbnails} class="w-full">모두 썸네일 생성하기</Button>
    </BottomDiv>
  {/if}
</FullscreenDiv>
