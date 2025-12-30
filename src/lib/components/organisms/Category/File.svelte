<script lang="ts">
  import { browser } from "$app/environment";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { CategoryFileInfo } from "$lib/modules/filesystem";
  import { requestFileThumbnailDownload } from "$lib/services/file";
  import type { SelectedFile } from "./service";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    info: CategoryFileInfo;
    onclick: (file: SelectedFile) => void;
    onRemoveClick?: (file: SelectedFile) => void;
  }

  let { info, onclick, onRemoveClick }: Props = $props();

  let showThumbnail = $derived(
    browser && (info.contentType.startsWith("image/") || info.contentType.startsWith("video/")),
  );
  let thumbnailPromise = $derived(
    showThumbnail ? requestFileThumbnailDownload(info.id, info.dataKey?.key) : null,
  );
</script>

<ActionEntryButton
  class="h-12"
  onclick={() => onclick(info)}
  actionButtonIcon={onRemoveClick && IconClose}
  onActionButtonClick={() => onRemoveClick?.(info)}
>
  {#await thumbnailPromise}
    <DirectoryEntryLabel type="file" name={info.name} />
  {:then thumbnail}
    <DirectoryEntryLabel type="file" thumbnail={thumbnail ?? undefined} name={info.name} />
  {/await}
</ActionEntryButton>
