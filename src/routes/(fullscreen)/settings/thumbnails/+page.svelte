<script lang="ts">
  import { onMount } from "svelte";
  import { get, type Writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getFileInfo, type FileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";
  import {
    requestFileDownload,
    generateThumbnail as generateThumbnailInternal,
    requestThumbnailUpload,
  } from "./service";

  let { data } = $props();

  let fileInfos: Writable<FileInfo | null>[] | undefined = $state();

  const generateThumbnail = async (fileInfo: FileInfo) => {
    // TODO: Error handling

    const file = await requestFileDownload(fileInfo.id, fileInfo.contentIv!, fileInfo.dataKey!);
    const thumbnail = await generateThumbnailInternal(file, fileInfo.contentType);

    // TODO: Error handling
    await requestThumbnailUpload(
      fileInfo.id,
      await thumbnail!.arrayBuffer(),
      fileInfo.dataKey!,
      fileInfo.dataKeyVersion!,
    );
  };

  const generateAllThumbnails = async () => {
    if (!fileInfos) return;

    await Promise.all(
      fileInfos.map(async (fileInfoStore) => {
        const fileInfo = get(fileInfoStore);
        if (fileInfo) {
          await generateThumbnail(fileInfo);
        }
      }),
    );
  };

  onMount(() => {
    fileInfos = data.files.map((file) => getFileInfo(file, $masterKeyStore?.get(1)?.key!));
  });
</script>

<svelte:head>
  <title>썸네일 설정</title>
</svelte:head>

<TopBar title="썸네일" />
<FullscreenDiv>
  {#if fileInfos && fileInfos.length > 0}
    <div class="space-y-4 pb-4">
      <div class="space-y-1 break-keep text-gray-800">
        <p>
          {fileInfos.length}개 파일의 썸네일이 존재하지 않아요.
        </p>
      </div>
      <div class="space-y-2">
        {#each fileInfos as fileInfo}
          <File
            info={fileInfo}
            onclick={({ id }) => goto(`/file/${id}`)}
            onGenerateThumbnailClick={generateThumbnail}
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
