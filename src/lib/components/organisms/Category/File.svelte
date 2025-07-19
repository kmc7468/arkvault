<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo } from "$lib/modules/filesystem2";
  import { requestFileThumbnailDownload, type SelectedFile } from "./service";

  import IconClose from "~icons/material-symbols/close";

  interface Props {
    info: FileInfo;
    onclick: (selectedFile: SelectedFile) => void;
    onRemoveClick?: (selectedFile: SelectedFile) => void;
  }

  let { info, onclick, onRemoveClick }: Props = $props();

  let thumbnail: string | undefined = $state();

  const openFile = () => {
    const { id, dataKey, dataKeyVersion, name } = info;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ id, dataKey, dataKeyVersion, name });
  };

  const removeFile = () => {
    const { id, dataKey, dataKeyVersion, name } = info;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onRemoveClick!({ id, dataKey, dataKeyVersion, name });
  };

  $effect(() => {
    if (info.dataKey) {
      requestFileThumbnailDownload(info.id, info.dataKey)
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

<ActionEntryButton
  class="h-12"
  onclick={openFile}
  actionButtonIcon={onRemoveClick && IconClose}
  onActionButtonClick={removeFile}
>
  <DirectoryEntryLabel type="file" {thumbnail} name={info.name} />
</ActionEntryButton>
