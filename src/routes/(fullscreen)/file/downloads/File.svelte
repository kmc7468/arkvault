<script lang="ts">
  import type { FileDownloadState } from "#lib/client/transfer/index.js";
  import type { SummarizedFileInfo } from "#lib/features/filesystem/index.js";
  import { formatNetworkSpeed } from "#lib/utils/index.js";

  import IconCloudDownload from "~icons/material-symbols/cloud-download";
  import IconCheckCircle from "~icons/material-symbols/check-circle";
  import IconError from "~icons/material-symbols/error";

  interface Props {
    info: SummarizedFileInfo;
    state: FileDownloadState;
  }

  let { info, state }: Props = $props();
</script>

<div class="flex h-14 items-center gap-x-4 p-2">
  <div class="shrink-0 text-lg text-gray-600">
    {#if state.status === "downloading"}
      <IconCloudDownload />
    {:else if state.status === "completed"}
      <IconCheckCircle class="text-green-500" />
    {:else if state.status === "error"}
      <IconError class="text-red-500" />
    {/if}
  </div>
  <div class="grow overflow-hidden">
    <p title={info.name} class="truncate font-medium">
      {info.name}
    </p>
    <p class="text-xs text-gray-800">
      {#if state.status === "downloading"}
        전송됨
        {Math.floor((state.progress ?? 0) * 100)}% ·
        {formatNetworkSpeed((state.rate ?? 0) * 8)}
      {:else if state.status === "completed"}
        다운로드 완료
      {:else if state.status === "error"}
        다운로드 실패
      {/if}
    </p>
  </div>
</div>
