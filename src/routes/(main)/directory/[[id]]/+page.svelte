<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { FloatingButton } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import {
    storeFileCache,
    deleteFileCache,
    storeFileThumbnailCache,
    deleteFileThumbnailCache,
  } from "$lib/modules/file";
  import {
    getDirectoryInfo,
    useDirectoryCreation,
    useDirectoryRename,
    useDirectoryDeletion,
    useFileUpload,
    useFileRename,
    useFileDeletion,
  } from "$lib/modules/filesystem2";
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
  import { createContext, requestHmacSecretDownload } from "./service.svelte";

  import IconAdd from "~icons/material-symbols/add";

  let { data } = $props();
  let context = createContext();

  let info = $derived(getDirectoryInfo(data.id, $masterKeyStore?.get(1)?.key!));
  let requestDirectoryCreation = $derived(useDirectoryCreation(data.id, $masterKeyStore?.get(1)!));
  let requestDirectoryRename = useDirectoryRename();
  let requestDirectoryDeletion = $derived(useDirectoryDeletion(data.id));
  let requestFileUpload = $derived(
    useFileUpload(data.id, $masterKeyStore?.get(1)!, $hmacSecretStore?.get(1)!),
  );
  let requestFileRename = $derived(useFileRename());
  let requestFileDeletion = $derived(useFileDeletion(data.id));

  let fileInput: HTMLInputElement | undefined = $state();
  let duplicatedFile: File | undefined = $state();
  let resolveForDuplicateFileModal: ((res: boolean) => void) | undefined = $state();

  let isEntryCreateBottomSheetOpen = $state(false);
  let isDirectoryCreateModalOpen = $state(false);
  let isDuplicateFileModalOpen = $state(false);

  let isEntryMenuBottomSheetOpen = $state(false);
  let isEntryRenameModalOpen = $state(false);
  let isEntryDeleteModalOpen = $state(false);

  const uploadFile = () => {
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      $requestFileUpload
        .mutateAsync({
          file,
          onDuplicate: () => {
            return new Promise((resolve) => {
              duplicatedFile = file;
              resolveForDuplicateFileModal = resolve;
              isDuplicateFileModalOpen = true;
            });
          },
        })
        .then((res) => {
          if (res) {
            storeFileCache(res.fileId, res.fileBuffer); // Intended
            if (res.thumbnailBuffer) {
              storeFileThumbnailCache(res.fileId, res.thumbnailBuffer); // Intended
            }
          }
        });
    }

    fileInput!.value = "";
  };

  onMount(async () => {
    if (!$hmacSecretStore && !(await requestHmacSecretDownload($masterKeyStore?.get(1)?.key!))) {
      throw new Error("Failed to download hmac secrets");
    }
  });
</script>

<svelte:head>
  <title>파일</title>
</svelte:head>

<input bind:this={fileInput} onchange={uploadFile} type="file" multiple class="hidden" />

<div class="flex h-full flex-col">
  {#if data.id !== "root"}
    <TopBar title={$info.data?.name} class="flex-shrink-0" />
  {/if}
  {#if $info.status === "success"}
    <div class={["flex flex-grow flex-col px-4 pb-4", data.id === "root" && "pt-4"]}>
      <div class="flex gap-x-2">
        <UploadStatusCard onclick={() => goto("/file/uploads")} />
        <DownloadStatusCard onclick={() => goto("/file/downloads")} />
      </div>
      {#key $info.data.id}
        <DirectoryEntries
          info={$info.data}
          onEntryClick={({ type, id }) => goto(`/${type}/${id}`)}
          onEntryMenuClick={(entry) => {
            context.selectedEntry = entry;
            isEntryMenuBottomSheetOpen = true;
          }}
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
    $requestDirectoryCreation.mutate({ name });
    return true; // TODO
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
    if (context.selectedEntry!.type === "directory") {
      $requestDirectoryRename.mutate({
        id: context.selectedEntry!.id,
        dataKey: context.selectedEntry!.dataKey,
        dataKeyVersion: context.selectedEntry!.dataKeyVersion,
        newName,
      });
      return true; // TODO
    } else {
      $requestFileRename.mutate({
        id: context.selectedEntry!.id,
        dataKey: context.selectedEntry!.dataKey,
        dataKeyVersion: context.selectedEntry!.dataKeyVersion,
        newName,
      });
      return true; // TODO
    }
  }}
/>
<EntryDeleteModal
  bind:isOpen={isEntryDeleteModalOpen}
  onDeleteClick={async () => {
    if (context.selectedEntry!.type === "directory") {
      const res = await $requestDirectoryDeletion.mutateAsync({ id: context.selectedEntry!.id });
      if (!res) return false;
      await Promise.all(
        res.deletedFiles.flatMap((fileId) => [
          deleteFileCache(fileId),
          deleteFileThumbnailCache(fileId),
        ]),
      );
      return true; // TODO
    } else {
      await $requestFileDeletion.mutateAsync({ id: context.selectedEntry!.id });
      await Promise.all([
        deleteFileCache(context.selectedEntry!.id),
        deleteFileThumbnailCache(context.selectedEntry!.id),
      ]);
      return true; // TODO
    }
  }}
/>
