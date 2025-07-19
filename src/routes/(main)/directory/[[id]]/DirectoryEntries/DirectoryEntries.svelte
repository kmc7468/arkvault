<script lang="ts">
  import { derived } from "svelte/store";
  import {
    getDirectoryInfo,
    getFileInfo,
    type DirectoryInfo,
    type SubDirectoryInfo,
    type FileInfo,
  } from "$lib/modules/filesystem2";
  import { SortBy, sortEntries } from "$lib/modules/util";
  import {
    fileUploadStatusStore,
    isFileUploading,
    masterKeyStore,
    type FileUploadStatus,
  } from "$lib/stores";
  import File from "./File.svelte";
  import SubDirectory from "./SubDirectory.svelte";
  import UploadingFile from "./UploadingFile.svelte";
  import type { SelectedEntry } from "../service.svelte";

  interface Props {
    info: DirectoryInfo;
    onEntryClick: (entry: SelectedEntry) => void;
    onEntryMenuClick: (entry: SelectedEntry) => void;
    sortBy?: SortBy;
  }

  let { info, onEntryClick, onEntryMenuClick, sortBy = SortBy.NAME_ASC }: Props = $props();

  interface DirectoryEntry {
    name?: string;
    info: SubDirectoryInfo;
  }

  type FileEntry =
    | {
        type: "file";
        name?: string;
        info: FileInfo;
      }
    | {
        type: "uploading-file";
        name: string;
        info: FileUploadStatus;
      };

  let subDirectories = $derived(
    derived(
      info.subDirectoryIds.map((id) => getDirectoryInfo(id, $masterKeyStore?.get(1)?.key!)),
      (infos) => {
        const subDirectories = infos
          .filter(($info) => $info.status === "success")
          .map(
            ($info) =>
              ({
                name: $info.data.name,
                info: $info.data as SubDirectoryInfo,
              }) satisfies DirectoryEntry,
          );
        sortEntries(subDirectories, sortBy);
        return subDirectories;
      },
    ),
  );
  let files = $derived(
    derived(
      info.fileIds.map((id) => getFileInfo(id, $masterKeyStore?.get(1)?.key!)),
      (infos) =>
        infos
          .filter(($info) => $info.status === "success")
          .map(
            ($info) =>
              ({
                type: "file",
                name: $info.data.name,
                info: $info.data,
              }) satisfies FileEntry,
          ),
    ),
  );
  let uploadingFiles = $derived(
    derived($fileUploadStatusStore, (statuses) =>
      statuses
        .filter(({ parentId, status }) => parentId === info.id && isFileUploading(status))
        .map(
          ($status) =>
            ({
              type: "uploading-file",
              name: $status.name,
              info: $status,
            }) satisfies FileEntry,
        ),
    ),
  );
  let everyFiles = $derived(
    derived([files, uploadingFiles], ([$files, $uploadingFiles]) => {
      const allFiles = [...$files, ...$uploadingFiles];
      sortEntries(allFiles, sortBy);
      return allFiles;
    }),
  );
</script>

{#if $subDirectories.length + $everyFiles.length > 0}
  <div class="space-y-1 pb-[4.5rem]">
    {#each $subDirectories as { info }}
      <SubDirectory {info} onclick={onEntryClick} onOpenMenuClick={onEntryMenuClick} />
    {/each}
    {#each $everyFiles as file}
      {#if file.type === "file"}
        <File info={file.info} onclick={onEntryClick} onOpenMenuClick={onEntryMenuClick} />
      {:else}
        <UploadingFile status={file.info} />
      {/if}
    {/each}
  </div>
{:else}
  <div class="flex flex-grow items-center justify-center">
    <p class="text-gray-500">폴더가 비어 있어요.</p>
  </div>
{/if}
