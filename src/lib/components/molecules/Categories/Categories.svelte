<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import type { SubCategoryInfo } from "$lib/modules/filesystem2.svelte";
  import { SortBy, sortEntries } from "$lib/utils";
  import Category from "./Category.svelte";
  import type { SelectedCategory } from "./service";

  interface Props {
    categories: SubCategoryInfo[];
    categoryMenuIcon?: Component<SvelteHTMLElements["svg"]>;
    onCategoryClick: (category: SelectedCategory) => void;
    onCategoryMenuClick?: (category: SelectedCategory) => void;
    sortBy?: SortBy;
  }

  let { categories, categoryMenuIcon, onCategoryClick, onCategoryMenuClick }: Props = $props();

  let categoriesWithName = $derived(sortEntries(structuredClone($state.snapshot(categories))));
</script>

{#if categoriesWithName.length > 0}
  <div class="space-y-1">
    {#each categoriesWithName as category}
      <Category
        info={category}
        menuIcon={categoryMenuIcon}
        onclick={onCategoryClick}
        onMenuClick={onCategoryMenuClick}
      />
    {/each}
  </div>
{/if}
