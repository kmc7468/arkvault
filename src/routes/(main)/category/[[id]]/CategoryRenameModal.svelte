<script lang="ts">
  import { RenameModal } from "#lib/components/organisms/index.js";
  import { useContext } from "./service.svelte";

  interface Props {
    isOpen: boolean;
    onRenameClick: (newName: string) => Promise<boolean>;
  }

  let { isOpen = $bindable(), onRenameClick }: Props = $props();
  let context = useContext();
</script>

{#if context.selectedCategory}
  {@const { name } = context.selectedCategory}
  <RenameModal bind:isOpen originalName={name} {onRenameClick} />
{/if}
