<script lang="ts">
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "$lib/components/atoms";
  import { SubCategories } from "$lib/components/molecules";
  import { CategoryCreateModal } from "$lib/components/organisms";
  import { getCategoryInfo, type MaybeCategoryInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { HybridPromise } from "$lib/utils";
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
      HybridPromise.resolve(getCategoryInfo("root", $masterKeyStore?.get(1)?.key!)).then(
        (result) => (categoryInfo = result),
      );
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
          HybridPromise.resolve(getCategoryInfo(id, $masterKeyStore?.get(1)?.key!)).then(
            (result) => (categoryInfo = result),
          )}
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
    if (await requestCategoryCreation(name, categoryInfo!.id, $masterKeyStore?.get(1)!)) {
      void getCategoryInfo(categoryInfo!.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
      return true;
    }
    return false;
  }}
/>
