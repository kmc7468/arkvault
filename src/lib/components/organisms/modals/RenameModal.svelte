<script lang="ts">
  import { TextInputModal } from "#lib/components/organisms/index.js";

  interface Props {
    isOpen: boolean;
    onbeforeclose?: () => void;
    onRenameClick: (newName: string) => Promise<boolean>;
    originalName: string | undefined;
  }

  let { isOpen = $bindable(), onbeforeclose, onRenameClick, originalName }: Props = $props();
</script>

<TextInputModal
  bind:isOpen
  {onbeforeclose}
  title="이름 바꾸기"
  placeholder="이름"
  defaultValue={originalName}
  submitText="바꾸기"
  onSubmitClick={onRenameClick}
/>
