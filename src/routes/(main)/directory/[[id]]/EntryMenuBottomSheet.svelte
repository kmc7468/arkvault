<script lang="ts">
  import { BottomSheet } from "$lib/components/atoms";
  import { DirectoryEntryLabel, IconEntryButton } from "$lib/components/molecules";
  import { useContext } from "./service.svelte";

  import IconFavorite from "~icons/material-symbols/favorite";
  import IconFavoriteBorder from "~icons/material-symbols/favorite-outline";
  import IconEdit from "~icons/material-symbols/edit";
  import IconDelete from "~icons/material-symbols/delete";

  interface Props {
    isOpen: boolean;
    onDeleteClick: () => void;
    onFavoriteClick: () => void;
    onRenameClick: () => void;
  }

  let { isOpen = $bindable(), onDeleteClick, onFavoriteClick, onRenameClick }: Props = $props();
  let context = useContext();
</script>

{#if context.selectedEntry}
  {@const { name, type, isFavorite } = context.selectedEntry}
  <BottomSheet bind:isOpen class="p-4">
    <DirectoryEntryLabel {type} {name} class="h-12 p-2" textClass="!font-semibold" />
    <div class="my-2 h-px w-full bg-gray-200"></div>
    <IconEntryButton
      icon={isFavorite ? IconFavorite : IconFavoriteBorder}
      onclick={onFavoriteClick}
      class="h-12 w-full"
      iconClass={isFavorite ? "text-red-500" : ""}
    >
      {isFavorite ? "즐겨찾기에서 해제하기" : "즐겨찾기에 추가하기"}
    </IconEntryButton>
    <IconEntryButton icon={IconEdit} onclick={onRenameClick} class="h-12 w-full">
      이름 바꾸기
    </IconEntryButton>
    <IconEntryButton icon={IconDelete} onclick={onDeleteClick} class="h-12 w-full text-red-500">
      삭제하기
    </IconEntryButton>
  </BottomSheet>
{/if}
