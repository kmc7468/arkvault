<script lang="ts">
  import type { LiveFileUploadState } from "$lib/modules/file";
  import { formatNetworkSpeed } from "$lib/utils";

  import IconDraft from "~icons/material-symbols/draft";

  interface Props {
    state: LiveFileUploadState;
  }

  let { state }: Props = $props();
</script>

<div class="flex h-14 gap-x-4 p-2">
  <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center text-xl">
    <IconDraft class="text-gray-600" />
  </div>
  <div class="flex flex-grow flex-col overflow-hidden text-gray-800">
    <p title={state.name} class="truncate font-medium">
      {state.name}
    </p>
    <p class="text-xs">
      {#if state.status === "encryption-pending"}
        준비 중
      {:else if state.status === "encrypting"}
        암호화하는 중
      {:else if state.status === "upload-pending"}
        업로드를 기다리는 중
      {:else if state.status === "uploading"}
        전송됨 {Math.floor((state.progress ?? 0) * 100)}% ·
        {formatNetworkSpeed((state.rate ?? 0) * 8)}
      {/if}
    </p>
  </div>
</div>
