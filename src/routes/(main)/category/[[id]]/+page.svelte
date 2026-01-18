<script lang="ts">
  import { goto } from "$app/navigation";
  import { CheckBox, RowVirtualizer } from "$lib/components/atoms";
  import { SubCategories, TopBar } from "$lib/components/molecules";
  import { CategoryCreateModal } from "$lib/components/organisms";
  import { updateCategoryInfo } from "$lib/indexedDB";
  import { getCategoryInfo, type MaybeCategoryInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { HybridPromise, sortEntries } from "$lib/utils";
  import CategoryDeleteModal from "./CategoryDeleteModal.svelte";
  import CategoryMenuBottomSheet from "./CategoryMenuBottomSheet.svelte";
  import CategoryRenameModal from "./CategoryRenameModal.svelte";
  import File from "./File.svelte";
  import {
    createContext,
    requestCategoryCreation,
    requestFileRemovalFromCategory,
    requestCategoryRename,
    requestCategoryDeletion,
  } from "./service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  let { data } = $props();
  let context = createContext();

  let info: MaybeCategoryInfo | undefined = $state();

  let isCategoryCreateModalOpen = $state(false);
  let isCategoryMenuBottomSheetOpen = $state(false);
  let isCategoryRenameModalOpen = $state(false);
  let isCategoryDeleteModalOpen = $state(false);

  let lastCategoryId: CategoryId | undefined = $state();
  let lastIsFileRecursive: boolean | undefined = $state();

  let files = $derived(
    sortEntries(
      info?.files
        ?.map((file) => ({ name: file.name, details: file }))
        .filter(({ details }) => info?.isFileRecursive || !details.isRecursive) ?? [],
    ),
  );

  $effect(() => {
    if (!info || info.id === "root" || info.isFileRecursive === undefined) return;
    if (lastCategoryId !== info.id) {
      lastCategoryId = info.id;
      lastIsFileRecursive = info.isFileRecursive;
      return;
    }
    if (lastIsFileRecursive === info.isFileRecursive) return;

    lastIsFileRecursive = info.isFileRecursive;
    void updateCategoryInfo(info.id, { isFileRecursive: info.isFileRecursive });
  });

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

{#if info?.id !== "root"}
  <TopBar title={info?.name} />
{/if}
<div class="min-h-full bg-gray-100 pb-[5.5em]">
  {#if info?.exists}
    <div class="space-y-4">
      <div class="space-y-2 bg-white p-4">
        {#if info.id !== "root"}
          <p class="text-lg font-bold text-gray-800">하위 카테고리</p>
        {/if}
        <SubCategories
          {info}
          onSubCategoryClick={({ id }) => goto(`/category/${id}`)}
          onSubCategoryCreateClick={() => (isCategoryCreateModalOpen = true)}
          subCategoryCreatePosition="bottom"
          onSubCategoryMenuClick={(subCategory) => {
            context.selectedCategory = subCategory;
            isCategoryMenuBottomSheetOpen = true;
          }}
          subCategoryMenuIcon={IconMoreVert}
        />
      </div>
      {#if info.id !== "root"}
        <div class="space-y-2 bg-white p-4">
          <div class="flex items-center justify-between">
            <p class="text-lg font-bold text-gray-800">파일</p>
            <CheckBox bind:checked={info.isFileRecursive}>
              <p class="font-medium">하위 카테고리의 파일</p>
            </CheckBox>
          </div>
          <RowVirtualizer
            count={files.length}
            getItemKey={(index) => files[index]!.details.id}
            estimateItemHeight={() => 48}
            itemGap={4}
          >
            {#snippet item(index)}
              {@const { details } = files[index]!}
              <File
                info={details}
                onclick={({ id }) => goto(`/file/${id}?from=category`)}
                onRemoveClick={!details.isRecursive
                  ? async ({ id }) => {
                      await requestFileRemovalFromCategory(id, data.id as number);
                      void getCategoryInfo(data.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
                    }
                  : undefined}
              />
            {/snippet}
            {#snippet placeholder()}
              <p class="text-center text-gray-500">이 카테고리에 추가된 파일이 없어요.</p>
            {/snippet}
          </RowVirtualizer>
        </div>
      {/if}
    </div>
  {/if}
</div>

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
