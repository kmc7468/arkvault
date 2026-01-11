<script module lang="ts">
  const subtexts = {
    queued: "대기 중",
    "download-pending": "다운로드를 기다리는 중",
    downloading: "다운로드하는 중",
    "encryption-pending": "암호화를 기다리는 중",
    encrypting: "암호화하는 중",
    "upload-pending": "업로드를 기다리는 중",
    completed: "완료",
    error: "실패",
  } as const;
</script>

<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { FileInfo } from "$lib/modules/filesystem";
  import { formatDateTime, formatNetworkSpeed } from "$lib/utils";
  import type { MigrationState } from "./service.svelte";

  import IconSync from "~icons/material-symbols/sync";

  type FileInfoWithExists = FileInfo & { exists: true };

  interface Props {
    info: FileInfoWithExists;
    onclick: (file: FileInfo) => void;
    onMigrateClick: (file: FileInfoWithExists) => void;
    state: MigrationState | undefined;
  }

  let { info, onclick, onMigrateClick, state }: Props = $props();

  let subtext = $derived.by(() => {
    if (!state) {
      return formatDateTime(info.createdAt ?? info.lastModifiedAt);
    }
    if (state.status === "uploading") {
      const progress = Math.floor((state.progress ?? 0) * 100);
      const speed = formatNetworkSpeed((state.rate ?? 0) * 8);
      return `전송됨 ${progress}% · ${speed}`;
    }
    return subtexts[state.status] ?? state.status;
  });
</script>

<ActionEntryButton
  class="h-14"
  onclick={() => onclick(info)}
  actionButtonIcon={!state || state.status === "error" ? IconSync : undefined}
  onActionButtonClick={() => onMigrateClick(info)}
  actionButtonClass="text-gray-800"
>
  <DirectoryEntryLabel type="file" name={info.name} {subtext} />
</ActionEntryButton>
