<script lang="ts">
  import { untrack } from "svelte";
  import { get, type Writable } from "svelte/store";
  import { FileThumbnailButton, RowVirtualizer } from "$lib/components/atoms";
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
    | { type: "header"; label: string }
    | { type: "items"; items: FileEntry[]; isLast: boolean };

  let filesWithDate: FileEntry[] = $state([]);
  let rows: Row[] = $state([]);

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
          label: formatDate(entries[0]!.date!),
        });

        for (let i = 0; i < entries.length; i += 4) {
          newRows.push({
            type: "items",
            items: entries.slice(i, i + 4),
            isLast: i + 4 >= entries.length,
          });
        }
      }

      rows = newRows;
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

<RowVirtualizer
  count={rows.length}
  itemHeight={(index) =>
    rows[index]!.type === "header"
      ? 28
      : Math.ceil(rows[index]!.items.length / 4) * 181 +
        (Math.ceil(rows[index]!.items.length / 4) - 1) * 4 +
        16}
  class="flex flex-grow flex-col"
>
  {#snippet item(index)}
    {@const row = rows[index]!}
    {#if row.type === "header"}
      <p class="pb-2 text-sm font-medium">{row.label}</p>
    {:else}
      <div class={["grid grid-cols-4 gap-x-1", row.isLast ? "pb-4" : "pb-1"]}>
        {#each row.items as { info }}
          <FileThumbnailButton {info} onclick={onFileClick} />
        {/each}
      </div>
    {/if}
  {/snippet}
  {#snippet placeholder()}
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
  {/snippet}
</RowVirtualizer>
