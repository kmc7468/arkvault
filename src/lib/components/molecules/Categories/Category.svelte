<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { CategoryLabel } from "$lib/components/molecules";
  import type { SubCategoryInfo } from "$lib/modules/filesystem";
  import type { SelectedCategory } from "./service";

  interface Props {
    info: SubCategoryInfo;
    menuIcon?: Component<SvelteHTMLElements["svg"]>;
    onclick: (category: SelectedCategory) => void;
    onMenuClick?: (category: SelectedCategory) => void;
  }

  let { info, menuIcon, onclick, onMenuClick }: Props = $props();
</script>

<ActionEntryButton
  class="h-12"
  onclick={() => onclick(info)}
  actionButtonIcon={menuIcon}
  onActionButtonClick={() => onMenuClick?.(info)}
>
  <CategoryLabel name={info.name} />
</ActionEntryButton>
