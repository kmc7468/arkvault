<script lang="ts">
  import type { Writable } from "svelte/store";
  import type { FileUploadStatus } from "$lib/stores";
  import { formatNetworkSpeed } from "$lib/utils";

  import IconPending from "~icons/material-symbols/pending";
  import IconLockClock from "~icons/material-symbols/lock-clock";
  import IconCloud from "~icons/material-symbols/cloud";
  import IconCloudUpload from "~icons/material-symbols/cloud-upload";
  import IconCloudDone from "~icons/material-symbols/cloud-done";
  import IconError from "~icons/material-symbols/error";

  interface Props {
    status: Writable<FileUploadStatus>;
  }

  let { status }: Props = $props();
</script>

<div class="flex h-14 items-center gap-x-4 p-2">
  <div class="flex-shrink-0 text-lg text-gray-600">
    {#if $status.status === "encryption-pending"}
      <IconPending />
    {:else if $status.status === "encrypting"}
      <IconLockClock />
    {:else if $status.status === "upload-pending"}
      <IconCloud />
    {:else if $status.status === "uploading"}
      <IconCloudUpload />
    {:else if $status.status === "uploaded"}
      <IconCloudDone class="text-blue-500" />
    {:else if $status.status === "error"}
      <IconError class="text-red-500" />
    {/if}
  </div>
  <div class="flex-grow overflow-hidden">
    <p title={$status.name} class="truncate font-medium">
      {$status.name}
    </p>
    <p class="text-xs text-gray-800">
      {#if $status.status === "encryption-pending"}
        준비 중
      {:else if $status.status === "encrypting"}
        암호화하는 중
      {:else if $status.status === "upload-pending"}
        업로드를 기다리는 중
      {:else if $status.status === "uploading"}
        전송됨
        {Math.floor(($status.progress ?? 0) * 100)}% · {formatNetworkSpeed(($status.rate ?? 0) * 8)}
      {:else if $status.status === "uploaded"}
        업로드 완료
      {:else if $status.status === "error"}
        업로드 실패
      {/if}
    </p>
  </div>
</div>
