<script lang="ts">
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "$lib/components/atoms";
  import { SubCategories } from "$lib/components/molecules";
  import {
    getCategoryInfo,
    type LocalCategoryInfo,
    type MaybeCategoryInfo,
  } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { HybridPromise } from "$lib/utils";

  interface Props {
    isOpen: boolean;
    mode: "include" | "exclude";
    onSelectCategoryClick: (category: LocalCategoryInfo) => void;
  }

  let { isOpen = $bindable(), mode, onSelectCategoryClick }: Props = $props();

  let categoryInfo: MaybeCategoryInfo | undefined = $state();

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
      />
      {#if categoryInfo.id !== "root"}
        <BottomDiv>
          <Button
            onclick={() => onSelectCategoryClick(categoryInfo as LocalCategoryInfo)}
            class="w-full"
          >
            {categoryInfo.name} 카테고리 {mode === "include" ? "꼭 포함하기" : "제외하기"}
          </Button>
        </BottomDiv>
      {/if}
    </FullscreenDiv>
  </BottomSheet>
{/if}
