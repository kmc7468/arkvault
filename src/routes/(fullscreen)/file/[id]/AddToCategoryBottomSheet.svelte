<script lang="ts">
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "#lib/components/atoms/index.js";
  import { SubCategories } from "#lib/components/molecules/index.js";
  import { CategoryCreateModal } from "#lib/components/organisms/index.js";
  import { getCategoryInfo, type MaybeCategoryInfo } from "#lib/modules/filesystem/index.js";
  import { HybridPromise } from "#lib/utils/index.js";
  import { requestCategoryCreation } from "./service";

  interface Props {
    onAddToCategoryClick: (categoryId: number) => void;
    isOpen: boolean;
  }

  let { onAddToCategoryClick, isOpen = $bindable() }: Props = $props();

  let categoryInfo: MaybeCategoryInfo | undefined = $state();

  let isCategoryCreateModalOpen = $state(false);

  $effect(() => {
    if (isOpen) {
      HybridPromise.resolve(getCategoryInfo("root")).then((result) => (categoryInfo = result));
    }
  });
</script>

{#if categoryInfo?.exists}
  <BottomSheet bind:isOpen class="flex flex-col">
    <FullscreenDiv>
      <SubCategories
        class="py-4"
        info={categoryInfo}
        onSubCategoryClick={({ id }) =>
          HybridPromise.resolve(getCategoryInfo(id)).then((result) => (categoryInfo = result))}
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
  onCreateClick={async (name: string) => {
    if (await requestCategoryCreation(name, categoryInfo!.id)) {
      void getCategoryInfo(categoryInfo!.id); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
