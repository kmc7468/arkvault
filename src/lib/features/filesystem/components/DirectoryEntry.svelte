<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { ActionEntryButton, DirectoryEntryLabel } from "#lib/ui/index.js";

  interface Props {
    action?: {
      icon: Component<SvelteHTMLElements["svg"]>;
      onclick: () => void;
    };
    info: { name: string; isFavorite?: boolean };
    onclick?: () => void;
  }

  let { action, info, onclick }: Props = $props();
</script>

<ActionEntryButton
  class="h-14"
  {onclick}
  actionButtonIcon={action?.icon}
  onActionButtonClick={action?.onclick}
>
  <DirectoryEntryLabel type="directory" name={info.name} isFavorite={info.isFavorite} />
</ActionEntryButton>
