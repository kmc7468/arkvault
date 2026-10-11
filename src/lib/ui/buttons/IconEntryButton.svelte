<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";
  import IconLabel from "../labels/IconLabel.svelte";
  import EntryButton from "./EntryButton.svelte";

  interface Props {
    children: Snippet;
    class?: ClassValue;
    icon: Component<SvelteHTMLElements["svg"]>;
    iconClass?: ClassValue;
    onclick?: () => void;
    textClass?: ClassValue;
  }

  let {
    children,
    class: className,
    icon,
    iconClass: iconClassName,
    onclick,
    textClass: textClassName,
  }: Props = $props();
</script>

<EntryButton {onclick} class={className}>
  <IconLabel {icon} class="h-full" iconClass={iconClassName} textClass={textClassName}>
    {@render children()}
  </IconLabel>
</EntryButton>
