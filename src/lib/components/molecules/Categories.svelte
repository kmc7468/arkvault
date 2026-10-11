<script module lang="ts">
  import type { DataKey } from "#lib/features/filesystem/index.js";

  export interface SelectedCategory {
    id: number;
    dataKey?: DataKey;
    name: string;
  }
</script>

<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { CategoryLabel } from "#lib/components/molecules/index.js";
  import type { SubCategoryInfo } from "#lib/features/filesystem/index.js";
  import { sortEntries } from "#lib/utils/index.js";

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
