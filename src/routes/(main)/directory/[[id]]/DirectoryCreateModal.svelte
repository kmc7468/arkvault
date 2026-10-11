<script lang="ts">
  import { TextInputModal } from "#lib/components/organisms/index.js";

  interface Props {
    isOpen: boolean;
    onCreateClick: (name: string) => Promise<boolean>;
  }

  let { isOpen = $bindable(), onCreateClick }: Props = $props();
</script>

<TextInputModal
  bind:isOpen
  title="새 폴더"
  placeholder="폴더 이름"
  submitText="만들기"
  onSubmitClick={onCreateClick}
/>
