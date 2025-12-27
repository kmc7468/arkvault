<script lang="ts">
  import { untrack, type Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { get, type Writable } from "svelte/store";
  import type { CategoryInfo } from "$lib/modules/filesystem";
  import { SortBy, sortEntries } from "$lib/utils";
  import Category from "./Category.svelte";
  import type { SelectedCategory } from "./service";

  interface Props {
    categories: Writable<CategoryInfo | null>[];
    categoryMenuIcon?: Component<SvelteHTMLElements["svg"]>;
    onCategoryClick: (category: SelectedCategory) => void;
    onCategoryMenuClick?: (category: SelectedCategory) => void;
    sortBy?: SortBy;
  }

  let {
    categories,
    categoryMenuIcon,
    onCategoryClick,
    onCategoryMenuClick,
    sortBy = SortBy.NAME_ASC,
  }: Props = $props();

  let categoriesWithName: { name?: string; info: Writable<CategoryInfo | null> }[] = $state([]);

  $effect(() => {
    categoriesWithName = categories.map((category) => ({
      name: get(category)?.name,
      info: category,
    }));

    const sort = () => {
      sortEntries(categoriesWithName, sortBy);
    };
    return untrack(() => {
      sort();

      const unsubscribes = categoriesWithName.map((category) =>
        category.info.subscribe((value) => {
          if (category.name === value?.name) return;
          category.name = value?.name;
          sort();
        }),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    });
  });
</script>

{#if categoriesWithName.length > 0}
  <div class="space-y-1">
    {#each categoriesWithName as { info }}
      <Category
        {info}
        menuIcon={categoryMenuIcon}
        onclick={onCategoryClick}
        onMenuClick={onCategoryMenuClick}
      />
    {/each}
  </div>
{/if}
