<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";
  import { IconEntryButton } from "#lib/components/molecules/index.js";

  interface Props {
    children: Snippet;
    icon: Component<SvelteHTMLElements["svg"]>;
    iconColor: ClassValue;
    onclick: () => void;
  }

  let { children, icon, iconColor, onclick }: Props = $props();
</script>

<IconEntryButton
  {icon}
  {onclick}
  class="w-full"
  iconClass={["rounded-lg bg-gray-200 p-1 text-base!", iconColor]}
>
  {@render children()}
</IconEntryButton>
