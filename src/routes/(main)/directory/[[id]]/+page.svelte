<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { FloatingButton } from "#lib/components/atoms/index.js";
  import { TopBar } from "#lib/components/molecules/index.js";
  import { tryAction } from "#lib/client/toast.svelte.js";
  import { createDirectory, uploadFile, useDirectory } from "#lib/features/filesystem/index.js";
  import DirectoryCreateModal from "./DirectoryCreateModal.svelte";
  import DirectoryEntries from "./DirectoryEntries";
  import DownloadStatusCard from "./DownloadStatusCard.svelte";
  import DuplicateFileModal from "./DuplicateFileModal.svelte";
  import EntryCreateBottomSheet from "./EntryCreateBottomSheet.svelte";
  import EntryDeleteModal from "./EntryDeleteModal.svelte";
  import EntryMenuBottomSheet from "./EntryMenuBottomSheet.svelte";
  import EntryRenameModal from "./EntryRenameModal.svelte";
  import UploadStatusCard from "./UploadStatusCard.svelte";
  import { createContext, deleteEntry, renameEntry, toggleEntryFavorite } from "./service.svelte";

  import IconSearch from "~icons/material-symbols/search";
  import IconAdd from "~icons/material-symbols/add";

  let { data } = $props();
  let context = createContext();

  const directory = useDirectory(() => data.id);
  let info = $derived(directory.current);
  let fileInput: HTMLInputElement | undefined = $state();
  let duplicatedFile: File | undefined = $state();
  let resolveForDuplicateFileModal: ((res: boolean) => void) | undefined = $state();

  let isEntryCreateBottomSheetOpen = $state(false);
  let isDirectoryCreateModalOpen = $state(false);
  let isDuplicateFileModalOpen = $state(false);

  let isEntryMenuBottomSheetOpen = $state(false);
  let isEntryRenameModalOpen = $state(false);
  let isEntryDeleteModalOpen = $state(false);

  let showParentEntry = $derived(
    ["file", "search", "favorite"].includes(page.url.searchParams.get("from") ?? ""),
  );
  let showBackButton = $derived(data.id !== "root" || showParentEntry);

  const onSearchClick = async () => {
    const params = new URLSearchParams();
    if (data.id !== "root") {
      params.set("directoryId", data.id.toString());
    }
    const query = params.toString();
    await goto(`/search${query ? `?${query}` : ""}`);
  };

  const uploadFiles = () => {
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      void tryAction(
        () =>
          uploadFile(file, data.id, () => {
            return new Promise((resolve) => {
              duplicatedFile = file;
              resolveForDuplicateFileModal = resolve;
              isDuplicateFileModalOpen = true;
            });
          }),
        `'${file.name}' 파일을 업로드하지 못했어요.`,
      );
    }

    fileInput!.value = "";
  };
</script>

<svelte:head>
  <title>내 파일</title>
</svelte:head>

<input bind:this={fileInput} onchange={uploadFiles} type="file" multiple class="hidden" />

<div class="flex h-full flex-col">
  <TopBar title={info?.name ?? "내 파일"} {showBackButton} class="shrink-0">
    <button onclick={onSearchClick} class="w-[2.3rem] shrink-0 rounded-full p-1 active:bg-black/4">
      <IconSearch class="text-2xl" />
    </button>
  </TopBar>
  {#if info?.exists}
    <div class="flex grow flex-col px-4 pb-4">
      <div class="flex gap-x-2">
        <UploadStatusCard onclick={() => goto("/file/uploads")} />
        <DownloadStatusCard onclick={() => goto("/file/downloads")} />
      </div>
      {#key info.id}
        <DirectoryEntries
          {info}
          onEntryClick={({ type, id }) => goto(`/${type}/${id}`)}
          onEntryMenuClick={(entry) => {
            context.selectedEntry = entry;
            isEntryMenuBottomSheetOpen = true;
          }}
          showParentEntry={showParentEntry && data.id !== "root"}
          onParentClick={() =>
            goto(
              info!.parentId === "root"
                ? `/directory?from=${page.url.searchParams.get("from")}`
                : `/directory/${info!.parentId}?from=${page.url.searchParams.get("from")}`,
            )}
        />
      {/key}
    </div>
  {/if}
</div>

<FloatingButton
  icon={IconAdd}
  onclick={() => {
    isEntryCreateBottomSheetOpen = true;
  }}
  class="right-4 bottom-24"
/>
<EntryCreateBottomSheet
  bind:isOpen={isEntryCreateBottomSheetOpen}
  onDirectoryCreateClick={() => {
    isEntryCreateBottomSheetOpen = false;
    isDirectoryCreateModalOpen = true;
  }}
  onFileUploadClick={() => {
    isEntryCreateBottomSheetOpen = false;
    fileInput?.click();
  }}
/>
<DirectoryCreateModal
  bind:isOpen={isDirectoryCreateModalOpen}
  onCreateClick={(name) =>
    tryAction(() => createDirectory(data.id, name), "폴더를 만들지 못했어요.")}
/>
<DuplicateFileModal
  bind:isOpen={isDuplicateFileModalOpen}
  file={duplicatedFile}
  onbeforeclose={() => {
    resolveForDuplicateFileModal?.(false);
    isDuplicateFileModalOpen = false;
  }}
  onUploadClick={() => {
    resolveForDuplicateFileModal?.(true);
    isDuplicateFileModalOpen = false;
  }}
/>

<EntryMenuBottomSheet
  bind:isOpen={isEntryMenuBottomSheetOpen}
  onRenameClick={() => {
    isEntryMenuBottomSheetOpen = false;
    isEntryRenameModalOpen = true;
  }}
  onDeleteClick={() => {
    isEntryMenuBottomSheetOpen = false;
    isEntryDeleteModalOpen = true;
  }}
  onFavoriteClick={async () => {
    if (
      await tryAction(
        () => toggleEntryFavorite(context.selectedEntry!),
        "즐겨찾기를 변경하지 못했어요.",
      )
    ) {
      isEntryMenuBottomSheetOpen = false;
    }
  }}
/>
<EntryRenameModal
  bind:isOpen={isEntryRenameModalOpen}
  onRenameClick={(newName: string) =>
    tryAction(() => renameEntry(context.selectedEntry!, newName), "이름을 바꾸지 못했어요.")}
/>
<EntryDeleteModal
  bind:isOpen={isEntryDeleteModalOpen}
  onDeleteClick={() => tryAction(() => deleteEntry(context.selectedEntry!), "삭제하지 못했어요.")}
/>
