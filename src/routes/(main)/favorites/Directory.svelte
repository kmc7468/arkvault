<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { SubDirectoryInfo } from "$lib/modules/filesystem";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    info: SubDirectoryInfo;
    onclick: () => void;
    onRemoveClick: () => void;
  }

  let { info, onclick, onRemoveClick }: Props = $props();
</script>

<ActionEntryButton
  class="h-14"
  {onclick}
  actionButtonIcon={IconClose}
  onActionButtonClick={onRemoveClick}
>
  <DirectoryEntryLabel type="directory" name={info.name} />
</ActionEntryButton>
