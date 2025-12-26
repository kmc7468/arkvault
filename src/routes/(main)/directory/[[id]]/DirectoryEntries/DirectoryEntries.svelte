<script lang="ts">
  import { untrack } from "svelte";
  import { get, type Writable } from "svelte/store";
  import {
    getDirectoryInfo,
    getFileInfo,
    type DirectoryInfo,
    type FileInfo,
  } from "$lib/modules/filesystem";
  import {
    fileUploadStatusStore,
    isFileUploading,
    masterKeyStore,
    type FileUploadStatus,
  } from "$lib/stores";
  import { SortBy, sortEntries } from "$lib/utils";
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
    info: Writable<DirectoryInfo | null>;
  }

  type FileEntry =
    | {
        type: "file";
        name?: string;
        info: Writable<FileInfo | null>;
      }
    | {
        type: "uploading-file";
        name: string;
        info: Writable<FileUploadStatus>;
      };

  let subDirectories: DirectoryEntry[] = $state([]);
  let files: FileEntry[] = $state([]);

  $effect(() => {
    // TODO: Fix duplicated requests

    subDirectories = info.subDirectoryIds.map((id) => {
      const info = getDirectoryInfo(id, $masterKeyStore?.get(1)?.key!);
      return { name: get(info)?.name, info };
    });
    files = info.fileIds
      .map((id): FileEntry => {
        const info = getFileInfo(id, $masterKeyStore?.get(1)?.key!);
        return {
          type: "file",
          name: get(info)?.name,
          info,
        };
      })
      .concat(
        $fileUploadStatusStore
          .filter((statusStore) => {
            const { parentId, status } = get(statusStore);
            return parentId === info.id && isFileUploading(status);
          })
          .map((status) => ({
            type: "uploading-file",
            name: get(status).name,
            info: status,
          })),
      );

    const sort = () => {
      sortEntries(subDirectories, sortBy);
      sortEntries(files, sortBy);
    };
    return untrack(() => {
      sort();

      const unsubscribes = subDirectories
        .map((subDirectory) =>
          subDirectory.info.subscribe((value) => {
            if (subDirectory.name === value?.name) return;
            subDirectory.name = value?.name;
            sort();
          }),
        )
        .concat(
          files.map((file) =>
            file.info.subscribe((value) => {
              if (file.name === value?.name) return;
              file.name = value?.name;
              sort();
            }),
          ),
        );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    });
  });
</script>

{#if subDirectories.length + files.length > 0}
  <div class="space-y-1 pb-[4.5rem]">
    {#each subDirectories as { info }}
      <SubDirectory {info} onclick={onEntryClick} onOpenMenuClick={onEntryMenuClick} />
    {/each}
    {#each files as file}
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
