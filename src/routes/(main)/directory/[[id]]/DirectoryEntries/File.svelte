<script lang="ts">
  import { browser } from "$app/environment";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { SummarizedFileInfo } from "$lib/modules/filesystem";
  import { requestFileThumbnailDownload } from "$lib/services/file";
  import { formatDateTime } from "$lib/utils";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: SummarizedFileInfo;
    onclick: (entry: SelectedEntry) => void;
    onOpenMenuClick: (entry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  let showThumbnail = $derived(
    browser && (info.contentType.startsWith("image/") || info.contentType.startsWith("video/")),
  );
  let thumbnailPromise = $derived(
    showThumbnail ? requestFileThumbnailDownload(info.id, info.dataKey?.key) : null,
  );

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
  {#await thumbnailPromise}
    <DirectoryEntryLabel
      type="file"
      name={info.name}
      subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
    />
  {:then thumbnail}
    <DirectoryEntryLabel
      type="file"
      thumbnail={thumbnail ?? undefined}
      name={info.name}
      subtext={formatDateTime(info.createdAt ?? info.lastModifiedAt)}
    />
  {/await}
</ActionEntryButton>
