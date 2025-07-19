<script lang="ts">
  import { formatNetworkSpeed } from "$lib/modules/util";
  import { isFileUploading, type FileUploadStatus } from "$lib/stores";

  import IconDraft from "~icons/material-symbols/draft";

  interface Props {
    status: FileUploadStatus;
  }

  let { status }: Props = $props();
</script>

{#if isFileUploading(status.status)}
  <div class="flex h-14 gap-x-4 p-2">
    <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center text-xl">
      <IconDraft class="text-gray-600" />
    </div>
    <div class="flex flex-grow flex-col overflow-hidden text-gray-800">
      <p title={status.name} class="truncate font-medium">
        {status.name}
      </p>
      <p class="text-xs">
        {#if status.status === "encryption-pending"}
          준비 중
        {:else if status.status === "encrypting"}
          암호화하는 중
        {:else if status.status === "upload-pending"}
          업로드를 기다리는 중
        {:else if status.status === "uploading"}
          전송됨 {Math.floor((status.progress ?? 0) * 100)}% ·
          {formatNetworkSpeed((status.rate ?? 0) * 8)}
        {/if}
      </p>
    </div>
  </div>
{/if}
