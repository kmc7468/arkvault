<script lang="ts">
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { DirectoryEntryLabel } from "#lib/components/molecules/index.js";
  import { getFileThumbnail } from "#lib/client/cache/index.js";
  import type { CategoryFileInfo } from "#lib/modules/filesystem/index.js";
  import { formatDateTime } from "#lib/utils/index.js";
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
  class="h-14"
  onclick={() => onclick(info)}
  actionButtonIcon={onRemoveClick && IconClose}
  onActionButtonClick={() => onRemoveClick?.(info)}
>
  <DirectoryEntryLabel
    type="file"
    thumbnail={thumbnail?.url}
    name={info.name}
    subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
    isFavorite={info.isFavorite}
  />
</ActionEntryButton>
