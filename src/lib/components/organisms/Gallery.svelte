<script lang="ts">
  import { FileThumbnailButton, RowVirtualizer } from "$lib/components/atoms";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";
  import { formatDate, formatDateSortable, SortBy, sortEntries } from "$lib/utils";

  interface Props {
    files: SummarizedFileInfo[];
    onFileClick?: (file: SummarizedFileInfo) => void;
  }

  let { files, onFileClick }: Props = $props();

  type Row =
    | { type: "header"; label: string }
    | { type: "items"; files: SummarizedFileInfo[]; isLast: boolean };

  let rows = $derived.by(() => {
    const groups = Map.groupBy(
      files.filter(
        (file) => file.contentType.startsWith("image/") || file.contentType.startsWith("video/"),
      ),
      (file) => formatDateSortable(file.createdAt ?? file.lastModifiedAt),
    );
    return Array.from(groups.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .flatMap(([, entries]) => {
        const sortedEntries = [...entries];
        sortEntries(sortedEntries, SortBy.DATE_DESC);

        return [
          {
            type: "header",
            label: formatDate(sortedEntries[0]!.createdAt ?? sortedEntries[0]!.lastModifiedAt),
          },
          ...Array.from({ length: Math.ceil(sortedEntries.length / 4) }, (_, i) => {
            const start = i * 4;
            const end = start + 4;
            return {
              type: "items" as const,
              files: sortedEntries.slice(start, end),
              isLast: end >= sortedEntries.length,
            };
          }),
        ] satisfies Row[];
      });
  });
</script>

<RowVirtualizer
  count={rows.length}
  itemHeight={(index) =>
    rows[index]!.type === "header" ? 28 : 181 + (rows[index]!.isLast ? 16 : 4)}
  class="flex flex-grow flex-col"
>
  {#snippet item(index)}
    {@const row = rows[index]!}
    {#if row.type === "header"}
      <p class="pb-2 text-sm font-medium">{row.label}</p>
    {:else}
      <div class={["grid grid-cols-4 gap-x-1", row.isLast ? "pb-4" : "pb-1"]}>
        {#each row.files as file (file.id)}
          <FileThumbnailButton info={file} onclick={onFileClick} />
        {/each}
      </div>
    {/if}
  {/snippet}
  {#snippet placeholder()}
    <div class="flex h-full flex-grow items-center justify-center">
      <p class="text-gray-500">
        {#if files.length === 0}
          업로드된 파일이 없어요.
        {:else}
          사진 또는 동영상이 없어요.
        {/if}
      </p>
    </div>
  {/snippet}
</RowVirtualizer>
