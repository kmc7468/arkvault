<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { captureVideoThumbnail } from "#lib/client/media/thumbnail.ts";
  import { saveDecryptedFile } from "#lib/client/service-worker.ts";
  import { getFileDownloadState } from "#lib/client/transfer/index.ts";
  import { showErrorToast, tryAction } from "#lib/features/errors.ts";
  import { Categories } from "#lib/features/filesystem/components/index.ts";
  import {
    addFileToCategory,
    getFileStreamUrl,
    removeFileFromCategory,
    setFileFavorite,
    uploadFileThumbnail,
    useFile,
    type DataKey,
    type FileInfo,
  } from "#lib/features/filesystem/index.ts";
  import { FullscreenDiv, IconEntryButton, TopBar } from "#lib/ui/index.ts";
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

  let isLoadRequested = $state(false);
  let viewerType: "image" | "video" | undefined = $state();
  let fileUrl: string | undefined = $state();
  let convertedImageUrl: string | undefined = $state();
  let videoElement: HTMLVideoElement | undefined = $state();

  // Chromium can't display HEIC images
  const convertHeicToJpeg = async () => {
    if (info?.contentType !== "image/heic" || !fileUrl || convertedImageUrl) return;

    try {
      const blob = await (await fetch(fileUrl)).blob();
      const { default: heic2any } = await import("heic2any");
      convertedImageUrl = URL.createObjectURL(
        (await heic2any({ blob, toType: "image/jpeg" })) as Blob,
      );
    } catch (e) {
      showErrorToast(e, "이미지를 표시하지 못했어요.");
    }
  };

  const saveFile = () => {
    if (info?.exists) {
      saveDecryptedFile(info.id, info.name);
    }
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

  $effect.pre(() => {
    void data.id; // Reset the viewer when navigating to another file
    isLoadRequested = false;
    viewerType = undefined;
    fileUrl = undefined;
    convertedImageUrl = undefined;
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
        if (isLoadRequested) return;
        isLoadRequested = true;

        const isAlreadyDownloading = !!downloadState;
        getFileStreamUrl(info as FileInfo)
          .then((url) => {
            fileUrl = url;
            if (!viewerType && !isAlreadyDownloading) {
              saveFile();
            }
          })
          .catch((e) => showErrorToast(e, "파일을 불러오지 못했어요."));
      });
    }
  });

  $effect(() => {
    const url = convertedImageUrl;
    return () => url && URL.revokeObjectURL(url);
  });
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
      onDownloadClick={fileUrl ? saveFile : undefined}
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
          {#if fileUrl}
            <img src={convertedImageUrl ?? fileUrl} alt={info.name} onerror={convertHeicToJpeg} />
          {:else}
            {@render viewerLoading("이미지를 불러오고 있어요.")}
          {/if}
        {:else if viewerType === "video"}
          {#if fileUrl}
            <div class="flex flex-col space-y-2">
              <video bind:this={videoElement} src={fileUrl} controls muted></video>
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
