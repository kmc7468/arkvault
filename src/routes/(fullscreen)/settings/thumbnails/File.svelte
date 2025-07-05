<script lang="ts">
  import type { Writable } from "svelte/store";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { formatDateTime } from "$lib/modules/util";

  import IconCamera from "~icons/material-symbols/camera";

  interface Props {
    info: Writable<FileInfo | null>;
    onclick: (selectedFile: FileInfo) => void;
    onGenerateThumbnailClick: (selectedFile: FileInfo) => void;
  }

  let { info, onclick, onGenerateThumbnailClick }: Props = $props();
</script>

{#if $info}
  <ActionEntryButton
    class="h-14"
    onclick={() => onclick($info)}
    actionButtonIcon={IconCamera}
    onActionButtonClick={() => onGenerateThumbnailClick($info)}
    actionButtonClass="text-gray-800"
  >
    <DirectoryEntryLabel
      type="file"
      name={$info.name}
      subtext={formatDateTime($info.createdAt ?? $info.lastModifiedAt)}
    />
  </ActionEntryButton>
{/if}
