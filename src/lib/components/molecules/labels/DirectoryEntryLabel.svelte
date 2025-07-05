<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import { IconLabel } from "$lib/components/molecules";

  import IconFolder from "~icons/material-symbols/folder";
  import IconDraft from "~icons/material-symbols/draft";

  interface Props {
    class?: ClassValue;
    name: string;
    subtext?: string;
    textClass?: ClassValue;
    thumbnail?: ArrayBuffer;
    type: "directory" | "file";
  }

  let {
    class: className,
    name,
    subtext,
    textClass: textClassName,
    thumbnail,
    type,
  }: Props = $props();

  let thumbnailUrl: string | undefined = $state();

  $effect(() => {
    thumbnailUrl = thumbnail && URL.createObjectURL(new Blob([thumbnail]));
    return () => thumbnailUrl && URL.revokeObjectURL(thumbnailUrl);
  });
</script>

{#snippet iconSnippet()}
  <div class="flex h-10 w-10 items-center justify-center overflow-y-hidden text-xl">
    {#if thumbnailUrl}
      <img src={thumbnailUrl} alt={name} loading="lazy" />
    {:else if type === "directory"}
      <IconFolder />
    {:else}
      <IconDraft />
    {/if}
  </div>
{/snippet}

{#snippet subtextSnippet()}
  {subtext}
{/snippet}

<IconLabel
  icon={iconSnippet}
  iconClass={type === "file" ? "text-blue-400" : undefined}
  subtext={subtext ? subtextSnippet : undefined}
  class={className}
  textClass={textClassName}
>
  {name}
</IconLabel>
