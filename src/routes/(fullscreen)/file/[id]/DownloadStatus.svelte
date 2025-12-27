<script lang="ts">
  import type { Writable } from "svelte/store";
  import { isFileDownloading, type FileDownloadStatus } from "$lib/stores";
  import { formatNetworkSpeed } from "$lib/utils";

  interface Props {
    status?: Writable<FileDownloadStatus>;
  }

  let { status }: Props = $props();
</script>

{#if $status && isFileDownloading($status.status)}
  <div class="w-full rounded-xl bg-gray-100 p-3">
    <p class="font-medium">
      {#if $status.status === "download-pending"}
        다운로드를 기다리는 중
      {:else if $status.status === "downloading"}
        다운로드하는 중
      {:else if $status.status === "decryption-pending"}
        복호화를 기다리는 중
      {:else if $status.status === "decrypting"}
        복호화하는 중
      {/if}
    </p>
    <p class="text-xs">
      {#if $status.status === "downloading"}
        전송됨
        {Math.floor(($status.progress ?? 0) * 100)}% · {formatNetworkSpeed(($status.rate ?? 0) * 8)}
      {/if}
    </p>
  </div>
{/if}
