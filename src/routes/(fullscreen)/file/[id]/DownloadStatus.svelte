<script lang="ts">
  import { isFileDownloading, type FileDownloadState } from "#lib/client/transfer/index.js";
  import { formatNetworkSpeed } from "#lib/utils/index.js";

  interface Props {
    state: FileDownloadState;
  }

  let { state }: Props = $props();
</script>

{#if isFileDownloading(state.status)}
  <div class="w-full rounded-xl bg-gray-100 p-3">
    <p class="font-medium">다운로드하는 중</p>
    <p class="text-xs">
      전송됨
      {Math.floor((state.progress ?? 0) * 100)}% · {formatNetworkSpeed((state.rate ?? 0) * 8)}
    </p>
  </div>
{/if}
