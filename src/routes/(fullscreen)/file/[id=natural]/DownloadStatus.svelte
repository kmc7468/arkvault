<script lang="ts">
  import { isFileDownloading, type FileDownloadState } from "#lib/client/transfer/index.ts";
  import { TransferProgress } from "#lib/features/transfer/components/index.ts";

  interface Props {
    state: FileDownloadState;
  }

  let { state }: Props = $props();
</script>

{#if isFileDownloading(state.status)}
  <div class="w-full rounded-xl bg-gray-100 p-3">
    <p class="font-medium">다운로드하는 중</p>
    <p class="text-xs">
      <TransferProgress progress={state.progress} rate={state.rate} />
    </p>
  </div>
{/if}
