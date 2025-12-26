<script lang="ts">
  import { onMount } from "svelte";
  import type { Writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { FloatingButton } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { getDirectoryInfo, type DirectoryInfo } from "$lib/modules/filesystem";
  import { masterKeyStore, hmacSecretStore } from "$lib/stores";
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

  import IconAdd from "~icons/material-symbols/add";

  let { data } = $props();
  let context = createContext();

  let info: Writable<DirectoryInfo | null> | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let duplicatedFile: File | undefined = $state();
  let resolveForDuplicateFileModal: ((res: boolean) => void) | undefined = $state();

  let isEntryCreateBottomSheetOpen = $state(false);
  let isDirectoryCreateModalOpen = $state(false);
  let isDuplicateFileModalOpen = $state(false);

  let isEntryMenuBottomSheetOpen = $state(false);
  let isEntryRenameModalOpen = $state(false);
  let isEntryDeleteModalOpen = $state(false);

  let isFromFilePage = $derived(page.url.searchParams.get("from") === "file");
  let showTopBar = $derived(data.id !== "root" || isFromFilePage);

  const uploadFile = () => {
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      requestFileUpload(file, data.id, $hmacSecretStore?.get(1)!, $masterKeyStore?.get(1)!, () => {
        return new Promise((resolve) => {
          duplicatedFile = file;
          resolveForDuplicateFileModal = resolve;
          isDuplicateFileModalOpen = true;
        });
      })
        .then((res) => {
          if (!res) return;
          // TODO: FIXME
          info = getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!);
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
    info = getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!);
  });
</script>

<svelte:head>
  <title>파일</title>
</svelte:head>

<input bind:this={fileInput} onchange={uploadFile} type="file" multiple class="hidden" />

<div class="flex h-full flex-col">
  {#if showTopBar}
    <TopBar title={$info?.name} class="flex-shrink-0" />
  {/if}
  {#if $info}
    <div class={["flex flex-grow flex-col px-4 pb-4", !showTopBar && "pt-4"]}>
      <div class="flex gap-x-2">
        <UploadStatusCard onclick={() => goto("/file/uploads")} />
        <DownloadStatusCard onclick={() => goto("/file/downloads")} />
      </div>
      {#key $info}
        <DirectoryEntries
          info={$info}
          onEntryClick={({ type, id }) => goto(`/${type}/${id}`)}
          onEntryMenuClick={(entry) => {
            context.selectedEntry = entry;
            isEntryMenuBottomSheetOpen = true;
          }}
          showParentEntry={isFromFilePage && $info.parentId !== undefined}
          onParentClick={() =>
            goto(
              $info.parentId === "root"
                ? "/directory?from=file"
                : `/directory/${$info.parentId}?from=file`,
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
      info = getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
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
      info = getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
<EntryDeleteModal
  bind:isOpen={isEntryDeleteModalOpen}
  onDeleteClick={async () => {
    if (await requestEntryDeletion(context.selectedEntry!)) {
      info = getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
