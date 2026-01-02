<script module lang="ts">
  import type { DataKey } from "$lib/modules/filesystem";

  export interface SelectedCategory {
    id: number;
    dataKey?: DataKey;
    name: string;
  }
</script>

<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { CategoryLabel } from "$lib/components/molecules";
  import type { SubCategoryInfo } from "$lib/modules/filesystem";
  import { sortEntries } from "$lib/utils";

  interface Props {
    categories: SubCategoryInfo[];
    categoryMenuIcon?: Component<SvelteHTMLElements["svg"]>;
    onCategoryClick: (category: SelectedCategory) => void;
    onCategoryMenuClick?: (category: SelectedCategory) => void;
  }

  let { categories, categoryMenuIcon, onCategoryClick, onCategoryMenuClick }: Props = $props();

  let categoriesWithName = $derived(sortEntries($state.snapshot(categories)));
</script>

{#if categoriesWithName.length > 0}
  <div class="space-y-1">
    {#each categoriesWithName as category (category.id)}
      <ActionEntryButton
        class="h-12"
        onclick={() => onCategoryClick(category)}
        actionButtonIcon={categoryMenuIcon}
        onActionButtonClick={() => onCategoryMenuClick?.(category)}
      >
        <CategoryLabel name={category.name} />
      </ActionEntryButton>
    {/each}
  </div>
{/if}
