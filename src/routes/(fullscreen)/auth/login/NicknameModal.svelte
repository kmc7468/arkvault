<script lang="ts">
  import { TextInputModal } from "$lib/components/organisms";

  interface Props {
    isOpen: boolean;
    onSubmitClick: (nickname: string) => void;
  }

  let { isOpen = $bindable(), onSubmitClick }: Props = $props();
</script>

<TextInputModal
  bind:isOpen
  title="닉네임 설정하기"
  placeholder="닉네임"
  submitText="새 계정 만들기"
  {onSubmitClick}
/>
