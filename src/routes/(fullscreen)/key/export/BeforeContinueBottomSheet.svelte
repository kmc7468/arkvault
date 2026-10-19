<script lang="ts">
  import { BottomDiv, BottomSheet, Button, FullscreenDiv } from "#lib/ui/index.ts";

  interface Props {
    onRetryClick: () => void;
    onContinueClick: () => void;
    isOpen: boolean;
  }

  let { onRetryClick, onContinueClick, isOpen = $bindable() }: Props = $props();
</script>

<BottomSheet bind:isOpen class="flex flex-col">
  <FullscreenDiv>
    <div class="space-y-2 py-4 break-keep">
      <p class="text-xl font-bold">암호 키 파일을 저장하셨나요?</p>
      <p>
        암호 키 파일은 유출 방지를 위해 이 화면에서만 저장할 수 있어요. 파일이 잘 저장되었는지 다시
        한 번 확인해 주세요.
      </p>
    </div>
    <BottomDiv class="flex gap-x-2">
      <Button color="gray" onclick={onRetryClick} class="flex-1">다시 저장할래요</Button>
      <Button onclick={onContinueClick} class="flex-1">잘 저장되었어요</Button>
    </BottomDiv>
  </FullscreenDiv>
</BottomSheet>
