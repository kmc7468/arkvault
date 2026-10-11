<script lang="ts">
  import { ActionModal } from "#lib/components/molecules/index.js";

  interface Props {
    isOpen: boolean;
    onContinueClick: () => void;
  }

  let { isOpen = $bindable(), onContinueClick }: Props = $props();
</script>

<ActionModal
  bind:isOpen
  title="내보내지 않고 계속할까요?"
  cancelText="아니요"
  confirmText="계속할게요"
  onConfirmClick={onContinueClick}
>
  <p>암호 키 파일은 유출 방지를 위해 이 화면에서만 저장할 수 있어요.</p>
</ActionModal>
