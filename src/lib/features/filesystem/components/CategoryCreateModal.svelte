<script lang="ts">
  import { TextInputModal } from "#lib/ui/index.ts";

  interface Props {
    isOpen: boolean;
    onCreateClick: (name: string) => Promise<boolean>;
  }

  let { isOpen = $bindable(), onCreateClick }: Props = $props();
</script>

<TextInputModal
  bind:isOpen
  title="새 카테고리"
  placeholder="카테고리 이름"
  submitText="만들기"
  onSubmitClick={onCreateClick}
/>
