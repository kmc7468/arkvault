<script lang="ts">
  import { ActionEntryButton, RowVirtualizer } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import { getUploadingFiles, type LiveFileUploadState } from "$lib/modules/file";
  import type { DirectoryInfo } from "$lib/modules/filesystem";
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

  type Entry =
    | { type: "parent" }
    | { type: "directory"; name: string; details: (typeof info.subDirectories)[number] }
    | { type: "file"; name: string; details: (typeof info.files)[number] }
    | { type: "uploading-file"; name: string; details: LiveFileUploadState };

  const toEntry =
    <T extends Exclude<Entry["type"], "parent">>(type: T) =>
    (details: Extract<Entry, { type: T }>["details"]) => ({ type, name: details.name, details });

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
    class="pb-[4.5rem]"
  >
    {#snippet item(index)}
      {@const entry = entries[index]!}
      {#if entry.type === "parent"}
        <ActionEntryButton class="h-14" onclick={onParentClick}>
          <DirectoryEntryLabel type="parent-directory" name=".." />
        </ActionEntryButton>
      {:else if entry.type === "directory"}
        <SubDirectory
          info={entry.details}
          onclick={onEntryClick}
          onOpenMenuClick={onEntryMenuClick}
        />
      {:else if entry.type === "file"}
        <File info={entry.details} onclick={onEntryClick} onOpenMenuClick={onEntryMenuClick} />
      {:else}
        <UploadingFile state={entry.details} />
      {/if}
    {/snippet}
  </RowVirtualizer>
{:else}
  <div class="flex flex-grow items-center justify-center">
    <p class="text-gray-500">폴더가 비어 있어요.</p>
  </div>
{/if}
