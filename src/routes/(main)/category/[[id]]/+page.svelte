<script lang="ts">
  import { goto } from "$app/navigation";
  import { TopBar } from "$lib/components/molecules";
  import { Category, CategoryCreateModal } from "$lib/components/organisms";
  import { getCategoryInfo, type MaybeCategoryInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { HybridPromise } from "$lib/utils";
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

  let info: MaybeCategoryInfo | undefined = $state();

  let isCategoryCreateModalOpen = $state(false);
  let isCategoryMenuBottomSheetOpen = $state(false);
  let isCategoryRenameModalOpen = $state(false);
  let isCategoryDeleteModalOpen = $state(false);

  $effect(() => {
    HybridPromise.resolve(getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!)).then(
      (result) => {
        if (data.id === result.id) {
          info = result;
        }
      },
    );
  });
</script>

<svelte:head>
  <title>카테고리</title>
</svelte:head>

{#if info?.exists}
  {#if info.id !== "root"}
    <TopBar title={info.name} />
  {/if}
  <div class="min-h-full bg-gray-100 pb-[5.5em]">
    <Category
      bind:isFileRecursive={info.isFileRecursive}
      {info}
      onFileClick={({ id }) => goto(`/file/${id}?from=category`)}
      onFileRemoveClick={async ({ id }) => {
        await requestFileRemovalFromCategory(id, data.id as number);
        void getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      }}
      onSubCategoryClick={({ id }) => goto(`/category/${id}`)}
      onSubCategoryCreateClick={() => (isCategoryCreateModalOpen = true)}
      onSubCategoryMenuClick={(subCategory) => {
        context.selectedCategory = subCategory;
        isCategoryMenuBottomSheetOpen = true;
      }}
    />
  </div>
{/if}

<CategoryCreateModal
  bind:isOpen={isCategoryCreateModalOpen}
  onCreateClick={async (name: string) => {
    if (await requestCategoryCreation(name, data.id, $masterKeyStore?.get(1)!)) {
      void getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
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
      void getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
<CategoryDeleteModal
  bind:isOpen={isCategoryDeleteModalOpen}
  onDeleteClick={async () => {
    if (await requestCategoryDeletion(context.selectedCategory!)) {
      void getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
