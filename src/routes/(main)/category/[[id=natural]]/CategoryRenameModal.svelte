<script lang="ts">
  import { RenameModal } from "#lib/ui/index.ts";
  import { useContext } from "./service.svelte.ts";

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
