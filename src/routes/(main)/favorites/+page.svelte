<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { RowVirtualizer } from "#lib/components/atoms/index.js";
  import { TopBar } from "#lib/components/molecules/index.js";
  import Directory from "./Directory.svelte";
  import File from "./File.svelte";
  import { showErrorToast, tryAction } from "#lib/client/toast.svelte.js";
  import {
    getFavoriteEntries,
    removeFavorite,
    type FavoriteEntry,
  } from "#lib/features/favorites/index.js";

  import IconSearch from "~icons/material-symbols/search";

  let entries: FavoriteEntry[] = $state([]);
  let isLoading = $state(true);

  onMount(async () => {
    try {
      entries = await getFavoriteEntries();
    } catch (e) {
      showErrorToast(e, "즐겨찾기를 불러오지 못했어요.");
    } finally {
      isLoading = false;
    }
  });

  const handleRemove = async (entry: FavoriteEntry) => {
    if (await tryAction(() => removeFavorite(entry), "즐겨찾기를 해제하지 못했어요.")) {
      entries = entries.filter(
        (e) => !(e.type === entry.type && e.details.id === entry.details.id),
      );
    }
  };

  const handleClick = (entry: FavoriteEntry) => {
    goto(
      entry.type === "file"
        ? `/file/${entry.details.id}?from=favorite`
        : `/directory/${entry.details.id}?from=favorite`,
    );
  };
</script>

<svelte:head>
  <title>즐겨찾기</title>
</svelte:head>

<div class="flex h-full flex-col">
  <TopBar title="즐겨찾기" showBackButton={false}>
    <button
      onclick={() => goto("/search?from=favorites")}
      class="w-full rounded-full p-1 text-2xl active:bg-black/4"
    >
      <IconSearch />
    </button>
  </TopBar>
  <div class="flex grow flex-col px-4 pb-4">
    {#if entries.length > 0}
      <RowVirtualizer
        count={entries.length}
        getItemKey={(index) => `${entries[index]!.type}-${entries[index]!.details.id}`}
        estimateItemHeight={() => 56}
        itemGap={4}
      >
        {#snippet item(index)}
          {@const entry = entries[index]!}
          {#if entry.type === "directory"}
            <Directory
              info={entry.details}
              onclick={() => handleClick(entry)}
              onRemoveClick={() => handleRemove(entry)}
            />
          {:else}
            <File
              info={entry.details}
              onclick={() => handleClick(entry)}
              onRemoveClick={() => handleRemove(entry)}
            />
          {/if}
        {/snippet}
      </RowVirtualizer>
    {:else}
      <div class="flex grow items-center justify-center">
        <p class="text-gray-500">
          {#if isLoading}
            즐겨찾기 목록을 불러오고 있어요.
          {:else}
            즐겨찾기한 항목이 없어요.
          {/if}
        </p>
      </div>
    {/if}
  </div>
</div>
