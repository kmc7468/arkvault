<script lang="ts">
  import { goto } from "$app/navigation";
  import { TopBar } from "$lib/components/molecules";
  import { Category, CategoryCreateModal } from "$lib/components/organisms";
  import { getCategoryInfo, type CategoryInfo } from "$lib/modules/filesystem2.svelte";
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

  let infoPromise: Promise<CategoryInfo> | undefined = $state();

  let isCategoryCreateModalOpen = $state(false);
  let isCategoryMenuBottomSheetOpen = $state(false);
  let isCategoryRenameModalOpen = $state(false);
  let isCategoryDeleteModalOpen = $state(false);

  $effect(() => {
    infoPromise = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!);
  });
</script>

<svelte:head>
  <title>카테고리</title>
</svelte:head>

{#await infoPromise then info}
  {#if info}
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
          infoPromise = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
        }}
        onSubCategoryClick={({ id }) => goto(`/category/${id}`)}
        onSubCategoryCreateClick={() => (isCategoryCreateModalOpen = true)}
        onSubCategoryMenuClick={(subCategory) => {
          context.selectedCategory = subCategory;
          isCategoryMenuBottomSheetOpen = true;
        }}
      />
    </div>

    <CategoryCreateModal
      bind:isOpen={isCategoryCreateModalOpen}
      onCreateClick={async (name: string) => {
        if (await requestCategoryCreation(name, data.id, $masterKeyStore?.get(1)!)) {
          infoPromise = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
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
          infoPromise = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
          return true;
        }
        return false;
      }}
    />
    <CategoryDeleteModal
      bind:isOpen={isCategoryDeleteModalOpen}
      onDeleteClick={async () => {
        if (await requestCategoryDeletion(context.selectedCategory!)) {
          infoPromise = getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
          return true;
        }
        return false;
      }}
    />
  {/if}
{/await}
