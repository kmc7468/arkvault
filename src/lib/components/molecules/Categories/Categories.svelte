<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { derived } from "svelte/store";
  import type { CategoryId } from "$lib/indexedDB";
  import { getCategoryInfo, type SubCategoryInfo } from "$lib/modules/filesystem2";
  import { SortBy, sortEntries } from "$lib/modules/util";
  import { masterKeyStore } from "$lib/stores";
  import Category from "./Category.svelte";
  import type { SelectedCategory } from "./service";

  interface Props {
    categoryIds: CategoryId[];
    categoryMenuIcon?: Component<SvelteHTMLElements["svg"]>;
    onCategoryClick: (category: SelectedCategory) => void;
    onCategoryMenuClick?: (category: SelectedCategory) => void;
    sortBy?: SortBy;
  }

  let {
    categoryIds,
    categoryMenuIcon,
    onCategoryClick,
    onCategoryMenuClick,
    sortBy = SortBy.NAME_ASC,
  }: Props = $props();

  let categories = $derived(
    derived(
      categoryIds.map((id) => getCategoryInfo(id, $masterKeyStore?.get(1)?.key!)),
      (infos) => {
        const categories = infos
          .filter(($info) => $info.status === "success")
          .map(($info) => ({
            name: $info.data.name,
            info: $info.data as SubCategoryInfo,
          }));
        sortEntries(categories, sortBy);
        return categories;
      },
    ),
  );
</script>

{#if $categories.length > 0}
  <div class="space-y-1">
    {#each $categories as { info }}
      <Category
        {info}
        menuIcon={categoryMenuIcon}
        onclick={onCategoryClick}
        onMenuClick={onCategoryMenuClick}
      />
    {/each}
  </div>
{/if}
