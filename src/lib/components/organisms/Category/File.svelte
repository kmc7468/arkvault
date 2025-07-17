<script lang="ts">
  import type { Writable } from "svelte/store";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo, FileInfoStore } from "$lib/modules/filesystem2";
  import { requestFileThumbnailDownload, type SelectedFile } from "./service";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    info: FileInfoStore;
    onclick: (selectedFile: SelectedFile) => void;
    onRemoveClick?: (selectedFile: SelectedFile) => void;
  }

  let { info, onclick, onRemoveClick }: Props = $props();

  let thumbnail: string | undefined = $state();

  const openFile = () => {
    const { id, dataKey, dataKeyVersion, name } = $info.data as FileInfo;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ id, dataKey, dataKeyVersion, name });
  };

  const removeFile = () => {
    const { id, dataKey, dataKeyVersion, name } = $info.data as FileInfo;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onRemoveClick!({ id, dataKey, dataKeyVersion, name });
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
    class="h-12"
    onclick={openFile}
    actionButtonIcon={onRemoveClick && IconClose}
    onActionButtonClick={removeFile}
  >
    <DirectoryEntryLabel type="file" {thumbnail} name={$info.data.name} />
  </ActionEntryButton>
{/if}
