<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import { getFileThumbnail } from "$lib/modules/file";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";
  import { formatDateTime } from "$lib/utils";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: SummarizedFileInfo;
    onclick: (entry: SelectedEntry) => void;
    onOpenMenuClick: (entry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  let thumbnail = $derived(getFileThumbnail(info));

  const action = (callback: typeof onclick) => {
    callback({ type: "file", id: info.id, dataKey: info.dataKey, name: info.name });
  };
</script>

<ActionEntryButton
  class="h-14"
  onclick={() => action(onclick)}
  actionButtonIcon={IconMoreVert}
  onActionButtonClick={() => action(onOpenMenuClick)}
>
  <DirectoryEntryLabel
    type="file"
    thumbnail={$thumbnail}
    name={info.name}
    subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
  />
</ActionEntryButton>
