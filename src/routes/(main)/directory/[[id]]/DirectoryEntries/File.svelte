<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo, FileInfoStore } from "$lib/modules/filesystem2";
  import { formatDateTime } from "$lib/modules/util";
  import { requestFileThumbnailDownload } from "./service";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: FileInfoStore;
    onclick: (selectedEntry: SelectedEntry) => void;
    onOpenMenuClick: (selectedEntry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  let thumbnail: string | undefined = $state();

  const openFile = () => {
    const { id, dataKey, dataKeyVersion, name } = $info.data as FileInfo;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ type: "file", id, dataKey, dataKeyVersion, name });
  };

  const openMenu = () => {
    const { id, dataKey, dataKeyVersion, name } = $info.data as FileInfo;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onOpenMenuClick({ type: "file", id, dataKey, dataKeyVersion, name });
  };

  $effect(() => {
    if ($info.data?.dataKey) {
      requestFileThumbnailDownload($info.data.id, $info.data.dataKey)
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

{#if $info.status === "success"}
  <ActionEntryButton
    class="h-14"
    onclick={openFile}
    actionButtonIcon={IconMoreVert}
    onActionButtonClick={openMenu}
  >
    <DirectoryEntryLabel
      type="file"
      {thumbnail}
      name={$info.data.name}
      subtext={formatDateTime($info.data.createdAt ?? $info.data.lastModifiedAt)}
    />
  </ActionEntryButton>
{/if}
