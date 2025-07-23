<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { CategoryLabel } from "$lib/components/molecules";
  import type { SubCategoryInfo } from "$lib/modules/filesystem2";
  import type { SelectedCategory } from "./service";

  interface Props {
    info: SubCategoryInfo;
    menuIcon?: Component<SvelteHTMLElements["svg"]>;
    onclick: (category: SelectedCategory) => void;
    onMenuClick?: (category: SelectedCategory) => void;
  }

  let { info, menuIcon, onclick, onMenuClick }: Props = $props();

  const openCategory = () => {
    const { id, dataKey, dataKeyVersion, name } = info;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ id, dataKey, dataKeyVersion, name });
  };

  const openMenu = () => {
    const { id, dataKey, dataKeyVersion, name } = info;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onMenuClick!({ id, dataKey, dataKeyVersion, name });
  };
</script>

<ActionEntryButton
  class="h-12"
  onclick={openCategory}
  actionButtonIcon={menuIcon}
  onActionButtonClick={openMenu}
>
  <CategoryLabel name={info.name} />
</ActionEntryButton>
