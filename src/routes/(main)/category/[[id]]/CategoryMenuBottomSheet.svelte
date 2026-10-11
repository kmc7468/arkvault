<script lang="ts">
  import { BottomSheet, CategoryLabel, IconEntryButton } from "#lib/ui/index.js";
  import { useContext } from "./service.svelte";

  import IconEdit from "~icons/material-symbols/edit";
  import IconDelete from "~icons/material-symbols/delete";

  interface Props {
    isOpen: boolean;
    onDeleteClick: () => void;
    onRenameClick: () => void;
  }

  let { isOpen = $bindable(), onDeleteClick, onRenameClick }: Props = $props();
  let context = useContext();
</script>

{#if context.selectedCategory}
  {@const { name } = context.selectedCategory}
  <BottomSheet bind:isOpen class="p-4">
    <CategoryLabel {name} class="h-12 p-2" textClass="font-semibold!" />
    <div class="my-2 h-px w-full bg-gray-200"></div>
    <IconEntryButton icon={IconEdit} onclick={onRenameClick} class="h-12 w-full">
      이름 바꾸기
    </IconEntryButton>
    <IconEntryButton icon={IconDelete} onclick={onDeleteClick} class="h-12 w-full text-red-500">
      삭제하기
    </IconEntryButton>
  </BottomSheet>
{/if}
