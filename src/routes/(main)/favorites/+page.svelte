<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { RowVirtualizer } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { masterKeyStore } from "$lib/stores";
  import Directory from "./Directory.svelte";
  import File from "./File.svelte";
  import { requestFavoriteEntries, requestRemoveFavorite, type FavoriteEntry } from "./service";

  import IconSearch from "~icons/material-symbols/search";

  let { data } = $props();

  let entries: FavoriteEntry[] = $state([]);
  let isLoading = $state(true);

  onMount(async () => {
    const masterKey = $masterKeyStore?.get(1)?.key;
    if (masterKey) {
      entries = await requestFavoriteEntries(data.favorites, masterKey);
    }
    isLoading = false;
  });

  const handleRemove = async (entry: FavoriteEntry) => {
    if (await requestRemoveFavorite(entry.type, entry.details.id)) {
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
      class="w-full rounded-full p-1 text-2xl active:bg-black active:bg-opacity-[0.04]"
    >
      <IconSearch />
    </button>
  </TopBar>
  <div class="flex flex-grow flex-col px-4 pb-4">
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
      <div class="flex flex-grow items-center justify-center">
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
