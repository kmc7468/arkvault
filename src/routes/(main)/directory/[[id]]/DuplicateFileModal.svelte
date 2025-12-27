<script lang="ts">
  import { ActionModal } from "$lib/components/molecules";
  import { truncateString } from "$lib/utils";

  interface Props {
    file: File | undefined;
    isOpen: boolean;
    onbeforeclose: () => void;
    onUploadClick: () => void;
  }

  let { file, isOpen = $bindable(), onbeforeclose, onUploadClick }: Props = $props();
</script>

{#if file}
  {@const { name } = file}
  <ActionModal
    bind:isOpen
    {onbeforeclose}
    title="'{truncateString(name)}' 파일이 있어요."
    cancelText="아니요"
    confirmText="업로드할게요"
    onConfirmClick={onUploadClick}
  >
    <p>예전에 이미 업로드된 파일이에요. 그래도 업로드할까요?</p>
  </ActionModal>
{/if}
