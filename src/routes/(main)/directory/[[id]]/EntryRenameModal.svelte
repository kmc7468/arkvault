<script lang="ts">
  import { RenameModal } from "#lib/ui/index.js";
  import { useContext } from "./service.svelte";

  interface Props {
    isOpen: boolean;
    onRenameClick: (newName: string) => Promise<boolean>;
  }

  let { isOpen = $bindable(), onRenameClick }: Props = $props();
  let context = useContext();
</script>

{#if context.selectedEntry}
  {@const { name } = context.selectedEntry}
  <RenameModal bind:isOpen originalName={name} {onRenameClick} />
{/if}
