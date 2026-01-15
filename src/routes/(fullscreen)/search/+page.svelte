<script lang="ts">
  import { slide } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { Chip, FullscreenDiv, RowVirtualizer } from "$lib/components/atoms";
  import {
    getDirectoryInfo,
    type LocalCategoryInfo,
    type MaybeDirectoryInfo,
  } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { HybridPromise, sortEntries } from "$lib/utils";
  import Directory from "./Directory.svelte";
  import File from "./File.svelte";
  import SearchBar from "./SearchBar.svelte";
  import SelectCategoryBottomSheet from "./SelectCategoryBottomSheet.svelte";
  import { requestSearch, type SearchFilter, type SearchResult } from "./service";

  let { data } = $props();

  let directoryInfo: MaybeDirectoryInfo | undefined = $state();

  let filters = $state({
    name: "",
    includeImages: false,
    includeVideos: false,
    includeDirectories: false,
    searchInDirectory: false,
    categories: [] as SearchFilter["categories"],
  });
  let hasCategoryFilter = $derived(filters.categories.length > 0);
  let hasAnyFilter = $derived(
    hasCategoryFilter ||
      filters.includeImages ||
      filters.includeVideos ||
      filters.includeDirectories ||
      filters.name.trim().length > 0,
  );

  let serverResult: SearchResult | undefined = $state();
  let result = $derived.by(() => {
    if (!serverResult) return [];

    const nameFilter = filters.name.trim().toLowerCase();
    const hasTypeFilter =
      filters.includeImages || filters.includeVideos || filters.includeDirectories;

    const directories =
      !hasTypeFilter || filters.includeDirectories ? serverResult.directories : [];
    const files =
      !hasTypeFilter || filters.includeImages || filters.includeVideos
        ? serverResult.files.filter(
            ({ contentType }) =>
              !hasTypeFilter ||
              (filters.includeImages && contentType.startsWith("image/")) ||
              (filters.includeVideos && contentType.startsWith("video/")),
          )
        : [];

    return sortEntries(
      [...directories, ...files].filter(
        ({ name }) => !nameFilter || name.toLowerCase().includes(nameFilter),
      ),
    );
  });

  let isSelectCategoryBottomSheetOpen = $state(false);
  let categorySelectMode: "include" | "exclude" = $state("include");

  const openSelectCategoryBottomSheet = (mode: "include" | "exclude") => {
    categorySelectMode = mode;
    isSelectCategoryBottomSheetOpen = true;
  };

  const addCategoryFilter = (category: LocalCategoryInfo) => {
    if (!filters.categories.some(({ info }) => info.id === category.id)) {
      filters.categories.push({
        info: category,
        type: categorySelectMode,
      });
      isSelectCategoryBottomSheetOpen = false;
    }
  };

  $effect(() => {
    if (data.directoryId) {
      HybridPromise.resolve(getDirectoryInfo(data.directoryId, $masterKeyStore?.get(1)?.key!)).then(
        (res) => {
          directoryInfo = res;
          filters.searchInDirectory = res.exists;
        },
      );
    } else {
      directoryInfo = undefined;
      filters.searchInDirectory = false;
    }
  });

  $effect(() => {
    if (hasAnyFilter) {
      requestSearch(
        {
          ancestorId: filters.searchInDirectory ? data.directoryId! : "root",
          categories: filters.categories,
        },
        $masterKeyStore?.get(1)?.key!,
      ).then((res) => {
        serverResult = res;
      });
    }
  });
</script>

<svelte:head>
  <title>검색</title>
</svelte:head>

<SearchBar bind:value={filters.name} />
<FullscreenDiv class="bg-gray-100 !px-0">
  <div class="flex flex-grow flex-col space-y-4">
    <div class="space-y-2 bg-white p-4 !pt-0">
      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <Chip bind:selected={filters.includeImages}>사진</Chip>
          <Chip bind:selected={filters.includeVideos}>동영상</Chip>
          {#if !hasCategoryFilter}
            <Chip bind:selected={filters.includeDirectories}>폴더</Chip>
          {/if}
          {#if directoryInfo?.exists}
            <Chip bind:selected={filters.searchInDirectory}>
              위치: {directoryInfo.name}
            </Chip>
          {/if}
        </div>
        {#if !filters.includeDirectories}
          <div class="space-y-2" transition:slide={{ duration: 300 }}>
            <p class="text-sm font-medium text-gray-600">카테고리</p>
            <div class="flex flex-wrap gap-2">
              {#each filters.categories as { info, type }, i (info.id)}
                <Chip
                  selected
                  removable
                  onclick={() => {}}
                  onRemoveClick={() => filters.categories.splice(i, 1)}
                >
                  {#if type === "include"}
                    포함:
                  {:else}
                    제외:
                  {/if}
                  {info.name}
                </Chip>
              {/each}
              <Chip onclick={() => openSelectCategoryBottomSheet("include")}>+ 포함</Chip>
              <Chip onclick={() => openSelectCategoryBottomSheet("exclude")}>- 제외</Chip>
            </div>
          </div>
        {/if}
      </div>
    </div>
    {#if hasAnyFilter}
      <div class="flex flex-grow flex-col space-y-2 bg-white p-4">
        <p class="text-lg font-bold text-gray-800">검색 결과</p>
        {#if result.length > 0}
          <RowVirtualizer
            count={result.length}
            getItemKey={(index) => `${result[index]!.type}-${result[index]!.id}`}
            estimateItemHeight={() => 56}
            itemGap={4}
          >
            {#snippet item(index)}
              {@const info = result[index]!}
              {#if info.type === "directory"}
                <Directory {info} onclick={() => goto(`/directory/${info.id}?from=search`)} />
              {:else}
                <File {info} onclick={() => goto(`/file/${info.id}?from=search`)} />
              {/if}
            {/snippet}
          </RowVirtualizer>
        {:else}
          <div class="flex flex-grow items-center justify-center py-8">
            <p class="text-gray-500">검색 결과가 없어요.</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</FullscreenDiv>

<SelectCategoryBottomSheet
  bind:isOpen={isSelectCategoryBottomSheetOpen}
  mode={categorySelectMode}
  onSelectCategoryClick={addCategoryFilter}
/>
