<script module lang="ts">
  const subtexts = {
    queued: "대기 중",
    "generation-pending": "준비 중",
    generating: "생성하는 중",
    uploading: "업로드하는 중",
    error: "실패",
  } as const;
</script>

<script lang="ts">
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { DirectoryEntryLabel } from "#lib/components/molecules/index.js";
  import type { FileInfo } from "#lib/features/filesystem/index.js";
  import { formatDateTime } from "#lib/utils/index.js";
  import type { GenerationStatus } from "./service";

  import IconCamera from "~icons/material-symbols/camera";

  interface Props {
    info: FileInfo;
    onclick: (file: FileInfo) => void;
    onGenerateThumbnailClick: (file: FileInfo) => void;
    status: Exclude<GenerationStatus, "uploaded"> | undefined;
  }

  let { info, onclick, onGenerateThumbnailClick, status }: Props = $props();
</script>

<ActionEntryButton
  class="h-14"
  onclick={() => onclick(info)}
  actionButtonIcon={!status || status === "error" ? IconCamera : undefined}
  onActionButtonClick={() => onGenerateThumbnailClick(info)}
  actionButtonClass="text-gray-800"
>
  {@const subtext = status
    ? subtexts[status]
    : formatDateTime(info.createdAt ?? info.lastModifiedAt)}
  <DirectoryEntryLabel type="file" name={info.name} {subtext} />
</ActionEntryButton>
