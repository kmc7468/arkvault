<script lang="ts">
  import { ActionModal } from "$lib/components/molecules";

  interface Props {
    isOpen: boolean;
    onLoginClick: () => void;
  }

  let { isOpen = $bindable(), onLoginClick }: Props = $props();
</script>

<ActionModal
  bind:isOpen
  title="다른 디바이스에 이미 로그인되어 있어요."
  cancelText="아니요"
  confirmText="네"
  onConfirmClick={onLoginClick}
>
  <p>다른 디바이스에서는 로그아웃하고, 이 디바이스에서 로그인할까요?</p>
</ActionModal>
