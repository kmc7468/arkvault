<script lang="ts">
  import { getDownloadingFiles } from "$lib/modules/file";

  interface Props {
    onclick: () => void;
  }

  let { onclick }: Props = $props();

  let downloadingFiles = $derived(getDownloadingFiles());
</script>

{#if downloadingFiles.length > 0}
  <button
    onclick={() => setTimeout(onclick, 100)}
    class="mb-4 max-w-[50%] flex-1 rounded-xl bg-green-100 p-3 active:bg-green-200"
  >
    <div class="text-left transition active:scale-95">
      <p class="text-xs text-gray-800">진행 중인 다운로드</p>
      <p class="font-medium text-green-800">{downloadingFiles.length}개</p>
    </div>
  </button>
{/if}
