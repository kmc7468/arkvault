<script lang="ts">
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { DirectoryEntryLabel } from "#lib/components/molecules/index.js";
  import type { SubDirectoryInfo } from "#lib/modules/filesystem/index.js";

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
  <DirectoryEntryLabel type="directory" name={info.name} isFavorite />
</ActionEntryButton>
