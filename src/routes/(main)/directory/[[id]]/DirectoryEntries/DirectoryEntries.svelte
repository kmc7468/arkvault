<script lang="ts">
  import { getUploadingFiles, type LiveFileUploadState } from "#lib/client/transfer/index.js";
  import { DirectoryEntry, FileEntry } from "#lib/features/filesystem/components/index.js";
  import type {
    DirectoryInfo,
    SubDirectoryInfo,
    SummarizedFileInfo,
  } from "#lib/features/filesystem/index.js";
  import { ActionEntryButton, RowVirtualizer, DirectoryEntryLabel } from "#lib/ui/index.js";
  import { sortEntries } from "#lib/utils/index.js";
  import UploadingFile from "./UploadingFile.svelte";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

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

  type Entry =
    | { type: "parent" }
    | { type: "directory"; name: string; details: (typeof info.subDirectories)[number] }
    | { type: "file"; name: string; details: (typeof info.files)[number] }
    | { type: "uploading-file"; name: string; details: LiveFileUploadState };

  const toEntry =
    <T extends Exclude<Entry["type"], "parent">>(type: T) =>
    (details: Extract<Entry, { type: T }>["details"]) => ({ type, name: details.name, details });

  const toSelectedEntry = (
    type: SelectedEntry["type"],
    { id, parentId, dataKey, name, isFavorite }: SubDirectoryInfo | SummarizedFileInfo,
  ): SelectedEntry => ({ type, id, parentId, dataKey, name, isFavorite });

  let entries = $derived([
    ...(showParentEntry ? ([{ type: "parent" }] as const) : []),
    ...sortEntries(info.subDirectories.map(toEntry("directory"))),
    ...sortEntries([
      ...info.files.map(toEntry("file")),
      ...(getUploadingFiles(info.id) as LiveFileUploadState[]).map(toEntry("uploading-file")),
    ]),
  ]);
</script>

{#if entries.length > 0}
  <RowVirtualizer
    count={entries.length}
    getItemKey={(index) =>
      entries[index]!.type !== "parent"
        ? `${entries[index]!.type}-${entries[index]!.details.id}`
        : entries[index]!.type!}
    estimateItemHeight={() => 56}
    itemGap={4}
    class="pb-18"
  >
    {#snippet item(index)}
      {@const entry = entries[index]!}
      {#if entry.type === "parent"}
        <ActionEntryButton class="h-14" onclick={onParentClick}>
          <DirectoryEntryLabel type="parent-directory" name=".." />
        </ActionEntryButton>
      {:else if entry.type === "directory"}
        {@const selected = toSelectedEntry("directory", entry.details)}
        <DirectoryEntry
          info={entry.details}
          onclick={() => onEntryClick(selected)}
          action={{ icon: IconMoreVert, onclick: () => onEntryMenuClick(selected) }}
        />
      {:else if entry.type === "file"}
        {@const selected = toSelectedEntry("file", entry.details)}
        <FileEntry
          info={entry.details}
          onclick={() => onEntryClick(selected)}
          action={{ icon: IconMoreVert, onclick: () => onEntryMenuClick(selected) }}
        />
      {:else}
        <UploadingFile state={entry.details} />
      {/if}
    {/snippet}
  </RowVirtualizer>
{:else}
  <div class="flex grow items-center justify-center">
    <p class="text-gray-500">폴더가 비어 있어요.</p>
  </div>
{/if}
