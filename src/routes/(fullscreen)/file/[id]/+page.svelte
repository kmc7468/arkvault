<script lang="ts">
  import FileSaver from "file-saver";
  import { untrack } from "svelte";
  import { get, type Writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { Categories, IconEntryButton, TopBar } from "$lib/components/molecules";
  import { getCategoryInfo, type CategoryInfo } from "$lib/modules/filesystem2";
  import { getFileInfo } from "$lib/modules/filesystem2";
  import { captureVideoThumbnail } from "$lib/modules/thumbnail";
  import { fileDownloadStatusStore, isFileDownloading, masterKeyStore } from "$lib/stores";
  import AddToCategoryBottomSheet from "./AddToCategoryBottomSheet.svelte";
  import DownloadStatus from "./DownloadStatus.svelte";
  import {
    requestFileRemovalFromCategory,
    requestFileDownload,
    requestThumbnailUpload,
    requestFileAdditionToCategory,
  } from "./service";

  import IconCamera from "~icons/material-symbols/camera";
  import IconClose from "~icons/material-symbols/close";
  import IconAddCircle from "~icons/material-symbols/add-circle";

  let { data } = $props();

  let info = $derived(getFileInfo(data.id, $masterKeyStore?.get(1)?.key!));

  let isAddToCategoryBottomSheetOpen = $state(false);

  let downloadStatus = $derived(
    $fileDownloadStatusStore.find((statusStore) => {
      const { id, status } = get(statusStore);
      return id === data.id && isFileDownloading(status);
    }),
  );

  let isDownloadRequested = $state(false);
  let viewerType: "image" | "video" | undefined = $state();
  let fileBlobUrl: string | undefined = $state();
  let heicBlob: Blob | undefined = $state();
  let videoElement: HTMLVideoElement | undefined = $state();

  const updateViewer = async (buffer: ArrayBuffer, contentType: string) => {
    const fileBlob = new Blob([buffer], { type: contentType });
    if (viewerType) {
      fileBlobUrl = URL.createObjectURL(fileBlob);
      heicBlob = contentType === "image/heic" ? fileBlob : undefined;
    }
    return fileBlob;
  };

  const convertHeicToJpeg = async () => {
    if (!heicBlob) return;

    URL.revokeObjectURL(fileBlobUrl!);
    fileBlobUrl = undefined;

    const { default: heic2any } = await import("heic2any");
    fileBlobUrl = URL.createObjectURL(
      (await heic2any({ blob: heicBlob, toType: "image/jpeg" })) as Blob,
    );
    heicBlob = undefined;
  };

  const updateThumbnail = async (dataKey: CryptoKey, dataKeyVersion: Date) => {
    const thumbnail = await captureVideoThumbnail(videoElement!);
    await requestThumbnailUpload(data.id, thumbnail, dataKey, dataKeyVersion);
  };

  const addToCategory = async (categoryId: number) => {
    await requestFileAdditionToCategory(data.id, categoryId);
    isAddToCategoryBottomSheetOpen = false;
    info = getFileInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
  };

  const removeFromCategory = async (categoryId: number) => {
    await requestFileRemovalFromCategory(data.id, categoryId);
    info = getFileInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
  };

  $effect(() => {
    data.id;
    isDownloadRequested = false;
    viewerType = undefined;
  });

  $effect(() => {
    if ($info.data?.dataKey && $info.data?.contentIv) {
      const contentType = $info.data.contentType;
      if (contentType.startsWith("image")) {
        viewerType = "image";
      } else if (contentType.startsWith("video")) {
        viewerType = "video";
      }

      untrack(() => {
        if (!downloadStatus && !isDownloadRequested) {
          isDownloadRequested = true;
          requestFileDownload(data.id, $info.data.contentIv!, $info.data.dataKey!).then(
            async (buffer) => {
              const blob = await updateViewer(buffer, contentType);
              if (!viewerType) {
                FileSaver.saveAs(blob, $info.data.name);
              }
            },
          );
        }
      });
    }
  });

  $effect(() => {
    if ($info.status === "success" && $downloadStatus?.status === "decrypted") {
      untrack(
        () => !isDownloadRequested && updateViewer($downloadStatus.result!, $info.data.contentType),
      );
    }
  });

  $effect(() => () => fileBlobUrl && URL.revokeObjectURL(fileBlobUrl));
</script>

<svelte:head>
  <title>파일</title>
</svelte:head>

<TopBar title={$info.data?.name} />
<FullscreenDiv>
  <div class="space-y-4 pb-4">
    <DownloadStatus status={downloadStatus} />
    {#if $info.status === "success" && viewerType}
      <div class="flex w-full justify-center">
        {#snippet viewerLoading(message: string)}
          <p class="text-gray-500">{message}</p>
        {/snippet}

        {#if viewerType === "image"}
          {#if fileBlobUrl}
            <img src={fileBlobUrl} alt={$info.data.name} onerror={convertHeicToJpeg} />
          {:else}
            {@render viewerLoading("이미지를 불러오고 있어요.")}
          {/if}
        {:else if viewerType === "video"}
          {#if fileBlobUrl}
            <div class="flex flex-col space-y-2">
              <!-- svelte-ignore a11y_media_has_caption -->
              <video bind:this={videoElement} src={fileBlobUrl} controls muted></video>
              <IconEntryButton
                icon={IconCamera}
                onclick={() => updateThumbnail($info.data.dataKey!, $info.data.dataKeyVersion!)}
                class="w-full"
              >
                이 장면을 썸네일로 설정하기
              </IconEntryButton>
            </div>
          {:else}
            {@render viewerLoading("비디오를 불러오고 있어요.")}
          {/if}
        {/if}
      </div>
    {/if}
    <div class="space-y-2">
      <p class="text-lg font-bold">카테고리</p>
      <div class="space-y-1">
        <Categories
          categoryIds={$info.data?.categoryIds ?? []}
          categoryMenuIcon={IconClose}
          onCategoryClick={({ id }) => goto(`/category/${id}`)}
          onCategoryMenuClick={({ id }) => removeFromCategory(id)}
        />
        <IconEntryButton
          icon={IconAddCircle}
          onclick={() => (isAddToCategoryBottomSheetOpen = true)}
          class="h-12 w-full"
          iconClass="text-gray-600"
          textClass="text-gray-700"
        >
          카테고리에 추가하기
        </IconEntryButton>
      </div>
    </div>
  </div>
</FullscreenDiv>

<AddToCategoryBottomSheet
  bind:isOpen={isAddToCategoryBottomSheetOpen}
  onAddToCategoryClick={addToCategory}
/>
