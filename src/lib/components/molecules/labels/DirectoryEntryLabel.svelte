<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import { IconLabel } from "$lib/components/molecules";

  import IconFolder from "~icons/material-symbols/folder";
  import IconDriveFolderUpload from "~icons/material-symbols/drive-folder-upload";
  import IconDraft from "~icons/material-symbols/draft";
  import IconFavorite from "~icons/material-symbols/favorite";

  interface Props {
    class?: ClassValue;
    isFavorite?: boolean;
    name: string;
    subtext?: string;
    textClass?: ClassValue;
    thumbnail?: string;
    type: "directory" | "parent-directory" | "file";
  }

  let {
    class: className,
    isFavorite = false,
    name,
    subtext,
    textClass: textClassName,
    thumbnail,
    type,
  }: Props = $props();
</script>

{#snippet iconSnippet()}
  <div class="relative flex h-10 w-10 items-center justify-center text-xl">
    {#if thumbnail}
      <img src={thumbnail} alt={name} loading="lazy" class="aspect-square rounded object-cover" />
    {:else if type === "directory"}
      <IconFolder />
    {:else if type === "parent-directory"}
      <IconDriveFolderUpload class="text-yellow-500" />
    {:else}
      <IconDraft class="text-blue-400" />
    {/if}
    {#if isFavorite}
      <div class={["absolute bottom-0 right-0", !thumbnail && "rounded-full bg-white p-0.5"]}>
        <IconFavorite
          class="text-xs text-red-500"
          style="filter: drop-shadow(0 0 1px white) drop-shadow(0 0 1px white);"
        />
      </div>
    {/if}
  </div>
{/snippet}

{#snippet subtextSnippet()}
  {subtext}
{/snippet}

<IconLabel
  {iconSnippet}
  subtext={subtext ? subtextSnippet : undefined}
  class={className}
  textClass={textClassName}
>
  {name}
</IconLabel>
