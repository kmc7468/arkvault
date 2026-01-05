<script lang="ts">
  import { isFileDownloading, type FileDownloadState } from "$lib/modules/file";
  import { formatNetworkSpeed } from "$lib/utils";

  interface Props {
    state: FileDownloadState;
  }

  let { state }: Props = $props();
</script>

{#if isFileDownloading(state.status)}
  <div class="w-full rounded-xl bg-gray-100 p-3">
    <p class="font-medium">
      {#if state.status === "download-pending"}
        다운로드를 기다리는 중
      {:else if state.status === "downloading"}
        다운로드하는 중
      {:else if state.status === "decryption-pending"}
        복호화를 기다리는 중
      {:else if state.status === "decrypting"}
        복호화하는 중
      {/if}
    </p>
    <p class="text-xs">
      {#if state.status === "downloading"}
        전송됨
        {Math.floor((state.progress ?? 0) * 100)}% · {formatNetworkSpeed((state.rate ?? 0) * 8)}
      {/if}
    </p>
  </div>
{/if}
