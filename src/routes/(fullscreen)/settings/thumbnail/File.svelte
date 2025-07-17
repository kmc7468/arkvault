<script module lang="ts">
  const subtexts = {
    queued: "대기 중",
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
  import type { FileInfo, FileInfoStore } from "$lib/modules/filesystem2";
  import { formatDateTime } from "$lib/modules/util";
  import type { GenerationStatus } from "./service.svelte";

  import IconCamera from "~icons/material-symbols/camera";

  interface Props {
    info: FileInfoStore;
    onclick: (selectedFile: FileInfo) => void;
    onGenerateThumbnailClick: (selectedFile: FileInfo) => void;
    generationStatus?: Writable<GenerationStatus>;
  }

  let { info, onclick, onGenerateThumbnailClick, generationStatus }: Props = $props();
</script>

{#if $info.status === "success"}
  <ActionEntryButton
    class="h-14"
    onclick={() => onclick($info.data)}
    actionButtonIcon={!$generationStatus || $generationStatus === "error" ? IconCamera : undefined}
    onActionButtonClick={() => onGenerateThumbnailClick($info.data)}
    actionButtonClass="text-gray-800"
  >
    {@const subtext =
      $generationStatus && $generationStatus !== "uploaded"
        ? subtexts[$generationStatus]
        : formatDateTime($info.data.createdAt ?? $info.data.lastModifiedAt)}
    <DirectoryEntryLabel type="file" name={$info.data.name} {subtext} />
  </ActionEntryButton>
{/if}
