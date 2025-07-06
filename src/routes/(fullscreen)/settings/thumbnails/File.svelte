<script module lang="ts">
  const subtexts = {
    "generation-pending": "준비 중",
    generating: "생성하는 중",
    "upload-pending": "업로드를 기다리는 중",
    uploading: "업로드하는 중",
    error: "실패",
  } as const;
</script>

<script lang="ts">
  import type { Writable } from "svelte/store";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { formatDateTime } from "$lib/modules/util";
  import type { GenerationStatus } from "./service.svelte";

  import IconCamera from "~icons/material-symbols/camera";

  interface Props {
    info: Writable<FileInfo | null>;
    onclick: (selectedFile: FileInfo) => void;
    onGenerateThumbnailClick: (selectedFile: FileInfo) => void;
    generationStatus?: Writable<GenerationStatus>;
  }

  let { info, onclick, onGenerateThumbnailClick, generationStatus }: Props = $props();
</script>

{#if $info}
  <ActionEntryButton
    class="h-14"
    onclick={() => onclick($info)}
    actionButtonIcon={IconCamera}
    onActionButtonClick={() => onGenerateThumbnailClick($info)}
    actionButtonClass="text-gray-800"
  >
    {@const subtext =
      $generationStatus && $generationStatus !== "uploaded"
        ? subtexts[$generationStatus]
        : formatDateTime($info.createdAt ?? $info.lastModifiedAt)}
    <DirectoryEntryLabel type="file" name={$info.name} {subtext} />
  </ActionEntryButton>
{/if}
