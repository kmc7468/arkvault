<script lang="ts">
  import FileSaver from "file-saver";
  import { untrack } from "svelte";
  import { get, type Writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { Categories, IconEntryButton, TopBar } from "$lib/components/molecules";
  import { getFileInfo, type FileInfo } from "$lib/modules/filesystem";
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
  import TopBarMenu from "./TopBarMenu.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";
  import IconCamera from "~icons/material-symbols/camera";
  import IconClose from "~icons/material-symbols/close";
  import IconAddCircle from "~icons/material-symbols/add-circle";

  let { data } = $props();

  let info: Writable<FileInfo | null> | undefined = $state();
  // let categories: Writable<CategoryInfo | null>[] = $state([]);

  let isMenuOpen = $state(false);
  let isAddToCategoryBottomSheetOpen = $state(false);

  let downloadStatus = $derived(
    $fileDownloadStatusStore.find((statusStore) => {
      const { id, status } = get(statusStore);
      return id === data.id && isFileDownloading(status);
    }),
  );

  let isDownloadRequested = $state(false);
  let viewerType: "image" | "video" | undefined = $state();
  let fileBlob: Blob | undefined = $state();
  let fileBlobUrl: string | undefined = $state();
  let videoElement: HTMLVideoElement | undefined = $state();

  const updateViewer = async (buffer: ArrayBuffer, contentType: string) => {
    fileBlob = new Blob([buffer], { type: contentType });
    fileBlobUrl = URL.createObjectURL(fileBlob);
    return fileBlob;
  };

  const convertHeicToJpeg = async () => {
    if (fileBlob?.type !== "image/heic") return;

    URL.revokeObjectURL(fileBlobUrl!);
    fileBlobUrl = undefined;

    const { default: heic2any } = await import("heic2any");
    fileBlobUrl = URL.createObjectURL(
      (await heic2any({ blob: fileBlob, toType: "image/jpeg" })) as Blob,
    );
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
    info = getFileInfo(data.id, $masterKeyStore?.get(1)?.key!);
    isDownloadRequested = false;
    viewerType = undefined;
  });

  // $effect(() => {
  //   categories =
  //     $info?.categoryIds.map((id) => getCategoryInfo(id, $masterKeyStore?.get(1)?.key!)) ?? [];
  // });

  $effect(() => {
    if ($info && $info.dataKey && $info.contentIv) {
      const contentType = $info.contentType;
      if (contentType.startsWith("image")) {
        viewerType = "image";
      } else if (contentType.startsWith("video")) {
        viewerType = "video";
      }

      untrack(() => {
        if (!downloadStatus && !isDownloadRequested) {
          isDownloadRequested = true;
          requestFileDownload(data.id, $info.contentIv!, $info.dataKey!).then(async (buffer) => {
            const blob = await updateViewer(buffer, contentType);
            if (!viewerType) {
              FileSaver.saveAs(blob, $info.name);
            }
          });
        }
      });
    }
  });

  $effect(() => {
    if ($info && $downloadStatus?.status === "decrypted") {
      untrack(
        () => !isDownloadRequested && updateViewer($downloadStatus.result!, $info.contentType),
      );
    }
  });

  $effect(() => () => fileBlobUrl && URL.revokeObjectURL(fileBlobUrl));
</script>

<svelte:head>
  <title>파일</title>
</svelte:head>

<TopBar title={$info?.name}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div onclick={(e) => e.stopPropagation()}>
    <button
      onclick={() => (isMenuOpen = !isMenuOpen)}
      class="w-[2.3rem] flex-shrink-0 rounded-full p-1 active:bg-black active:bg-opacity-[0.04]"
    >
      <IconMoreVert class="text-2xl" />
    </button>
    <TopBarMenu
      bind:isOpen={isMenuOpen}
      directoryId={["category", "gallery"].includes(page.url.searchParams.get("from") ?? "")
        ? $info?.parentId
        : undefined}
      {fileBlob}
      filename={$info?.name}
    />
  </div>
</TopBar>
<FullscreenDiv>
  <div class="space-y-4 pb-4">
    <DownloadStatus status={downloadStatus} />
    {#if $info && viewerType}
      <div class="flex w-full justify-center">
        {#snippet viewerLoading(message: string)}
          <p class="text-gray-500">{message}</p>
        {/snippet}

        {#if viewerType === "image"}
          {#if fileBlobUrl}
            <img src={fileBlobUrl} alt={$info.name} onerror={convertHeicToJpeg} />
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
                onclick={() => updateThumbnail($info.dataKey!, $info.dataKeyVersion!)}
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
        <!-- <Categories
          {categories}
          categoryMenuIcon={IconClose}
          onCategoryClick={({ id }) => goto(`/category/${id}`)}
          onCategoryMenuClick={({ id }) => removeFromCategory(id)}
        /> -->
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
