<script lang="ts">
  import FileSaver from "file-saver";
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { Categories, IconEntryButton, TopBar } from "$lib/components/molecules";
  import { getFileInfo, type MaybeFileInfo } from "$lib/modules/filesystem";
  import { captureVideoThumbnail } from "$lib/modules/thumbnail";
  import { getFileDownloadState } from "$lib/modules/file";
  import { masterKeyStore } from "$lib/stores";
  import { HybridPromise } from "$lib/utils";
  import AddToCategoryBottomSheet from "./AddToCategoryBottomSheet.svelte";
  import DownloadStatus from "./DownloadStatus.svelte";
  import {
    requestFileRemovalFromCategory,
    requestFileDownload,
    requestThumbnailUpload,
    requestFileAdditionToCategory,
    requestVideoStream,
    requestFavoriteToggle,
  } from "./service";
  import TopBarMenu from "./TopBarMenu.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";
  import IconCamera from "~icons/material-symbols/camera";
  import IconClose from "~icons/material-symbols/close";
  import IconAddCircle from "~icons/material-symbols/add-circle";

  let { data } = $props();

  let info: MaybeFileInfo | undefined = $state();
  let downloadState = $derived(getFileDownloadState(data.id));

  let isMenuOpen = $state(false);
  let isAddToCategoryBottomSheetOpen = $state(false);

  let isDownloadRequested = $state(false);
  let viewerType: "image" | "video" | undefined = $state();
  let fileBlob: Blob | undefined = $state();
  let fileBlobUrl: string | undefined = $state();
  let videoStreamUrl: string | undefined = $state();
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
    void getFileInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
  };

  const removeFromCategory = async (categoryId: number) => {
    await requestFileRemovalFromCategory(data.id, categoryId);
    void getFileInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
  };

  const toggleFavorite = async () => {
    if (!info?.exists) return;
    const isFavorite = !!info.isFavorite;
    const success = await requestFavoriteToggle(data.id, isFavorite);
    if (success) {
      info.isFavorite = !isFavorite;
    }
  };

  $effect(() => {
    HybridPromise.resolve(getFileInfo(data.id, $masterKeyStore?.get(1)?.key!)).then((result) => {
      if (data.id === result.id) {
        info = result;
      }
    });
    isDownloadRequested = false;
    viewerType = undefined;
  });

  $effect(() => {
    if (info?.dataKey) {
      const contentType = info.contentType;
      if (contentType.startsWith("image")) {
        viewerType = "image";
      } else if (contentType.startsWith("video")) {
        viewerType = "video";
      }

      untrack(() => {
        if (!downloadState && !isDownloadRequested) {
          isDownloadRequested = true;

          if (viewerType === "video" && !info!.isLegacy) {
            requestVideoStream(data.id, info!.dataKey!.key, contentType).then((streamUrl) => {
              if (streamUrl) {
                videoStreamUrl = streamUrl;
              } else {
                requestFileDownload(data.id, info!.dataKey!.key, info!.isLegacy!).then((buffer) =>
                  updateViewer(buffer, contentType),
                );
              }
            });
          } else {
            requestFileDownload(data.id, info!.dataKey!.key, info!.isLegacy!).then(
              async (buffer) => {
                const blob = await updateViewer(buffer, contentType);
                if (!viewerType) {
                  FileSaver.saveAs(blob, info!.name);
                }
              },
            );
          }
        }
      });
    }
  });

  $effect(() => {
    if (info?.exists && downloadState?.status === "decrypted") {
      untrack(
        () => !isDownloadRequested && updateViewer(downloadState.result!, info!.contentType!),
      );
    }
  });

  $effect(() => () => fileBlobUrl && URL.revokeObjectURL(fileBlobUrl));
</script>

<svelte:head>
  <title>파일</title>
</svelte:head>

<TopBar title={info?.name}>
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
      directoryId={["category", "gallery", "search", "favorite"].includes(
        page.url.searchParams.get("from") ?? "",
      )
        ? info?.parentId
        : undefined}
      {fileBlob}
      downloadUrl={videoStreamUrl}
      filename={info?.name}
      isFavorite={info?.isFavorite}
      onToggleFavorite={toggleFavorite}
    />
  </div>
</TopBar>
<FullscreenDiv>
  <div class="space-y-4 pb-4">
    {#if downloadState}
      <DownloadStatus state={downloadState} />
    {/if}
    {#if info && viewerType}
      <div class="flex w-full justify-center">
        {#snippet viewerLoading(message: string)}
          <p class="text-gray-500">{message}</p>
        {/snippet}

        {#if viewerType === "image"}
          {#if fileBlobUrl}
            <img src={fileBlobUrl} alt={info.name} onerror={convertHeicToJpeg} />
          {:else}
            {@render viewerLoading("이미지를 불러오고 있어요.")}
          {/if}
        {:else if viewerType === "video"}
          {#if videoStreamUrl || fileBlobUrl}
            <div class="flex flex-col space-y-2">
              <video bind:this={videoElement} src={videoStreamUrl ?? fileBlobUrl} controls muted
              ></video>
              <IconEntryButton
                icon={IconCamera}
                onclick={() => updateThumbnail(info?.dataKey?.key!, info?.dataKey?.version!)}
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
          categories={info?.categories ?? []}
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
