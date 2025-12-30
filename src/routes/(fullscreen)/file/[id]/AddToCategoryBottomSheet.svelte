<script lang="ts">
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "$lib/components/atoms";
  import { SubCategories } from "$lib/components/molecules";
  import { CategoryCreateModal } from "$lib/components/organisms";
  import { getCategoryInfo, type CategoryInfo } from "$lib/modules/filesystem2.svelte";
  import { masterKeyStore } from "$lib/stores";
  import { requestCategoryCreation } from "./service";

  interface Props {
    onAddToCategoryClick: (categoryId: number) => void;
    isOpen: boolean;
  }

  let { onAddToCategoryClick, isOpen = $bindable() }: Props = $props();

  let categoryInfoPromise: Promise<CategoryInfo | null> | undefined = $state();

  let isCategoryCreateModalOpen = $state(false);

  $effect(() => {
    if (isOpen) {
      categoryInfoPromise = getCategoryInfo("root", $masterKeyStore?.get(1)?.key!);
    }
  });
</script>

{#await categoryInfoPromise then categoryInfo}
  {#if categoryInfo}
    <BottomSheet bind:isOpen class="flex flex-col">
      <FullscreenDiv>
        <SubCategories
          class="py-4"
          info={categoryInfo}
          onSubCategoryClick={({ id }) =>
            (categoryInfoPromise = getCategoryInfo(id, $masterKeyStore?.get(1)?.key!))}
          onSubCategoryCreateClick={() => (isCategoryCreateModalOpen = true)}
          subCategoryCreatePosition="top"
        />
        {#if categoryInfo.id !== "root"}
          <BottomDiv>
            <Button onclick={() => onAddToCategoryClick(categoryInfo.id)} class="w-full">
              이 카테고리에 추가하기
            </Button>
          </BottomDiv>
        {/if}
      </FullscreenDiv>
    </BottomSheet>

    <CategoryCreateModal
      bind:isOpen={isCategoryCreateModalOpen}
      onCreateClick={async (name: string) => {
        if (await requestCategoryCreation(name, categoryInfo.id, $masterKeyStore?.get(1)!)) {
          categoryInfoPromise = getCategoryInfo(categoryInfo.id, $masterKeyStore?.get(1)?.key!); // TODO: FIXME
          return true;
        }
        return false;
      }}
    />
  {/if}
{/await}
