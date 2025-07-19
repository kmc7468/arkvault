<script lang="ts">
  import { derived } from "svelte/store";
  import { CheckBox } from "$lib/components/atoms";
  import { SubCategories, type SelectedCategory } from "$lib/components/molecules";
  import type { CategoryInfo } from "$lib/modules/filesystem";
  import { getFileInfo } from "$lib/modules/filesystem2";
  import { SortBy, sortEntries } from "$lib/modules/util";
  import { masterKeyStore } from "$lib/stores";
  import File from "./File.svelte";
  import type { SelectedFile } from "./service";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: CategoryInfo;
    onFileClick: (file: SelectedFile) => void;
    onFileRemoveClick: (file: SelectedFile) => void;
    onSubCategoryClick: (subCategory: SelectedCategory) => void;
    onSubCategoryCreateClick: () => void;
    onSubCategoryMenuClick: (subCategory: SelectedCategory) => void;
    sortBy?: SortBy;
    isFileRecursive: boolean;
  }

  let {
    info,
    onFileClick,
    onFileRemoveClick,
    onSubCategoryClick,
    onSubCategoryCreateClick,
    onSubCategoryMenuClick,
    sortBy = SortBy.NAME_ASC,
    isFileRecursive = $bindable(),
  }: Props = $props();

  let fileInfos = $derived(
    info.files
      ?.filter(({ isRecursive }) => isFileRecursive || !isRecursive)
      .map(({ id, isRecursive }) => ({
        info: getFileInfo(id, $masterKeyStore?.get(1)?.key!),
        isRecursive,
      })) ?? [],
  );
  let files = $derived(
    derived(
      fileInfos.map(({ info }) => info),
      (infos) => {
        const files = infos
          .map(($info, i) => {
            if ($info.status === "success") {
              return {
                name: $info.data.name,
                isRecursive: fileInfos[i]!.isRecursive,
                info: $info.data,
              };
            }
            return undefined;
          })
          .filter((info) => info !== undefined);
        sortEntries(files, sortBy);
        return files;
      },
    ),
  );
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
      <div class="space-y-1">
        {#key info}
          {#each $files as { info, isRecursive }}
            <File
              {info}
              onclick={onFileClick}
              onRemoveClick={!isRecursive ? onFileRemoveClick : undefined}
            />
          {:else}
            <p class="text-gray-500 text-center">이 카테고리에 추가된 파일이 없어요.</p>
          {/each}
        {/key}
      </div>
    </div>
  {/if}
</div>
