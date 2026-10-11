<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { fly } from "svelte/transition";
  import { goto } from "$app/navigation";

  import IconFavorite from "~icons/material-symbols/favorite";
  import IconFavoriteOutline from "~icons/material-symbols/favorite-outline";
  import IconFolderOpen from "~icons/material-symbols/folder-open";
  import IconCloudDownload from "~icons/material-symbols/cloud-download";

  interface Props {
    directoryId?: "root" | number;
    isFavorite?: boolean;
    isOpen: boolean;
    onDownloadClick?: () => void;
    onToggleFavorite?: () => void;
  }

  let {
    directoryId,
    isFavorite,
    isOpen = $bindable(),
    onDownloadClick,
    onToggleFavorite,
  }: Props = $props();
</script>

<svelte:window onclick={() => (isOpen = false)} />

{#if isOpen && (directoryId || onDownloadClick || isFavorite !== undefined)}
  <div
    class="absolute top-full right-2 z-20 min-w-44 space-y-1 rounded-lg bg-white px-1 py-2 shadow-2xl"
    transition:fly={{ y: -8, duration: 200 }}
  >
    <p class="px-3 pt-2 text-sm font-semibold text-gray-600">더보기</p>
    <div class="flex flex-col">
      {#snippet menuButton(
        Icon: Component<SvelteHTMLElements["svg"]>,
        text: string,
        onclick: () => void,
      )}
        <button {onclick} class="rounded-xl active:bg-gray-100">
          <div
            class="flex items-center gap-x-3 px-3 py-2 text-lg text-gray-700 transition active:scale-95"
          >
            <Icon />
            <p class="font-medium">{text}</p>
          </div>
        </button>
      {/snippet}

      {#if isFavorite !== undefined}
        {@render menuButton(
          isFavorite ? IconFavorite : IconFavoriteOutline,
          isFavorite ? "즐겨찾기 해제" : "즐겨찾기",
          onToggleFavorite ?? (() => {}),
        )}
      {/if}
      {#if directoryId}
        {@render menuButton(IconFolderOpen, "폴더에서 보기", () =>
          goto(
            directoryId === "root" ? "/directory?from=file" : `/directory/${directoryId}?from=file`,
          ),
        )}
      {/if}
      {#if onDownloadClick}
        {@render menuButton(IconCloudDownload, "다운로드", onDownloadClick)}
      {/if}
    </div>
  </div>
{/if}
