<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import { getFileThumbnail } from "$lib/modules/file";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";
  import { formatDateTime } from "$lib/utils";

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
    thumbnail={$thumbnail}
    name={info.name}
    subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
  />
</ActionEntryButton>
