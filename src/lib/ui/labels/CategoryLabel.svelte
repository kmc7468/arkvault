<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import { IconLabel } from "#lib/ui/index.ts";

  import IconCategory from "~icons/material-symbols/category";

  interface Props {
    class?: ClassValue;
    name: string;
    subtext?: string;
    textClass?: ClassValue;
  }

  let { class: className, name, subtext, textClass: textClassName }: Props = $props();
</script>

{#snippet subtextSnippet()}
  {subtext}
{/snippet}

<IconLabel
  icon={IconCategory}
  subtext={subtext ? subtextSnippet : undefined}
  class={className}
  textClass={textClassName}
>
  {name}
</IconLabel>
