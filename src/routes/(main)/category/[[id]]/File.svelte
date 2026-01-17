<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import { getFileThumbnail } from "$lib/modules/file";
  import type { CategoryFileInfo } from "$lib/modules/filesystem";
  import type { SelectedFile } from "./service.svelte";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    info: CategoryFileInfo;
    onclick: (file: SelectedFile) => void;
    onRemoveClick?: (file: SelectedFile) => void;
  }

  let { info, onclick, onRemoveClick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));
</script>

<ActionEntryButton
  class="h-12"
  onclick={() => onclick(info)}
  actionButtonIcon={onRemoveClick && IconClose}
  onActionButtonClick={() => onRemoveClick?.(info)}
>
  <DirectoryEntryLabel
    type="file"
    thumbnail={$thumbnail}
    name={info.name}
    isFavorite={info.isFavorite}
  />
</ActionEntryButton>
