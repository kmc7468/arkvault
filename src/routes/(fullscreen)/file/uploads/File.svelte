<script lang="ts">
  import type { FileUploadState } from "$lib/modules/file";
  import { formatNetworkSpeed } from "$lib/utils";

  import IconPending from "~icons/material-symbols/pending";
  import IconLockClock from "~icons/material-symbols/lock-clock";
  import IconCloud from "~icons/material-symbols/cloud";
  import IconCloudUpload from "~icons/material-symbols/cloud-upload";
  import IconCloudDone from "~icons/material-symbols/cloud-done";
  import IconError from "~icons/material-symbols/error";

  interface Props {
    state: FileUploadState;
  }

  let { state }: Props = $props();
</script>

<div class="flex h-14 items-center gap-x-4 p-2">
  <div class="flex-shrink-0 text-lg text-gray-600">
    {#if state.status === "queued" || state.status === "encryption-pending"}
      <IconPending />
    {:else if state.status === "encrypting"}
      <IconLockClock />
    {:else if state.status === "upload-pending"}
      <IconCloud />
    {:else if state.status === "uploading"}
      <IconCloudUpload />
    {:else if state.status === "uploaded"}
      <IconCloudDone class="text-blue-500" />
    {:else if state.status === "error"}
      <IconError class="text-red-500" />
    {/if}
  </div>
  <div class="flex-grow overflow-hidden">
    <p title={state.name} class="truncate font-medium">
      {state.name}
    </p>
    <p class="text-xs text-gray-800">
      {#if state.status === "queued"}
        대기 중
      {:else if state.status === "encryption-pending"}
        준비 중
      {:else if state.status === "encrypting"}
        암호화하는 중
      {:else if state.status === "upload-pending"}
        업로드를 기다리는 중
      {:else if state.status === "uploading"}
        전송됨
        {Math.floor((state.progress ?? 0) * 100)}% · {formatNetworkSpeed((state.rate ?? 0) * 8)}
      {:else if state.status === "uploaded"}
        업로드 완료
      {:else if state.status === "error"}
        업로드 실패
      {/if}
    </p>
  </div>
</div>
