<script lang="ts">
  import type { Writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { TopBar } from "$lib/components/molecules";
  import { Category, CategoryCreateModal } from "$lib/components/organisms";
  import { getCategoryInfo, updateCategoryInfo, type CategoryInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import CategoryDeleteModal from "./CategoryDeleteModal.svelte";
  import CategoryMenuBottomSheet from "./CategoryMenuBottomSheet.svelte";
  import CategoryRenameModal from "./CategoryRenameModal.svelte";
  import {
    createContext,
    requestCategoryCreation,
    requestFileRemovalFromCategory,
    requestCategoryRename,
    requestCategoryDeletion,
  } from "./service.svelte";

  let { data } = $props();
  let context = createContext();

  let info: Writable<CategoryInfo | null> | undefined = $state();

  let isFileRecursive: boolean | undefined = $state();

  let isCategoryCreateModalOpen = $state(false);
  let isCategoryMenuBottomSheetOpen = $state(false);
  let isCategoryRenameModalOpen = $state(false);
  let isCategoryDeleteModalOpen = $state(false);

  $effect(() => {
    info = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!);
    isFileRecursive = undefined;
  });

  $effect(() => {
    if ($info && isFileRecursive === undefined) {
      isFileRecursive = $info.isFileRecursive ?? false;
    }
  });

  $effect(() => {
    if (data.id !== "root" && $info?.isFileRecursive !== isFileRecursive) {
      updateCategoryInfo(data.id as number, { isFileRecursive });
    }
  });
</script>

<svelte:head>
  <title>카테고리</title>
</svelte:head>

{#if data.id !== "root"}
  <TopBar title={$info?.name} />
{/if}
<div class="min-h-full bg-gray-100 pb-[5.5em]">
  {#if $info && isFileRecursive !== undefined}
    <Category
      bind:isFileRecursive
      info={$info}
      onFileClick={({ id }) => goto(`/file/${id}`)}
      onFileRemoveClick={async ({ id }) => {
        await requestFileRemovalFromCategory(id, data.id as number);
        info = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      }}
      onSubCategoryClick={({ id }) => goto(`/category/${id}`)}
      onSubCategoryCreateClick={() => (isCategoryCreateModalOpen = true)}
      onSubCategoryMenuClick={(subCategory) => {
        context.selectedCategory = subCategory;
        isCategoryMenuBottomSheetOpen = true;
      }}
    />
  {/if}
</div>

<CategoryCreateModal
  bind:isOpen={isCategoryCreateModalOpen}
  onCreateClick={async (name: string) => {
    if (await requestCategoryCreation(name, data.id, $masterKeyStore?.get(1)!)) {
      info = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>

<CategoryMenuBottomSheet
  bind:isOpen={isCategoryMenuBottomSheetOpen}
  onRenameClick={() => {
    isCategoryMenuBottomSheetOpen = false;
    isCategoryRenameModalOpen = true;
  }}
  onDeleteClick={() => {
    isCategoryMenuBottomSheetOpen = false;
    isCategoryDeleteModalOpen = true;
  }}
/>
<CategoryRenameModal
  bind:isOpen={isCategoryRenameModalOpen}
  onRenameClick={async (newName: string) => {
    if (await requestCategoryRename(context.selectedCategory!, newName)) {
      info = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
<CategoryDeleteModal
  bind:isOpen={isCategoryDeleteModalOpen}
  onDeleteClick={async () => {
    if (await requestCategoryDeletion(context.selectedCategory!)) {
      info = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
