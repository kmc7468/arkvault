<script lang="ts">
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { DirectoryEntryLabel } from "#lib/components/molecules/index.js";
  import { getFileThumbnail } from "#lib/client/cache/index.js";
  import type { SummarizedFileInfo } from "#lib/modules/filesystem/index.js";
  import { formatDateTime } from "#lib/utils/index.js";

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
  <DirectoryEntryLabel
    type="file"
    thumbnail={thumbnail?.url}
    name={info.name}
    subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
    isFavorite
  />
</ActionEntryButton>
