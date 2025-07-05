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
    thumbnail?: string;
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
</script>

{#snippet iconSnippet()}
  <div class="flex h-10 w-10 items-center justify-center overflow-y-hidden text-xl">
    {#if thumbnail}
      <img src={thumbnail} alt={name} loading="lazy" />
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
