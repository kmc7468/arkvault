<script lang="ts">
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { DirectoryEntryLabel } from "#lib/components/molecules/index.js";
  import { getFileThumbnail } from "#lib/client/cache/index.js";
  import type { SummarizedFileInfo } from "#lib/modules/filesystem/index.js";
  import { formatDateTime } from "#lib/utils/index.js";

  interface Props {
    info: SummarizedFileInfo;
    onclick: () => void;
  }

  let { info, onclick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));
</script>

<ActionEntryButton class="h-14" {onclick}>
  <DirectoryEntryLabel
    type="file"
    thumbnail={thumbnail?.url}
    name={info.name}
    subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
    isFavorite={info.isFavorite}
  />
</ActionEntryButton>
