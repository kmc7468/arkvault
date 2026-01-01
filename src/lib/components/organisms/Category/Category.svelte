<script lang="ts">
  import { CheckBox, RowVirtualizer } from "$lib/components/atoms";
  import { SubCategories, type SelectedCategory } from "$lib/components/molecules";
  import { updateCategoryInfo } from "$lib/indexedDB";
  import type { CategoryInfo } from "$lib/modules/filesystem";
  import { sortEntries } from "$lib/utils";
  import File from "./File.svelte";
  import type { SelectedFile } from "./service";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: CategoryInfo;
    isFileRecursive: boolean | undefined;
    onFileClick: (file: SelectedFile) => void;
    onFileRemoveClick: (file: SelectedFile) => void;
    onSubCategoryClick: (subCategory: SelectedCategory) => void;
    onSubCategoryCreateClick: () => void;
    onSubCategoryMenuClick: (subCategory: SelectedCategory) => void;
  }

  let {
    info,
    onFileClick,
    onFileRemoveClick,
    onSubCategoryClick,
    onSubCategoryCreateClick,
    onSubCategoryMenuClick,
    isFileRecursive = $bindable(),
  }: Props = $props();

  let lastCategoryId = $state<CategoryInfo["id"] | undefined>();
  let lastIsFileRecursive = $state<boolean | undefined>();

  let files = $derived(
    sortEntries(
      info.files
        ?.map((file) => ({ name: file.name, details: file }))
        .filter(({ details }) => isFileRecursive || !details.isRecursive) ?? [],
    ),
  );

  $effect(() => {
    if (info.id === "root" || isFileRecursive === undefined) return;
    if (lastCategoryId !== info.id) {
      lastCategoryId = info.id;
      lastIsFileRecursive = isFileRecursive;
      return;
    }
    if (lastIsFileRecursive === isFileRecursive) return;

    lastIsFileRecursive = isFileRecursive;
    void updateCategoryInfo(info.id, { isFileRecursive });
  });
</script>

<div class="space-y-4">
  <div class="space-y-4 bg-white p-4">
    {#if info.id !== "root"}
      <p class="text-lg font-bold text-gray-800">하위 카테고리</p>
    {/if}
    <SubCategories
      {info}
      {onSubCategoryClick}
      {onSubCategoryCreateClick}
      {onSubCategoryMenuClick}
      subCategoryMenuIcon={IconMoreVert}
    />
  </div>
  {#if info.id !== "root"}
    <div class="space-y-4 bg-white p-4">
      <div class="flex items-center justify-between">
        <p class="text-lg font-bold text-gray-800">파일</p>
        <CheckBox bind:checked={isFileRecursive}>
          <p class="font-medium">하위 카테고리의 파일</p>
        </CheckBox>
      </div>
      <RowVirtualizer count={files.length} itemHeight={() => 48} itemGap={4}>
        {#snippet item(index)}
          {@const { details } = files[index]!}
          <File
            info={details}
            onclick={onFileClick}
            onRemoveClick={!details.isRecursive ? onFileRemoveClick : undefined}
          />
        {/snippet}
        {#snippet placeholder()}
          <p class="text-center text-gray-500">이 카테고리에 추가된 파일이 없어요.</p>
        {/snippet}
      </RowVirtualizer>
    </div>
  {/if}
</div>
