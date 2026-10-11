<script module lang="ts">
  import type { DataKey, SubCategoryInfo } from "#lib/features/filesystem/index.ts";

  export interface SelectedCategory {
    id: number;
    dataKey?: DataKey;
    name: string;
  }
</script>

<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { ActionEntryButton, CategoryLabel } from "#lib/ui/index.ts";
  import { sortEntries } from "#lib/utils/index.ts";

  interface Props {
    categories: SubCategoryInfo[];
    categoryMenuIcon?: Component<SvelteHTMLElements["svg"]>;
    onCategoryClick: (category: SelectedCategory) => void;
    onCategoryMenuClick?: (category: SelectedCategory) => void;
  }

  let { categories, categoryMenuIcon, onCategoryClick, onCategoryMenuClick }: Props = $props();

  let categoriesWithName = $derived(sortEntries([...categories]));
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
