<script lang="ts">
  import { get, type Writable } from "svelte/store";
  import { getFileInfo } from "$lib/modules/filesystem2";
  import { formatNetworkSpeed } from "$lib/modules/util";
  import { masterKeyStore, type FileDownloadStatus } from "$lib/stores";

  import IconCloud from "~icons/material-symbols/cloud";
  import IconCloudDownload from "~icons/material-symbols/cloud-download";
  import IconLock from "~icons/material-symbols/lock";
  import IconLockClock from "~icons/material-symbols/lock-clock";
  import IconCheckCircle from "~icons/material-symbols/check-circle";
  import IconError from "~icons/material-symbols/error";

  interface Props {
    status: Writable<FileDownloadStatus>;
  }

  let { status }: Props = $props();

  let fileInfo = $derived(getFileInfo(get(status).id, $masterKeyStore?.get(1)?.key!));
</script>

{#if $fileInfo.status === "success"}
  <div class="flex h-14 items-center gap-x-4 p-2">
    <div class="flex-shrink-0 text-lg text-gray-600">
      {#if $status.status === "download-pending"}
        <IconCloud />
      {:else if $status.status === "downloading"}
        <IconCloudDownload />
      {:else if $status.status === "decryption-pending"}
        <IconLock />
      {:else if $status.status === "decrypting"}
        <IconLockClock />
      {:else if $status.status === "decrypted"}
        <IconCheckCircle class="text-green-500" />
      {:else if $status.status === "error"}
        <IconError class="text-red-500" />
      {/if}
    </div>
    <div class="flex-grow overflow-hidden">
      <p title={$fileInfo.data.name} class="truncate font-medium">
        {$fileInfo.data.name}
      </p>
      <p class="text-xs text-gray-800">
        {#if $status.status === "download-pending"}
          다운로드를 기다리는 중
        {:else if $status.status === "downloading"}
          전송됨
          {Math.floor(($status.progress ?? 0) * 100)}% ·
          {formatNetworkSpeed(($status.rate ?? 0) * 8)}
        {:else if $status.status === "decryption-pending"}
          복호화를 기다리는 중
        {:else if $status.status === "decrypting"}
          복호화하는 중
        {:else if $status.status === "decrypted"}
          다운로드 완료
        {:else if $status.status === "error"}
          다운로드 실패
        {/if}
      </p>
    </div>
  </div>
{/if}
