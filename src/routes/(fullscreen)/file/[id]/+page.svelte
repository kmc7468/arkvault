<script lang="ts">
  import FileSaver from "file-saver";
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { FullscreenDiv } from "#lib/components/atoms/index.js";
  import { Categories, IconEntryButton, TopBar } from "#lib/components/molecules/index.js";
  import { captureVideoThumbnail } from "#lib/client/media/thumbnail.js";
  import { getFileDownloadState } from "#lib/client/transfer/index.js";
  import { showErrorToast, tryAction } from "#lib/client/toast.svelte.js";
  import {
    addFileToCategory,
    getFileContent,
    getFileStreamUrl,
    removeFileFromCategory,
    setFileFavorite,
    uploadFileThumbnail,
    useFile,
    type DataKey,
    type FileInfo,
  } from "#lib/features/filesystem/index.js";
  import AddToCategoryBottomSheet from "./AddToCategoryBottomSheet.svelte";
  import DownloadStatus from "./DownloadStatus.svelte";
  import TopBarMenu from "./TopBarMenu.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";
  import IconCamera from "~icons/material-symbols/camera";
  import IconClose from "~icons/material-symbols/close";
  import IconAddCircle from "~icons/material-symbols/add-circle";

  let { data } = $props();

  const file = useFile(() => data.id);
  let info = $derived(file.current);
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

  const updateThumbnail = (dataKey: DataKey) =>
    tryAction(async () => {
      const thumbnail = await captureVideoThumbnail(videoElement!);
      await uploadFileThumbnail(data.id, thumbnail, dataKey);
    }, "썸네일을 설정하지 못했어요.");

  const addToCategory = async (categoryId: number) => {
    if (
      await tryAction(
        () => addFileToCategory(data.id, categoryId),
        "카테고리에 파일을 추가하지 못했어요.",
      )
    ) {
      isAddToCategoryBottomSheetOpen = false;
    }
  };

  const removeFromCategory = (categoryId: number) =>
    tryAction(
      () => removeFileFromCategory(data.id, categoryId),
      "카테고리에서 파일을 제거하지 못했어요.",
    );

  const toggleFavorite = () =>
    tryAction(
      () => setFileFavorite(info as FileInfo, !info?.isFavorite),
      "즐겨찾기를 변경하지 못했어요.",
    );

  const loadContent = (dataKey: CryptoKey, isLegacy: boolean) =>
    getFileContent(data.id, dataKey, isLegacy).catch((e) => {
      showErrorToast(e, "파일을 불러오지 못했어요.");
      throw e;
    });

  $effect.pre(() => {
    void data.id; // Reset the viewer when navigating to another file
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

          const { key } = info!.dataKey!;
          const isLegacy = !!info!.isLegacy;
          if (viewerType === "video" && !isLegacy) {
            getFileStreamUrl(data.id, key, contentType)
              .then((streamUrl) => {
                videoStreamUrl = streamUrl;
              })
              .catch(async () => {
                // Fall back to downloading the whole file
                await updateViewer(await loadContent(key, isLegacy), contentType);
              });
          } else {
            void loadContent(key, isLegacy).then(async (buffer) => {
              const blob = await updateViewer(buffer, contentType);
              if (!viewerType) {
                FileSaver.saveAs(blob, info!.name);
              }
            });
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
      class="w-full rounded-full p-1 text-2xl active:bg-black/4"
    >
      <IconMoreVert />
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
                onclick={() => updateThumbnail(info!.dataKey!)}
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
