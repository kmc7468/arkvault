<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { FileThumbnailButton, FullscreenDiv, RowVirtualizer } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import {
    bulkGetFileInfo,
    type MaybeFileInfo,
    type SummarizedFileInfo,
  } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { formatDate, formatDateSortable, SortBy, sortEntries } from "$lib/utils";

  let { data } = $props();

  type Row =
    | { type: "header"; label: string }
    | { type: "items"; files: SummarizedFileInfo[]; isLast: boolean };

  let files: MaybeFileInfo[] = $state([]);
  let rows: Row[] = $derived.by(() => {
    const groups = Map.groupBy(
      files
        .filter((file) => file.exists)
        .filter(
          (file) => file.contentType.startsWith("image/") || file.contentType.startsWith("video/"),
        )
        .map((file) => ({ ...file, date: file.createdAt ?? file.lastModifiedAt })),
      (file) => formatDateSortable(file.date),
    );
    return Array.from(groups.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .flatMap(([, entries]) => {
        const sortedEntries = sortEntries([...entries], SortBy.DATE_DESC);
        return [
          {
            type: "header",
            label: formatDate(sortedEntries[0]!.date),
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
        ];
      });
  });

  onMount(async () => {
    files = Array.from((await bulkGetFileInfo(data.files, $masterKeyStore?.get(1)?.key!)).values());
  });
</script>

<svelte:head>
  <title>사진 및 동영상</title>
</svelte:head>

<TopBar title="사진 및 동영상" />
<FullscreenDiv>
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
            <FileThumbnailButton
              info={file}
              onclick={() => goto(`/file/${file.id}?from=gallery`)}
            />
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
</FullscreenDiv>
