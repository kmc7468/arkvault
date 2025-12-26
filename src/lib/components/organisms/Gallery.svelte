<script lang="ts">
  import { createWindowVirtualizer } from "@tanstack/svelte-virtual";
  import { untrack } from "svelte";
  import { get, type Writable } from "svelte/store";
  import { FileThumbnailButton } from "$lib/components/molecules";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { formatDate, formatDateSortable, SortBy, sortEntries } from "$lib/utils";

  interface Props {
    files: Writable<FileInfo | null>[];
    onFileClick?: (file: FileInfo) => void;
  }

  let { files, onFileClick }: Props = $props();

  type FileEntry =
    | { date?: undefined; contentType?: undefined; info: Writable<FileInfo | null> }
    | { date: Date; contentType: string; info: Writable<FileInfo | null> };
  type Row =
    | { type: "header"; key: string; label: string }
    | { type: "items"; key: string; items: FileEntry[] };

  let filesWithDate: FileEntry[] = $state([]);
  let rows: Row[] = $state([]);
  let listElement: HTMLDivElement | undefined = $state();

  const virtualizer = createWindowVirtualizer({
    count: 0,
    getItemKey: (index) => rows[index]!.key,
    estimateSize: () => 1000, // TODO
  });

  const measureRow = (node: HTMLElement) => {
    $virtualizer.measureElement(node);
    return {
      update: () => $virtualizer.measureElement(node),
    };
  };

  $effect(() => {
    filesWithDate = files.map((file) => {
      const info = get(file);
      if (info) {
        return {
          date: info.createdAt ?? info.lastModifiedAt,
          contentType: info.contentType,
          info: file,
        };
      } else {
        return { info: file };
      }
    });

    const buildRows = () => {
      const map = new Map<string, FileEntry[]>();

      for (const file of filesWithDate) {
        if (
          !file.date ||
          !(file.contentType.startsWith("image/") || file.contentType.startsWith("video/"))
        ) {
          continue;
        }

        const date = formatDateSortable(file.date);
        const entries = map.get(date) ?? [];
        entries.push(file);
        map.set(date, entries);
      }

      const newRows: Row[] = [];
      const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
      for (const date of sortedDates) {
        const entries = map.get(date)!;
        sortEntries(entries, SortBy.DATE_DESC);

        newRows.push({
          type: "header",
          key: `header-${date}`,
          label: formatDate(entries[0]!.date!),
        });
        newRows.push({
          type: "items",
          key: `items-${date}`,
          items: entries,
        });
      }

      rows = newRows;
      $virtualizer.setOptions({ count: rows.length });
    };
    return untrack(() => {
      buildRows();

      const unsubscribes = filesWithDate.map((file) =>
        file.info.subscribe((value) => {
          const newDate = value?.createdAt ?? value?.lastModifiedAt;
          const newContentType = value?.contentType;
          if (file.date?.getTime() === newDate?.getTime() && file.contentType === newContentType) {
            return;
          }

          file.date = newDate;
          file.contentType = newContentType;
          buildRows();
        }),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    });
  });
</script>

<div bind:this={listElement} class="relative flex flex-grow flex-col">
  <div style="height: {$virtualizer.getTotalSize()}px;">
    {#each $virtualizer.getVirtualItems() as virtualRow (virtualRow.key)}
      {@const row = rows[virtualRow.index]!}
      <div
        use:measureRow
        data-index={virtualRow.index}
        class="absolute left-0 top-0 w-full"
        style="transform: translateY({virtualRow.start}px);"
      >
        {#if row.type === "header"}
          <p class="pb-2 font-medium">{row.label}</p>
        {:else}
          <div class="grid grid-cols-4 gap-1 pb-4">
            {#each row.items as { info }}
              <FileThumbnailButton {info} onclick={onFileClick} />
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  {#if $virtualizer.getVirtualItems().length === 0}
    <div class="flex h-full flex-grow items-center justify-center">
      <p class="text-gray-500">
        {#if files.length === 0}
          업로드된 파일이 없어요.
        {:else if filesWithDate.length === 0}
          파일 목록을 불러오고 있어요.
        {:else}
          사진 또는 동영상이 없어요.
        {/if}
      </p>
    </div>
  {/if}
</div>
