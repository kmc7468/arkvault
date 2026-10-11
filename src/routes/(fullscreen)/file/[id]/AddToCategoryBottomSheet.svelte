<script lang="ts">
  import { tryAction } from "#lib/features/errors.js";
  import { SubCategories, CategoryCreateModal } from "#lib/features/filesystem/components/index.js";
  import { createCategory, useCategory } from "#lib/features/filesystem/index.js";
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "#lib/ui/index.js";

  interface Props {
    onAddToCategoryClick: (categoryId: number) => void;
    isOpen: boolean;
  }

  let { onAddToCategoryClick, isOpen = $bindable() }: Props = $props();

  let categoryId: CategoryId = $state("root");
  const category = useCategory(() => categoryId);
  let categoryInfo = $derived(category.current);

  let isCategoryCreateModalOpen = $state(false);

  $effect.pre(() => {
    if (isOpen) {
      categoryId = "root";
    }
  });
</script>

{#if categoryInfo?.exists}
  <BottomSheet bind:isOpen class="flex flex-col">
    <FullscreenDiv>
      <SubCategories
        class="py-4"
        info={categoryInfo}
        onSubCategoryClick={({ id }) => (categoryId = id)}
        onSubCategoryCreateClick={() => (isCategoryCreateModalOpen = true)}
        subCategoryCreatePosition="top"
      />
      {#if categoryInfo.id !== "root"}
        <BottomDiv>
          <Button onclick={() => onAddToCategoryClick(categoryInfo!.id as number)} class="w-full">
            {categoryInfo!.name} 카테고리에 추가하기
          </Button>
        </BottomDiv>
      {/if}
    </FullscreenDiv>
  </BottomSheet>
{/if}

<CategoryCreateModal
  bind:isOpen={isCategoryCreateModalOpen}
  onCreateClick={(name: string) =>
    tryAction(() => createCategory(categoryId, name), "카테고리를 만들지 못했어요.")}
/>
