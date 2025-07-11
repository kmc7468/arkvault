<script module lang="ts">
  export type ConfirmHandler = () => void | Promise<void> | boolean | Promise<boolean>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button, Modal } from "$lib/components/atoms";

  interface Props {
    cancelText?: string;
    children: Snippet;
    confirmText: string;
    isOpen: boolean;
    onbeforeclose?: () => void;
    oncancel?: () => void;
    onConfirmClick: ConfirmHandler;
    title: string;
  }

  let {
    cancelText = "닫기",
    children,
    confirmText,
    isOpen = $bindable(),
    onbeforeclose,
    oncancel,
    onConfirmClick,
    title,
  }: Props = $props();

  const closeModal = () => {
    onbeforeclose?.();
    isOpen = false;
  };

  const cancelAction = () => {
    oncancel?.();
    closeModal();
  };

  const confirmAction = async () => {
    if ((await onConfirmClick()) !== false) {
      closeModal();
    }
  };
</script>

<Modal bind:isOpen onclose={cancelAction} class="space-y-4">
  <div class="flex flex-col gap-y-2 break-keep">
    <p class="text-xl font-bold">{title}</p>
    {@render children()}
  </div>
  <div class="flex gap-x-2">
    <Button color="gray" onclick={cancelAction} class="flex-1">{cancelText}</Button>
    <Button onclick={confirmAction} class="flex-1">{confirmText}</Button>
  </div>
</Modal>
