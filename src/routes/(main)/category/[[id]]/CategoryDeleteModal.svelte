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

{#if context.selectedCategory}
  {@const { name } = context.selectedCategory}
  <ActionModal
    bind:isOpen
    title="'{truncateString(name)}' 카테고리를 삭제할까요?"
    cancelText="아니요"
    confirmText="삭제할게요"
    onConfirmClick={onDeleteClick}
  >
    <p>
      모든 하위 카테고리도 함께 삭제돼요. <br />
      하지만 카테고리에 추가된 파일들은 삭제되지 않아요.
    </p>
  </ActionModal>
{/if}
