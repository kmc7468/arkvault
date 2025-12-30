<script lang="ts">
  import type { FileDownloadState } from "$lib/modules/file";
  import type { FileInfo } from "$lib/modules/filesystem2.svelte";
  import { formatNetworkSpeed } from "$lib/utils";

  import IconCloud from "~icons/material-symbols/cloud";
  import IconCloudDownload from "~icons/material-symbols/cloud-download";
  import IconLock from "~icons/material-symbols/lock";
  import IconLockClock from "~icons/material-symbols/lock-clock";
  import IconCheckCircle from "~icons/material-symbols/check-circle";
  import IconError from "~icons/material-symbols/error";

  interface Props {
    info: FileInfo;
    state: FileDownloadState;
  }

  let { info, state }: Props = $props();
</script>

<div class="flex h-14 items-center gap-x-4 p-2">
  <div class="flex-shrink-0 text-lg text-gray-600">
    {#if state.status === "download-pending"}
      <IconCloud />
    {:else if state.status === "downloading"}
      <IconCloudDownload />
    {:else if state.status === "decryption-pending"}
      <IconLock />
    {:else if state.status === "decrypting"}
      <IconLockClock />
    {:else if state.status === "decrypted"}
      <IconCheckCircle class="text-green-500" />
    {:else if state.status === "error"}
      <IconError class="text-red-500" />
    {/if}
  </div>
  <div class="flex-grow overflow-hidden">
    <p title={info.name} class="truncate font-medium">
      {info.name}
    </p>
    <p class="text-xs text-gray-800">
      {#if state.status === "download-pending"}
        다운로드를 기다리는 중
      {:else if state.status === "downloading"}
        전송됨
        {Math.floor((state.progress ?? 0) * 100)}% ·
        {formatNetworkSpeed((state.rate ?? 0) * 8)}
      {:else if state.status === "decryption-pending"}
        복호화를 기다리는 중
      {:else if state.status === "decrypting"}
        복호화하는 중
      {:else if state.status === "decrypted"}
        다운로드 완료
      {:else if state.status === "error"}
        다운로드 실패
      {/if}
    </p>
  </div>
</div>
