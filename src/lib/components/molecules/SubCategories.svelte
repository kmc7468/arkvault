<script lang="ts">
  import type { Component } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";
  import { Categories, IconEntryButton, type SelectedCategory } from "$lib/components/molecules";
  import type { CategoryInfo } from "$lib/modules/filesystem";

  import IconAddCircle from "~icons/material-symbols/add-circle";

  interface Props {
    class?: ClassValue;
    info: CategoryInfo;
    onSubCategoryClick: (subCategory: SelectedCategory) => void;
    onSubCategoryCreateClick: () => void;
    onSubCategoryMenuClick?: (category: SelectedCategory) => void;
    subCategoryCreatePosition?: "top" | "bottom";
    subCategoryMenuIcon?: Component<SvelteHTMLElements["svg"]>;
  }

  let {
    class: className,
    info,
    onSubCategoryClick,
    onSubCategoryCreateClick,
    onSubCategoryMenuClick,
    subCategoryCreatePosition = "bottom",
    subCategoryMenuIcon,
  }: Props = $props();
</script>

<div class={["space-y-1", className]}>
  {#snippet subCategoryCreate()}
    <IconEntryButton
      icon={IconAddCircle}
      onclick={onSubCategoryCreateClick}
      class="h-12 w-full"
      iconClass="text-gray-600"
      textClass="text-gray-700"
    >
      카테고리 추가하기
    </IconEntryButton>
  {/snippet}

  {#if subCategoryCreatePosition === "top"}
    {@render subCategoryCreate()}
  {/if}
  <Categories
    categories={info.subCategories}
    categoryMenuIcon={subCategoryMenuIcon}
    onCategoryClick={onSubCategoryClick}
    onCategoryMenuClick={onSubCategoryMenuClick}
  />
  {#if subCategoryCreatePosition === "bottom"}
    {@render subCategoryCreate()}
  {/if}
</div>
