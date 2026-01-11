<script lang="ts">
  import FileSaver from "file-saver";
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { fly } from "svelte/transition";
  import { goto } from "$app/navigation";

  import IconFolderOpen from "~icons/material-symbols/folder-open";
  import IconCloudDownload from "~icons/material-symbols/cloud-download";

  interface Props {
    directoryId?: "root" | number;
    downloadUrl?: string;
    fileBlob?: Blob;
    filename?: string;
    isOpen: boolean;
  }

  let { directoryId, downloadUrl, fileBlob, filename, isOpen = $bindable() }: Props = $props();

  const handleDownload = () => {
    if (fileBlob && filename) {
      FileSaver.saveAs(fileBlob, filename);
    } else if (downloadUrl && filename) {
      // Use streaming download via Content-Disposition header
      const url = new URL(downloadUrl, window.location.origin);
      url.searchParams.set("download", filename);
      window.open(url.toString(), "_blank");
    }
  };
</script>

<svelte:window onclick={() => (isOpen = false)} />

{#if isOpen && (directoryId || downloadUrl || fileBlob)}
  <div
    class="absolute right-2 top-full z-20 space-y-1 rounded-lg bg-white px-1 py-2 shadow-2xl"
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

      {#if directoryId}
        {@render menuButton(IconFolderOpen, "폴더에서 보기", () =>
          goto(
            directoryId === "root" ? "/directory?from=file" : `/directory/${directoryId}?from=file`,
          ),
        )}
      {/if}
      {#if fileBlob || downloadUrl}
        {@render menuButton(IconCloudDownload, "다운로드", handleDownload)}
      {/if}
    </div>
  </div>
{/if}
