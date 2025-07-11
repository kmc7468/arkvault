<script lang="ts">
  import type { Writable } from "svelte/store";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { formatDateTime } from "$lib/modules/util";
  import { requestFileThumbnailDownload } from "./service";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: Writable<FileInfo | null>;
    onclick: (selectedEntry: SelectedEntry) => void;
    onOpenMenuClick: (selectedEntry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  let thumbnail: string | undefined = $state();

  const openFile = () => {
    const { id, dataKey, dataKeyVersion, name } = $info!;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ type: "file", id, dataKey, dataKeyVersion, name });
  };

  const openMenu = () => {
    const { id, dataKey, dataKeyVersion, name } = $info!;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onOpenMenuClick({ type: "file", id, dataKey, dataKeyVersion, name });
  };

  $effect(() => {
    if ($info?.dataKey) {
      requestFileThumbnailDownload($info.id, $info.dataKey)
        .then((thumbnailUrl) => {
          thumbnail = thumbnailUrl ?? undefined;
        })
        .catch(() => {
          // TODO: Error Handling
          thumbnail = undefined;
        });
    } else {
      thumbnail = undefined;
    }
  });
</script>

{#if $info}
  <ActionEntryButton
    class="h-14"
    onclick={openFile}
    actionButtonIcon={IconMoreVert}
    onActionButtonClick={openMenu}
  >
    <DirectoryEntryLabel
      type="file"
      {thumbnail}
      name={$info.name}
      subtext={formatDateTime($info.createdAt ?? $info.lastModifiedAt)}
    />
  </ActionEntryButton>
{/if}
