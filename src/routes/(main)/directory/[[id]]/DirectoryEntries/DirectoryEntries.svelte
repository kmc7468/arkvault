<script lang="ts">
  import { ActionEntryButton, RowVirtualizer } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import { getUploadingFiles, type LiveFileUploadState } from "$lib/modules/file";
  import type { DirectoryInfo } from "$lib/modules/filesystem2.svelte";
  import { sortEntries } from "$lib/utils";
  import File from "./File.svelte";
  import SubDirectory from "./SubDirectory.svelte";
  import UploadingFile from "./UploadingFile.svelte";
  import type { SelectedEntry } from "../service.svelte";

  interface Props {
    info: DirectoryInfo;
    onEntryClick: (entry: SelectedEntry) => void;
    onEntryMenuClick: (entry: SelectedEntry) => void;
    onParentClick?: () => void;
    showParentEntry?: boolean;
  }

  let {
    info,
    onEntryClick,
    onEntryMenuClick,
    onParentClick,
    showParentEntry = false,
  }: Props = $props();

  type FileEntry =
    | { type: "file"; name: string; details: (typeof info.files)[number] }
    | { type: "uploading-file"; name: string; details: LiveFileUploadState };

  const toFileEntry =
    <T extends FileEntry["type"]>(type: T) =>
    (details: Extract<FileEntry, { type: T }>["details"]) => ({
      type,
      name: details.name,
      details,
    });

  const subDirectories = $derived(
    sortEntries(structuredClone($state.snapshot(info.subDirectories))),
  );
  const files = $derived(
    sortEntries<FileEntry>([
      ...info.files.map(toFileEntry("file")),
      ...getUploadingFiles(info.id).map(toFileEntry("uploading-file")),
    ]),
  );
</script>

{#if subDirectories.length + files.length > 0 || showParentEntry}
  <div class="space-y-1 pb-[4.5rem]">
    {#if showParentEntry}
      <ActionEntryButton class="h-14" onclick={onParentClick}>
        <DirectoryEntryLabel type="parent-directory" name=".." />
      </ActionEntryButton>
    {/if}
    {#each subDirectories as subDirectory}
      <SubDirectory info={subDirectory} onclick={onEntryClick} onOpenMenuClick={onEntryMenuClick} />
    {/each}
    {#if files.length > 0}
      <RowVirtualizer
        count={files.length}
        itemHeight={(index) => 56 + (index + 1 < files.length ? 4 : 0)}
      >
        {#snippet item(index)}
          {@const file = files[index]!}
          <div class={index + 1 < files.length ? "pb-1" : ""}>
            {#if file.type === "file"}
              <File info={file.details} onclick={onEntryClick} onOpenMenuClick={onEntryMenuClick} />
            {:else}
              <UploadingFile state={file.details} />
            {/if}
          </div>
        {/snippet}
      </RowVirtualizer>
    {/if}
  </div>
{:else}
  <div class="flex flex-grow items-center justify-center">
    <p class="text-gray-500">폴더가 비어 있어요.</p>
  </div>
{/if}
