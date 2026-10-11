<script lang="ts">
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "#lib/components/atoms/index.js";
  import { SubCategories } from "#lib/components/molecules/index.js";
  import { useCategory, type LocalCategoryInfo } from "#lib/features/filesystem/index.js";

  interface Props {
    isOpen: boolean;
    mode: "include" | "exclude";
    onSelectCategoryClick: (category: LocalCategoryInfo) => void;
  }

  let { isOpen = $bindable(), mode, onSelectCategoryClick }: Props = $props();

  let categoryId: CategoryId = $state("root");
  const category = useCategory(() => categoryId);
  let categoryInfo = $derived(category.current);

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
