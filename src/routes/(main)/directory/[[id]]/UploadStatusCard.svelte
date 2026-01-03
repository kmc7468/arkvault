<script lang="ts">
  import { getUploadingFiles } from "$lib/modules/file";

  interface Props {
    onclick: () => void;
  }

  let { onclick }: Props = $props();

  let uploadingFiles = $derived(getUploadingFiles());
</script>

{#if uploadingFiles.length > 0}
  <button
    onclick={() => setTimeout(onclick, 100)}
    class="mb-4 max-w-[50%] flex-1 rounded-xl bg-blue-100 p-3 active:bg-blue-200"
  >
    <div class="text-left transition active:scale-95">
      <p class="text-xs text-gray-800">진행 중인 업로드</p>
      <p class="font-medium text-blue-800">{uploadingFiles.length}개</p>
    </div>
  </button>
{/if}
