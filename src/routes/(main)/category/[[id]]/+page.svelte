<script lang="ts">
  import { goto } from "$app/navigation";
  import { tryAction } from "#lib/features/errors.js";
  import {
    FileEntry,
    SubCategories,
    CategoryCreateModal,
  } from "#lib/features/filesystem/components/index.js";
  import {
    createCategory,
    deleteCategory,
    removeFileFromCategory,
    renameCategory,
    setCategoryFileRecursive,
    useCategory,
    type LocalCategoryInfo,
  } from "#lib/features/filesystem/index.js";
  import { CheckBox, OverlayGroup, RowVirtualizer, TopBar } from "#lib/ui/index.js";
  import { sortEntries } from "#lib/utils/index.js";
  import CategoryDeleteModal from "./CategoryDeleteModal.svelte";
  import CategoryMenuBottomSheet from "./CategoryMenuBottomSheet.svelte";
  import CategoryRenameModal from "./CategoryRenameModal.svelte";
  import { createContext } from "./service.svelte";

  import IconClose from "~icons/material-symbols/close";
  import IconMoreVert from "~icons/material-symbols/more-vert";

  let { data } = $props();
  let context = createContext();

  const category = useCategory(() => data.id);
  let info = $derived(category.current);

  const overlays = new OverlayGroup<
    "categoryCreate" | "categoryMenu" | "categoryRename" | "categoryDelete"
  >();

  let files = $derived(
    sortEntries(
      info?.files
        ?.map((file) => ({ name: file.name, details: file }))
        .filter(({ details }) => info?.isFileRecursive || !details.isRecursive) ?? [],
    ),
  );
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
          onSubCategoryCreateClick={() => overlays.open("categoryCreate")}
          subCategoryCreatePosition="bottom"
          onSubCategoryMenuClick={(subCategory) => {
            context.selectedCategory = subCategory;
            overlays.open("categoryMenu");
          }}
          subCategoryMenuIcon={IconMoreVert}
        />
      </div>
      {#if info.id !== "root"}
        <div class="space-y-2 bg-white p-4">
          <div class="flex items-center justify-between">
            <p class="text-lg font-bold text-gray-800">파일</p>
            <CheckBox
              bind:checked={
                () => info.isFileRecursive,
                (value) => setCategoryFileRecursive(info as LocalCategoryInfo, value)
              }
            >
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
              <FileEntry
                info={details}
                onclick={() => goto(`/file/${details.id}?from=category`)}
                action={!details.isRecursive
                  ? {
                      icon: IconClose,
                      onclick: () =>
                        tryAction(
                          () => removeFileFromCategory(details.id, data.id as number),
                          "카테고리에서 파일을 제거하지 못했어요.",
                        ),
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
  bind:isOpen={overlays.getter("categoryCreate"), overlays.setter("categoryCreate")}
  onCreateClick={(name: string) =>
    tryAction(() => createCategory(data.id, name), "카테고리를 만들지 못했어요.")}
/>

<CategoryMenuBottomSheet
  bind:isOpen={overlays.getter("categoryMenu"), overlays.setter("categoryMenu")}
  onRenameClick={() => overlays.open("categoryRename")}
  onDeleteClick={() => overlays.open("categoryDelete")}
/>
<CategoryRenameModal
  bind:isOpen={overlays.getter("categoryRename"), overlays.setter("categoryRename")}
  onRenameClick={(newName: string) =>
    tryAction(
      () => renameCategory({ ...context.selectedCategory!, parentId: data.id }, newName),
      "이름을 바꾸지 못했어요.",
    )}
/>
<CategoryDeleteModal
  bind:isOpen={overlays.getter("categoryDelete"), overlays.setter("categoryDelete")}
  onDeleteClick={() =>
    tryAction(
      () => deleteCategory({ ...context.selectedCategory!, parentId: data.id }),
      "카테고리를 삭제하지 못했어요.",
    )}
/>
