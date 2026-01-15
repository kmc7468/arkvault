<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { FloatingButton } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getDirectoryInfo, type MaybeDirectoryInfo } from "$lib/modules/filesystem";
  import { masterKeyStore, hmacSecretStore } from "$lib/stores";
  import { HybridPromise } from "$lib/utils";
  import DirectoryCreateModal from "./DirectoryCreateModal.svelte";
  import DirectoryEntries from "./DirectoryEntries";
  import DownloadStatusCard from "./DownloadStatusCard.svelte";
  import DuplicateFileModal from "./DuplicateFileModal.svelte";
  import EntryCreateBottomSheet from "./EntryCreateBottomSheet.svelte";
  import EntryDeleteModal from "./EntryDeleteModal.svelte";
  import EntryMenuBottomSheet from "./EntryMenuBottomSheet.svelte";
  import EntryRenameModal from "./EntryRenameModal.svelte";
  import UploadStatusCard from "./UploadStatusCard.svelte";
  import {
    createContext,
    requestHmacSecretDownload,
    requestDirectoryCreation,
    requestFileUpload,
    requestEntryRename,
    requestEntryDeletion,
  } from "./service.svelte";

  import IconSearch from "~icons/material-symbols/search";
  import IconAdd from "~icons/material-symbols/add";

  let { data } = $props();
  let context = createContext();

  let info: MaybeDirectoryInfo | undefined = $state();
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
    ["file", "search"].includes(page.url.searchParams.get("from") ?? ""),
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

  const uploadFile = () => {
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      requestFileUpload(file, data.id, $masterKeyStore?.get(1)!, $hmacSecretStore?.get(1)!, () => {
        return new Promise((resolve) => {
          duplicatedFile = file;
          resolveForDuplicateFileModal = resolve;
          isDuplicateFileModalOpen = true;
        });
      })
        .then((res) => {
          if (!res) return;
          // TODO: FIXME
          void getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!);
        })
        .catch((e: Error) => {
          // TODO: FIXME
          console.error(e);
        });
    }

    fileInput!.value = "";
  };

  onMount(async () => {
    if (!$hmacSecretStore && !(await requestHmacSecretDownload($masterKeyStore?.get(1)?.key!))) {
      throw new Error("Failed to download hmac secrets");
    }
  });

  $effect(() => {
    HybridPromise.resolve(getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!)).then(
      (result) => {
        if (data.id === result.id) {
          info = result;
        }
      },
    );
  });
</script>

<svelte:head>
  <title>파일</title>
</svelte:head>

<input bind:this={fileInput} onchange={uploadFile} type="file" multiple class="hidden" />

<div class="flex h-full flex-col">
  <TopBar title={info?.name ?? "내 파일"} {showBackButton} class="flex-shrink-0">
    <button
      onclick={onSearchClick}
      class="w-[2.3rem] flex-shrink-0 rounded-full p-1 active:bg-black active:bg-opacity-[0.04]"
    >
      <IconSearch class="text-2xl" />
    </button>
  </TopBar>
  {#if info?.exists}
    <div class="flex flex-grow flex-col px-4 pb-4">
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
  class="bottom-24 right-4"
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
  onCreateClick={async (name) => {
    if (await requestDirectoryCreation(name, data.id, $masterKeyStore?.get(1)!)) {
      void getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
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
/>
<EntryRenameModal
  bind:isOpen={isEntryRenameModalOpen}
  onRenameClick={async (newName: string) => {
    if (await requestEntryRename(context.selectedEntry!, newName)) {
      void getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
<EntryDeleteModal
  bind:isOpen={isEntryDeleteModalOpen}
  onDeleteClick={async () => {
    if (await requestEntryDeletion(context.selectedEntry!)) {
      void getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
