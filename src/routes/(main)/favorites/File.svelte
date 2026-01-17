<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import { getFileThumbnail } from "$lib/modules/file";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    info: SummarizedFileInfo;
    onclick: () => void;
    onRemoveClick: () => void;
  }

  let { info, onclick, onRemoveClick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));
</script>

<ActionEntryButton
  class="h-14"
  {onclick}
  actionButtonIcon={IconClose}
  onActionButtonClick={onRemoveClick}
>
  <DirectoryEntryLabel type="file" thumbnail={$thumbnail} name={info.name} />
</ActionEntryButton>
