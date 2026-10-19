<script lang="ts">
  import TextInput from "../inputs/TextInput.svelte";
  import ActionModal, { type ConfirmHandler } from "./ActionModal.svelte";

  interface Props {
    defaultValue?: string;
    isOpen: boolean;
    onbeforeclose?: () => void;
    onSubmitClick: (value: string) => ReturnType<ConfirmHandler>;
    placeholder: string;
    submitText: string;
    title: string;
  }

  let {
    defaultValue = "",
    isOpen = $bindable(),
    onbeforeclose,
    onSubmitClick,
    placeholder,
    submitText,
    title,
  }: Props = $props();

  let value = $state("");

  $effect.pre(() => {
    if (isOpen) {
      value = defaultValue;
    }
  });
</script>

<ActionModal
  bind:isOpen
  {onbeforeclose}
  {title}
  confirmText={submitText}
  onConfirmClick={() => onSubmitClick(value)}
>
  <TextInput bind:value {placeholder} class="mb-3" />
</ActionModal>
