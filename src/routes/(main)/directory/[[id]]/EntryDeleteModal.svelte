<script lang="ts">
  import { ActionModal } from "$lib/components/molecules";
  import { truncateString } from "$lib/utils";
  import { useContext } from "./service.svelte";

  interface Props {
    isOpen: boolean;
    onDeleteClick: () => Promise<boolean>;
  }

  let { isOpen = $bindable(), onDeleteClick }: Props = $props();
  let context = useContext();
</script>

{#if context.selectedEntry}
  {@const { name, type } = context.selectedEntry}
  <ActionModal
    bind:isOpen
    title="'{truncateString(name)}' {type === 'directory' ? '폴더를' : '파일을'} 삭제할까요?"
    cancelText="아니요"
    confirmText="삭제할게요"
    onConfirmClick={onDeleteClick}
  >
    <p>
      {#if type === "directory"}
        삭제한 폴더는 복구할 수 없어요. <br />
        폴더 안의 모든 파일과 폴더도 함께 삭제돼요.
      {:else}
        삭제한 파일은 복구할 수 없어요.
      {/if}
    </p>
  </ActionModal>
{/if}
